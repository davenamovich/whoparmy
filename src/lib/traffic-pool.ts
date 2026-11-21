import "server-only";
import { db } from "@/lib/db";
import { partnerNameSync } from "@/lib/offer-catalog";
import {
  DAILY_TRAFFIC_SLOTS,
  decideTrafficPools,
  type TrafficPoolDecision,
  placementAgentMap,
} from "@/lib/traffic-pool-core";

/**
 * ─── TRAFFIC POOL — server layer ───────────────────────────────────
 *
 * Dave's rule (2026-11-19): every agent has a daily traffic pool of
 * 10 placement-slots (flat, every agent, every plan) and a brand
 * behind it — the member's business profile and saved links. The
 * pool is worked through the rotator's free-placement path; the pure
 * attribution lives in traffic-pool-core.ts.
 *
 * Day boundary: the rotator's ET day (America/New_York), same as
 * lib/rotator.ts and lib/bridge.ts — the formatter is duplicated here
 * (bridge.ts precedent) to keep the import graph one-directional:
 * rotator → traffic-pool → db/bridge.
 *
 * The day's outcome is recorded in AgentTrafficDay (one row per
 * agent per ET date) whenever today's pool is computed, so the
 * weekly report can count pool usage without re-deriving it.
 * Recording is best-effort: a failed write never breaks the rotator
 * or an agent read.
 */

const ET = "America/New_York";

export function trafficEtDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export interface AgentTrafficPoolView {
  agentId: string;
  date: string;
  total: number;
  used: number;
  remaining: number;
  placements: Array<{ partner: string; partnerName: string; url: string | null }>;
}

interface PlacementRow {
  id: string;
  userId: string;
  partner: string;
  url: string | null;
  createdAt: Date;
}

async function recordTrafficDays(
  userIds: string[],
  date: string,
  decision: TrafficPoolDecision,
  agentOwner: Map<string, string>,
): Promise<void> {
  // Only TODAY is recorded: a future day's attribution can still
  // change as agents are hired/paused, and a past day was recorded
  // when it was today. (String compare works on yyyy-mm-dd.)
  if (date !== trafficEtDateString()) return;
  try {
    for (const userId of userIds) {
      for (const [agentId, state] of decision.states) {
        if (agentOwner.get(agentId) !== userId) continue;
        await db.agentTrafficDay.upsert({
          where: { agentId_date: { agentId, date } },
          create: { agentId, userId, date, slotsUsed: state.used },
          update: { slotsUsed: state.used },
        });
      }
    }
  } catch (err) {
    console.error("[traffic-pool] recording AgentTrafficDay failed:", err);
  }
}

async function computeForUsers(
  userIds: string[],
  date: string,
): Promise<{ decision: TrafficPoolDecision; placementsById: Map<string, PlacementRow> }> {
  const unique = [...new Set(userIds)];
  const [agents, placements] = await Promise.all([
    unique.length
      ? db.hiredAgent.findMany({
          where: { userId: { in: unique } },
          select: { id: true, userId: true, status: true, expiresAt: true, createdAt: true },
        })
      : [],
    unique.length
      ? db.rotatorPlacement.findMany({
          where: { userId: { in: unique }, date },
          select: { id: true, userId: true, partner: true, url: true, createdAt: true },
        })
      : [],
  ]);
  const decision = decideTrafficPools(agents, placements, DAILY_TRAFFIC_SLOTS);
  const agentOwner = new Map<string, string>();
  for (const a of agents) agentOwner.set(a.id, a.userId);
  await recordTrafficDays(unique, date, decision, agentOwner);
  const placementsById = new Map<string, PlacementRow>();
  for (const p of placements) placementsById.set(p.id, p);
  return { decision, placementsById };
}

function toView(
  agentId: string,
  date: string,
  decision: TrafficPoolDecision,
  placementsById: Map<string, PlacementRow>,
): AgentTrafficPoolView {
  const state = decision.states.get(agentId);
  const nameOf = (k: string) => partnerNameSync(k);
  return {
    agentId,
    date,
    total: state?.total ?? DAILY_TRAFFIC_SLOTS,
    used: state?.used ?? 0,
    remaining: state?.remaining ?? DAILY_TRAFFIC_SLOTS,
    placements: (state?.placementIds ?? []).flatMap((pid) => {
      const p = placementsById.get(pid);
      return p ? [{ partner: p.partner, partnerName: nameOf(p.partner), url: p.url }] : [];
    }),
  };
}

/**
 * One agent's pool for a day (default: today ET) — total, used,
 * remaining, and the placements rotating under it. Null when the
 * agent does not exist. This is the function a weekly report calls.
 */
export async function getAgentTrafficPool(
  agentId: string,
  date: string = trafficEtDateString(),
): Promise<AgentTrafficPoolView | null> {
  const agent = await db.hiredAgent.findUnique({ where: { id: agentId }, select: { id: true, userId: true } });
  if (!agent) return null;
  const { decision, placementsById } = await computeForUsers([agent.userId], date);
  return toView(agentId, date, decision, placementsById);
}

/** Every agent of one member, keyed by agent id — the control-center read. */
export async function getTrafficPoolsForUser(
  userId: string,
  date: string = trafficEtDateString(),
): Promise<Record<string, AgentTrafficPoolView>> {
  const agents = await db.hiredAgent.findMany({ where: { userId }, select: { id: true } });
  const { decision, placementsById } = await computeForUsers([userId], date);
  const out: Record<string, AgentTrafficPoolView> = {};
  for (const a of agents) out[a.id] = toView(a.id, date, decision, placementsById);
  return out;
}

/**
 * The rotator's free-placement filter: given the day's placement
 * rows, return the ones allowed to rotate under the traffic pools.
 * Auction entries never pass through here. FAIL-OPEN by design — the
 * rotator is a public path; any pool error returns the rows
 * untouched (legacy behavior) rather than breaking rotation.
 */
export async function filterPlacementsByTrafficPool<T extends PlacementRow>(placements: T[], date: string): Promise<T[]> {
  if (placements.length === 0) return placements;
  try {
    const { decision } = await computeForUsers(
      placements.map((p) => p.userId),
      date,
    );
    return placements.filter((p) => decision.allowedPlacementIds.has(p.id));
  } catch (err) {
    console.error("[traffic-pool] filter failed, serving unfiltered pool:", err);
    return placements;
  }
}

export async function getPlacementAgentAttribution(placements: Array<{ id: string; userId: string }>, date: string): Promise<Map<string, string>> {
  if (!placements.length) return new Map();
  try {
    const { decision } = await computeForUsers(placements.map((placement) => placement.userId), date);
    return placementAgentMap(decision);
  } catch (err) {
    console.error("[traffic-pool] attribution failed, serving legacy entries:", err);
    return new Map();
  }
}
