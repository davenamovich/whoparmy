import "server-only";
import { db } from "@/lib/db";
import { partnerNameSync } from "@/lib/offer-catalog";
import {
  DAILY_TRAFFIC_SLOTS,
  decideTrafficPools,
  spotAllotmentPerAgent,
  type SpotDemandInputs,
  type TrafficPoolDecision,
  placementAgentMap,
} from "@/lib/traffic-pool-core";
import {
  spotWindowFor,
  spotWindowKeyForPlacementDate,
  type SpotWindow,
} from "@/lib/rotator-market";

/**
 * ─── TRAFFIC POOL — server layer ───────────────────────────────────
 *
 * Dave's rule (2026-11-19): every agent has a daily traffic pool of
 * 10 placement-slots (flat, every agent, every plan) and a brand
 * behind it — the member's business profile and saved links. The
 * pool is worked through the rotator's free-placement path; the pure
 * attribution lives in traffic-pool-core.ts.
 *
 * Spot windows (Dave, 2026-11-21): pool spots live on the 23:50 ET
 * clock, NOT the calendar day — a window runs 23:50 ET → 23:50 ET
 * and is keyed by the ET date it opens on. A placement dated D is
 * governed by window D−1 (the window already open when D begins).
 * The window math lives in traffic-pool-core.ts; this layer only
 * persists and reads outcomes. The auction day stays calendar-day
 * (lib/rotator.ts) — the two clocks are separate on purpose.
 *
 * The window's outcome is recorded in AgentTrafficDay (one row per
 * agent per WINDOW KEY in `date`) whenever the live window's pool is
 * computed, so reports can count pool usage without re-deriving it.
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

// ─── Allotment (the ONE policy point, fed with real demand) ────────

export interface SpotAllotmentState {
  /** Spots per agent for a window, from the policy point. */
  allotment: number;
  /** The real demand inputs the policy was fed. */
  inputs: SpotDemandInputs;
}

const ALLOTMENT_MEMO_MS = 60_000;
let allotmentMemo: { at: number; value: SpotAllotmentState } | null = null;

/**
 * The current spot allotment, through the ONE policy point
 * (spotAllotmentPerAgent in traffic-pool-core.ts). Its inputs are
 * measured from live tables: working agents system-wide, and counted
 * serves through agent rotators over the trailing 7 days. Memoized for a
 * minute — the rotator serve path calls this on every pool decision,
 * and the inputs move slowly. Today the policy returns the flat 10;
 * the plumbing is what makes a future demand curve a one-line change.
 */
export async function getSpotAllotment(now = new Date()): Promise<SpotAllotmentState> {
  if (allotmentMemo && now.getTime() - allotmentMemo.at < ALLOTMENT_MEMO_MS) {
    return allotmentMemo.value;
  }
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [activeAgents, countedHops7d] = await Promise.all([
    db.hiredAgent.count({
      where: { status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    // Demand = counted serves through agent rotators (AGENT +
    // ALLOCATOR surfaces) — the same definition the public stats
    // use; marketplace impressions are not demand on the pool.
    db.rotatorHop.count({
      where: { counted: true, surface: { in: ["AGENT", "ALLOCATOR"] }, ts: { gte: sevenDaysAgo } },
    }),
  ]);
  const inputs: SpotDemandInputs = { activeAgents, countedHops7d };
  const value: SpotAllotmentState = { allotment: spotAllotmentPerAgent(inputs), inputs };
  allotmentMemo = { at: now.getTime(), value };
  return value;
}

/** The current spot window + the allotments on either side of it. */
export async function getSpotWindowState(now = new Date()): Promise<{
  window: SpotWindow;
  allotment: number;
  nextWindowAllotment: number;
  inputs: SpotDemandInputs;
}> {
  const { allotment, inputs } = await getSpotAllotment(now);
  return {
    window: spotWindowFor(now),
    allotment,
    // The next window's allotment is the policy read at the same
    // measured inputs — it is recomputed when that window opens.
    nextWindowAllotment: allotment,
    inputs,
  };
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
  // Only the LIVE window is recorded, keyed by its window key: a
  // future placement day's attribution can still change as agents
  // are hired/paused, and a past window was recorded while it was
  // live. A placement date is live in exactly two senses — its
  // governing window is the current window (true all through its
  // serving day, and from 23:50 the evening before), or it is
  // today's ET calendar date (covers the 23:50–24:00 tail, when the
  // next window has opened but the day's placements still rotate).
  const now = new Date();
  const windowKey = spotWindowKeyForPlacementDate(date);
  if (windowKey !== spotWindowFor(now).key && date !== trafficEtDateString(now)) return;
  try {
    for (const userId of userIds) {
      for (const [agentId, state] of decision.states) {
        if (agentOwner.get(agentId) !== userId) continue;
        await db.agentTrafficDay.upsert({
          where: { agentId_date: { agentId, date: windowKey } },
          create: { agentId, userId, date: windowKey, slotsUsed: state.used },
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
): Promise<{ decision: TrafficPoolDecision; placementsById: Map<string, PlacementRow>; allotment: number }> {
  const unique = [...new Set(userIds)];
  const [agents, placements, { allotment }] = await Promise.all([
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
    getSpotAllotment(),
  ]);
  const decision = decideTrafficPools(agents, placements, allotment);
  const agentOwner = new Map<string, string>();
  for (const a of agents) agentOwner.set(a.id, a.userId);
  await recordTrafficDays(unique, date, decision, agentOwner);
  const placementsById = new Map<string, PlacementRow>();
  for (const p of placements) placementsById.set(p.id, p);
  return { decision, placementsById, allotment };
}

function toView(
  agentId: string,
  date: string,
  decision: TrafficPoolDecision,
  placementsById: Map<string, PlacementRow>,
  allotment: number = DAILY_TRAFFIC_SLOTS,
): AgentTrafficPoolView {
  const state = decision.states.get(agentId);
  const nameOf = (k: string) => partnerNameSync(k);
  return {
    agentId,
    date,
    total: state?.total ?? allotment,
    used: state?.used ?? 0,
    remaining: state?.remaining ?? allotment,
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
  const { decision, placementsById, allotment } = await computeForUsers([agent.userId], date);
  return toView(agentId, date, decision, placementsById, allotment);
}

/** Every agent of one member, keyed by agent id — the control-center read. */
export async function getTrafficPoolsForUser(
  userId: string,
  date: string = trafficEtDateString(),
): Promise<Record<string, AgentTrafficPoolView>> {
  const agents = await db.hiredAgent.findMany({ where: { userId }, select: { id: true } });
  const { decision, placementsById, allotment } = await computeForUsers([userId], date);
  const out: Record<string, AgentTrafficPoolView> = {};
  for (const a of agents) out[a.id] = toView(a.id, date, decision, placementsById, allotment);
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
