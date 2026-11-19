/**
 * ─── BTC BARRY — agent record, pure core ───────────────────────────
 *
 * Dave's rule (2026-11-19): BTC Barry is available to every Whop
 * Army member who saves their DH Media link — and like every agent,
 * Barry holds a daily traffic pool (Traffic Pool v1). But a stack
 * launch only mints a bridge code: Barry lived in the member's own
 * Muse with NO HiredAgent row, so he held no pool and appeared
 * nowhere on the member's roster. Dave approved closing that gap
 * (2026-11-19): a successful btc-experiment launch creates Barry's
 * agent record.
 *
 * This module is the pure half (the traffic-pool-core precedent):
 * the exact hire shape a launch creates, and the idempotency rule —
 * ONE Barry per member, ever. The server half (lib/barry-agent.ts)
 * does the find-or-create against the DB.
 *
 * Field choices follow the factory hire path (POST /api/agents,
 * lib/blueprint.ts) wherever the schema has a hire convention:
 * - status ACTIVE from birth — an ACTIVE hire with no expiry is a
 *   working agent under the pool core's rules, so Barry holds his
 *   10 slots/day exactly like any other agent.
 * - expiresAt null — Barry is not a 24h REFERRAL grant; nothing
 *   about him lapses.
 * - source "STACK" — he was neither rented (RENTAL) nor earned as a
 *   referral bot (REFERRAL); he arrived via a stack launch.
 * - instructions / toolsJson null — Barry's real instructions are
 *   the stack prompt handed over at launch (it carries a one-time
 *   bridge code and is never stored); he is not a factory CUSTOM
 *   build with standing instructions or a tool selection.
 * - tokenBudget is the caller's to supply (the server half passes
 *   internalBotBudget(plan), the same internal ops cap every hire
 *   carries — Barry himself runs on the member's own credits
 *   through the bridge).
 */

export const BARRY_TEMPLATE_KEY = "btc-barry";
export const BARRY_AGENT_NAME = "BTC Barry";
export const BARRY_SOURCE = "STACK";
export const BARRY_ROLE =
  "The BTC Experiment agent — runs your DH Media experiment from your own Muse: research, content, distribution through the daily traffic pool, and a plain-numbers weekly report.";

export interface BarryHireData {
  userId: string;
  templateKey: string;
  name: string;
  tokenBudget: number;
  tokensUsed: number;
  status: string;
  source: string;
  expiresAt: null;
  role: string;
  instructions: null;
  toolsJson: null;
}

/** The exact HiredAgent create payload for a member's BTC Barry. */
export function barryHireData(userId: string, tokenBudget: number): BarryHireData {
  return {
    userId,
    templateKey: BARRY_TEMPLATE_KEY,
    name: BARRY_AGENT_NAME,
    tokenBudget,
    tokensUsed: 0,
    status: "ACTIVE",
    source: BARRY_SOURCE,
    expiresAt: null,
    role: BARRY_ROLE,
    instructions: null,
    toolsJson: null,
  };
}

export interface BarryCandidate {
  id: string;
  templateKey: string;
  createdAt: Date;
}

function byCreatedThenId<T extends { createdAt: Date; id: string }>(a: T, b: T): number {
  const dt = a.createdAt.getTime() - b.createdAt.getTime();
  return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The idempotency rule: from a member's hire rows, the Barry record
 * to reuse — the OLDEST btc-barry row — or null when the member has
 * no Barry yet and one must be created. Reuse is unconditional on
 * status: if the member paused Barry, a re-launch does not silently
 * resurrect him; the record is theirs to resume.
 */
export function selectBarryRecord<T extends BarryCandidate>(candidates: T[]): T | null {
  const barrys = candidates.filter((c) => c.templateKey === BARRY_TEMPLATE_KEY).sort(byCreatedThenId);
  return barrys[0] ?? null;
}
