import "server-only";
import { db } from "@/lib/db";
import { AGENT_ROTATOR_SURFACES, AGENT_SERVE_SURFACE } from "@/lib/agent-stats-core";
import { bucketByEtDay, lastEtDays } from "@/lib/agent-visual";

/**
 * ─── /agents marketplace extras — server half ───────────────────────
 *
 * Two read-only additions on top of lib/agent-stats.ts, same rules:
 * COUNTED hops only (counted=true — the hop scorer already dropped
 * bots, duplicates and bursts), and only hops served THROUGH a public
 * agent's own rotator (surfaces AGENT / ALLOCATOR). Marketplace
 * impressions never count.
 *
 *  - daily: counted visitors per ET day for the trailing 7 days, per
 *    agent — the sparkline on each card.
 *  - activity: the most recent counted serves plus when each public
 *    agent joined (its creation date — there is no separate publish
 *    timestamp), newest first — the live feed. Nothing about the
 *    visitor is exposed: only which agent, what kind of serve, when.
 */

export interface DirectoryActivityItem {
  kind: "launch" | "serve" | "joined";
  agentSlug: string;
  agentName: string;
  at: string;
}

export interface DirectoryExtras {
  daily: Map<string, number[]>;
  activity: DirectoryActivityItem[];
}

const SPARK_DAYS = 7;
const ACTIVITY_LIMIT = 12;
/** Safety cap on rows read for the sparkline window. */
const SPARK_ROW_CAP = 50_000;

export async function getDirectoryExtras(
  agents: Array<{ id: string; slug: string | null; name: string; createdAt: Date }>,
  now = new Date(),
): Promise<DirectoryExtras> {
  const daily = new Map<string, number[]>();
  const days = lastEtDays(now, SPARK_DAYS);
  for (const a of agents) daily.set(a.id, days.map(() => 0));
  if (agents.length === 0) return { daily, activity: [] };

  const byId = new Map(agents.map((a) => [a.id, a]));
  const rotators = await db.agentRotator.findMany({
    where: { agentId: { in: agents.map((a) => a.id) } },
    select: { id: true, agentId: true },
  });
  const agentOfRotator = new Map(rotators.map((r) => [r.id, r.agentId]));
  const surfaces = [...AGENT_ROTATOR_SURFACES];
  const since = new Date(now.getTime() - (SPARK_DAYS + 1) * 86_400_000);

  const [windowHops, recentHops] = rotators.length
    ? await Promise.all([
        db.rotatorHop.findMany({
          where: { rotatorId: { in: [...agentOfRotator.keys()] }, counted: true, surface: { in: surfaces }, ts: { gte: since } },
          select: { rotatorId: true, ts: true },
          take: SPARK_ROW_CAP,
        }),
        db.rotatorHop.findMany({
          where: { rotatorId: { in: [...agentOfRotator.keys()] }, counted: true, surface: { in: surfaces } },
          select: { rotatorId: true, surface: true, ts: true },
          orderBy: { ts: "desc" },
          take: ACTIVITY_LIMIT,
        }),
      ])
    : [[], []];

  const tsByAgent = new Map<string, Date[]>();
  for (const hop of windowHops) {
    const agentId = hop.rotatorId ? agentOfRotator.get(hop.rotatorId) : undefined;
    if (!agentId) continue;
    const list = tsByAgent.get(agentId) ?? [];
    list.push(hop.ts);
    tsByAgent.set(agentId, list);
  }
  for (const [agentId, stamps] of tsByAgent) daily.set(agentId, bucketByEtDay(stamps, days));

  const activity: DirectoryActivityItem[] = [];
  for (const hop of recentHops) {
    const agent = hop.rotatorId ? byId.get(agentOfRotator.get(hop.rotatorId) ?? "") : undefined;
    if (!agent?.slug) continue;
    activity.push({
      kind: hop.surface === AGENT_SERVE_SURFACE ? "launch" : "serve",
      agentSlug: agent.slug,
      agentName: agent.name,
      at: hop.ts.toISOString(),
    });
  }
  for (const agent of agents) {
    if (!agent.slug) continue;
    activity.push({ kind: "joined", agentSlug: agent.slug, agentName: agent.name, at: agent.createdAt.toISOString() });
  }
  activity.sort((x, y) => y.at.localeCompare(x.at));
  return { daily, activity: activity.slice(0, ACTIVITY_LIMIT) };
}
