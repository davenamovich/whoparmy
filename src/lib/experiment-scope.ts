/**
 * ─── The "experiment" bridge scope (pure) ───────────────────────────
 *
 * The BTC Experiment's agent connection (Dave, 2026-11-20): a member
 * who played the game, has an agent, and saved their DH Media link
 * gets a bridge code from /bridge — ANY plan, Trial included. It is
 * not the Operator + Agency week offer:
 *
 *   - eligibility: a Whop-linked credit account + a saved DH Media
 *     link (checked in muse-bridge.ts, which has the database);
 *   - budget: the member's OWN balance, like the clips lane — they
 *     spend their own credits (BYOK: $0.01 a call at the engine);
 *   - code lifetime: 24 hours, so a code survives a Muse signup;
 *   - tools: the week offer's content tools plus generate_ad_copy, so
 *     the agent can make the Facebook ads the 24/48-hour experiment
 *     runs on (Super Muse app/experiment/EXPERIMENT-24-48.md). Never
 *     create_sitdown (the Clip Factory's), never publish or MP4.
 *
 * No imports: unit-tested directly (experiment-scope.test.ts).
 */

export const EXPERIMENT_CODE_TTL_MS = 24 * 60 * 60_000;
export const DEFAULT_CODE_TTL_MS = 24 * 60 * 60_000; // every bridge code lasts 24 hours (Dave, 2026-11-23; was 15 minutes)

/** List costs from the engine's own tool descriptions. */
export const EXPERIMENT_GENERATING_COSTS: Record<string, number> = {
  create_demo_pack: 115,
  create_before_pitch: 50,
  generate_ad_creative: 60,
  generate_multilanguage_ads: 60,
  generate_ad_copy: 10,
};

export function codeTtlMsForScope(scope: string): number {
  return scope === "experiment" ? EXPERIMENT_CODE_TTL_MS : DEFAULT_CODE_TTL_MS;
}

/** "24 hours" — for briefs and prompts that state the lifetime. */
export function codeTtlLabel(scope: string): string {
  return "24 hours";
}

/**
 * The connection budget for an own-balance scope: the member's current
 * credits, clamped to the standing max. An unlimited key (credits < 0)
 * gets the max; zero is a real value (an empty account connects with a
 * zero budget, it is never upgraded to a default).
 */
export function ownBalanceBudget(credits: number, maxBudget: number): number {
  if (!Number.isFinite(credits)) return 0;
  if (credits < 0) return maxBudget;
  return Math.max(0, Math.min(maxBudget, Math.trunc(credits)));
}
