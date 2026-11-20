/**
 * ─── TRAFFIC POOL — pure core ──────────────────────────────────────
 *
 * Dave's rule (2026-11-19): EVERY agent has a daily traffic pool and
 * a brand behind it. Pool size DECIDED 2026-11-19: 10 placement-slots
 * per agent per day, flat for every agent regardless of plan.
 *
 * The pool is worked through the existing rotator's FREE placement
 * path (lib/rotator.ts): a member's free placements for a day are
 * their brand's entries (the member's saved EngineLinks, snapshotted
 * into RotatorPlacement rows). This module decides — deterministically
 * and without touching the DB — which of those entries rotate:
 *
 * - Entries are attributed to the member's ACTIVE agents in earned
 *   order (placements by createdAt, agents by createdAt — the oldest
 *   agent works first), one slot per entry.
 * - When every active agent's 10 slots are spent, the member's
 *   remaining entries for the day stop rotating.
 * - A member with NO active agent has no pool in play: their entries
 *   rotate exactly as they did before the pool existed (legacy).
 * - The auction winner is not a free placement and is never decided
 *   here — the auction and bidding mechanics are untouched.
 *
 * Slots never roll over and are never transferable: the decision is a
 * pure function of ONE day's placements, so a new ET day starts every
 * agent back at 10. The DB layer (lib/traffic-pool.ts) persists the
 * per-day outcome in AgentTrafficDay rows for reporting.
 */

export const DAILY_TRAFFIC_SLOTS = 10;

export interface TrafficAgentInput {
  id: string;
  userId: string;
  status: string; // ACTIVE | PAUSED | DEPLETED (HiredAgent.status)
  expiresAt: Date | null; // REFERRAL bots only — an expired grant is not active
  createdAt: Date;
}

export interface TrafficPlacementInput {
  id: string;
  userId: string;
  partner: string;
  createdAt: Date;
}

export interface AgentPoolState {
  agentId: string;
  total: number;
  used: number;
  remaining: number;
  /** Placement ids attributed to this agent for the day, in earned order. */
  placementIds: string[];
}

export interface TrafficPoolDecision {
  /** One state per agent passed in (any status). */
  states: Map<string, AgentPoolState>;
  /** Placement ids allowed to rotate for the day. */
  allowedPlacementIds: Set<string>;
}

export function placementAgentMap(decision: TrafficPoolDecision): Map<string, string> {
  const result = new Map<string, string>();
  for (const [agentId, state] of decision.states) {
    for (const placementId of state.placementIds) result.set(placementId, agentId);
  }
  return result;
}

function byCreatedThenId<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  const dt = a.createdAt.getTime() - b.createdAt.getTime();
  return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isWorkingAgent(a: TrafficAgentInput, now: Date): boolean {
  return a.status === "ACTIVE" && (a.expiresAt === null || a.expiresAt.getTime() > now.getTime());
}

export function decideTrafficPools(
  agents: TrafficAgentInput[],
  placements: TrafficPlacementInput[],
  slotsPerAgent: number = DAILY_TRAFFIC_SLOTS,
  now: Date = new Date(),
): TrafficPoolDecision {
  const states = new Map<string, AgentPoolState>();
  for (const a of agents) {
    states.set(a.id, { agentId: a.id, total: slotsPerAgent, used: 0, remaining: slotsPerAgent, placementIds: [] });
  }

  const allowed = new Set<string>();
  const placementsByUser = new Map<string, TrafficPlacementInput[]>();
  for (const p of placements) {
    const list = placementsByUser.get(p.userId) ?? [];
    list.push(p);
    placementsByUser.set(p.userId, list);
  }
  const agentsByUser = new Map<string, TrafficAgentInput[]>();
  for (const a of agents) {
    const list = agentsByUser.get(a.userId) ?? [];
    list.push(a);
    agentsByUser.set(a.userId, list);
  }

  for (const [userId, userPlacements] of placementsByUser) {
    const working = (agentsByUser.get(userId) ?? []).filter((a) => isWorkingAgent(a, now)).sort(byCreatedThenId);
    const ordered = [...userPlacements].sort(byCreatedThenId);
    if (working.length === 0) {
      // No agent is working this member's traffic — the pool is not
      // in play and the entries rotate exactly as before (legacy).
      for (const p of ordered) allowed.add(p.id);
      continue;
    }
    let cursor = 0;
    for (const p of ordered) {
      while (cursor < working.length && states.get(working[cursor].id)!.remaining <= 0) cursor++;
      if (cursor >= working.length) break; // every agent's pool is spent — the rest stop rotating
      const state = states.get(working[cursor].id)!;
      state.used += 1;
      state.remaining -= 1;
      state.placementIds.push(p.id);
      allowed.add(p.id);
    }
  }

  return { states, allowedPlacementIds: allowed };
}
