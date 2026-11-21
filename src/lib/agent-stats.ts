import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_SITE_ORIGIN } from "@/lib/agent-profile";
import {
  buildSpotBlock,
  resolveHouseCta,
  summarizeAgentHops,
  summarizePool,
  type HopSurfaceGroup,
  type PublicAgentAccess,
  type PublicAgentStats,
  type PublicPoolSummary,
} from "@/lib/agent-stats-core";
import {
  decideTrafficPools,
  type TrafficAgentInput,
} from "@/lib/traffic-pool-core";
import {
  etDateStringFrom,
  placementDateForSpotWindow,
  spotWindowFor,
} from "@/lib/rotator-market";
import { getSpotAllotment } from "@/lib/traffic-pool";
import {
  isAgentWorking,
  mintAgentRotatorCode,
  resolveSigningSecret,
  rotatorV2Enabled,
} from "@/lib/rotator-v2-core";

/**
 * ─── PUBLIC AGENT STATS — server layer ──────────────────────────────
 *
 * Backs the stats + access blocks on /agents, /agent/{slug} and
 * /api/agents/public (definitions live in agent-stats-core.ts —
 * counted hops only, filtered traffic never counts).
 *
 * Bulk by construction: the directory calls this ONCE with every
 * public agent id. Hops aggregate in two groupBy queries; placement
 * attribution loads each owner's placements once (bounded — a
 * member holds at most one RotatorPlacement per partner) and runs
 * the pool's own pure decision per (owner, placement date), so the
 * public numbers can never disagree with what the rotator serves.
 */

export interface PublicAgentBundle {
  stats: PublicAgentStats;
  access: PublicAgentAccess;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function getPublicAgentBundles(
  agentIds: string[],
  now = new Date(),
): Promise<Map<string, PublicAgentBundle>> {
  const out = new Map<string, PublicAgentBundle>();
  const ids = [...new Set(agentIds)];
  if (ids.length === 0) return out;

  const window = spotWindowFor(now);
  const windowPlacementDate = placementDateForSpotWindow(window.key);
  const todayEt = etDateStringFrom(now);
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

  const [agents, { allotment }, rotators] = await Promise.all([
    db.hiredAgent.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true, status: true, expiresAt: true, createdAt: true },
    }),
    getSpotAllotment(now),
    db.agentRotator.findMany({
      where: { agentId: { in: ids } },
      select: { id: true, agentId: true, enabled: true },
    }),
  ]);

  // ── Hops, merged per agent per surface ────────────────────────────
  // Keyed by ROTATOR, not by the hop's agentId: a counted hop counts
  // toward an agent's stats only when it was served through that
  // agent's rotator (rotatorId = its AgentRotator row). Marketplace
  // hops carry an agentId for placement attribution but have
  // rotatorId null — they are the marketplace's traffic, never the
  // agent's (definitions in agent-stats-core.ts).
  const rotatorIds = rotators.map((r) => r.id);
  const agentOfRotator = new Map(rotators.map((r) => [r.id, r.agentId]));
  const [hopAllTime, hop7d] = rotatorIds.length
    ? await Promise.all([
        db.rotatorHop.groupBy({
          by: ["rotatorId", "surface"],
          where: { rotatorId: { in: rotatorIds }, counted: true },
          _count: { _all: true },
        }),
        db.rotatorHop.groupBy({
          by: ["rotatorId", "surface"],
          where: { rotatorId: { in: rotatorIds }, counted: true, ts: { gte: sevenDaysAgo } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const hopGroups = new Map<string, Map<string, HopSurfaceGroup>>();
  const addHop = (rotatorId: string | null, surface: string, count: number, recent: boolean) => {
    const agentId = rotatorId ? agentOfRotator.get(rotatorId) : undefined;
    if (!agentId) return;
    let perAgent = hopGroups.get(agentId);
    if (!perAgent) hopGroups.set(agentId, (perAgent = new Map()));
    const group = perAgent.get(surface) ?? { surface, allTime: 0, last7d: 0 };
    if (recent) group.last7d += count;
    else group.allTime += count;
    perAgent.set(surface, group);
  };
  for (const row of hopAllTime) addHop(row.rotatorId, row.surface, row._count._all, false);
  for (const row of hop7d) addHop(row.rotatorId, row.surface, row._count._all, true);

  // ── Placement attribution (the pool's own decision, per date) ────
  const ownerIds = [...new Set(agents.map((a) => a.userId))];
  const [ownerAgents, ownerPlacements, ownerCtaLinks] = await Promise.all([
    ownerIds.length
      ? db.hiredAgent.findMany({
          where: { userId: { in: ownerIds } },
          select: { id: true, userId: true, status: true, expiresAt: true, createdAt: true },
        })
      : [],
    ownerIds.length
      ? db.rotatorPlacement.findMany({
          where: { userId: { in: ownerIds } },
          select: { id: true, userId: true, partner: true, date: true, createdAt: true },
        })
      : [],
    // House-CTA owner links (Dave, 2026-11-21): the owner's own
    // Muse / Agent37 EngineLinks — populated when their Muse
    // connected via the bridge and synced their P&R offers — win
    // over the house fallback URLs, per link. Canonical partner
    // keys win over legacy spellings when both somehow exist.
    ownerIds.length
      ? db.engineLink.findMany({
          where: { userId: { in: ownerIds }, partner: { in: ["muse", "agent37_ref", "agent37"] } },
          select: { userId: true, partner: true, url: true },
        })
      : [],
  ]);
  const ctaByOwner = new Map<string, { museUrl?: string; agent37Url?: string }>();
  for (const link of ownerCtaLinks) {
    const entry = ctaByOwner.get(link.userId) ?? {};
    if (link.partner === "muse") entry.museUrl = link.url;
    else if (link.partner === "agent37_ref") entry.agent37Url = link.url;
    else if (link.partner === "agent37" && !entry.agent37Url) entry.agent37Url = link.url;
    ctaByOwner.set(link.userId, entry);
  }
  const agentsByOwner = new Map<string, TrafficAgentInput[]>();
  for (const a of ownerAgents) {
    const list = agentsByOwner.get(a.userId) ?? [];
    list.push(a);
    agentsByOwner.set(a.userId, list);
  }
  const placementsByOwnerDate = new Map<string, typeof ownerPlacements>();
  for (const p of ownerPlacements) {
    const key = `${p.userId}|${p.date}`;
    const list = placementsByOwnerDate.get(key) ?? [];
    list.push(p);
    placementsByOwnerDate.set(key, list);
  }
  const placementsRun = new Map<string, number>();
  const placementsToday = new Map<string, number>();
  const windowUsed = new Map<string, number>();
  const bump = (map: Map<string, number>, agentId: string, n: number) =>
    map.set(agentId, (map.get(agentId) ?? 0) + n);
  for (const [key, placements] of placementsByOwnerDate) {
    const userId = key.slice(0, key.lastIndexOf("|"));
    const date = key.slice(key.lastIndexOf("|") + 1);
    const decision = decideTrafficPools(agentsByOwner.get(userId) ?? [], placements, allotment, now);
    for (const [agentId, state] of decision.states) {
      if (state.placementIds.length === 0) continue;
      bump(placementsRun, agentId, state.placementIds.length);
      if (date === todayEt) bump(placementsToday, agentId, state.placementIds.length);
      if (date === windowPlacementDate) bump(windowUsed, agentId, state.placementIds.length);
    }
  }

  // ── Rotator access ────────────────────────────────────────────────
  const secret = resolveSigningSecret(process.env);
  const servingOn = rotatorV2Enabled(process.env);
  const rotatorByAgent = new Map(rotators.map((r) => [r.agentId, r]));

  for (const agent of agents) {
    const hops = summarizeAgentHops([...(hopGroups.get(agent.id)?.values() ?? [])]);
    const active = isAgentWorking(agent.status, agent.expiresAt, now);
    const stats: PublicAgentStats = {
      ...hops,
      placementsRun: placementsRun.get(agent.id) ?? 0,
      placementsActiveToday: placementsToday.get(agent.id) ?? 0,
      spots: buildSpotBlock({
        window,
        allotment,
        nextWindowAllotment: allotment,
        used: windowUsed.get(agent.id) ?? 0,
        active,
      }),
    };

    const rotator = rotatorByAgent.get(agent.id);
    let access: PublicAgentAccess["rotator"];
    if (!rotator) {
      access = { state: "not-set-up", serveUrl: null };
    } else if (!rotator.enabled) {
      access = { state: "disabled", serveUrl: null };
    } else if (!servingOn || !secret) {
      // The /r/a route 404s while rotator v2 serving is off — show
      // the honest state instead of a link that would dead-end.
      access = { state: "unavailable", serveUrl: null };
    } else {
      access = {
        state: "live",
        serveUrl: `${PUBLIC_SITE_ORIGIN}/r/a/${mintAgentRotatorCode(rotator.id, secret)}`,
      };
    }

    out.set(agent.id, {
      stats,
      access: {
        rotator: access,
        dailyRotatorUrl: "/rotator",
        ownRotatorUrl: "/bridge",
        houseCta: resolveHouseCta(ctaByOwner.get(agent.userId) ?? {}),
      },
    });
  }
  return out;
}

/** Pool-wide open spots across the given (public) agents, for the
 *  /agents header and the public API's pool block. */
export async function getPublicPoolSummary(
  bundles: Map<string, PublicAgentBundle>,
  now = new Date(),
): Promise<PublicPoolSummary> {
  return summarizePool(spotWindowFor(now), [...bundles.values()].map((b) => b.stats.spots));
}
