/**
 * The on-ramp: three rungs, in the order a member actually climbs them.
 *
 * The brief is what they own (`brief.ts`). This is how they get the tokens to
 * run it. Written as data so the web page and the Telegram bot say exactly the
 * same thing, and so a claim cannot be softened in one place and sharpened in
 * another.
 *
 * The rule this file exists to enforce: **a third party's promotion is not our
 * promise.** Meta runs the Muse referral programme; we can point at it and
 * describe what people report, and we cannot guarantee it, quote a cap as fact,
 * or imply it is ours to give.
 */

export type RungId = "muse-referral" | "byok" | "agent37";

export interface Rung {
  id: RungId;
  title: string;
  /** What it costs, stated plainly. */
  cost: string;
  /** What the member has to do. */
  setup: string;
  /** What they get out of it. */
  gives: string;
  /** The catch, said out loud. */
  caveat: string;
}

export const MUSE_JOIN_URL = "https://muse.ai/join";

export const ONRAMP: Rung[] = [
  {
    id: "muse-referral",
    title: "Run the brief inside Muse",
    cost: "$0",
    setup:
      "Join Muse from Meta and redeem a referral code in Settings within 48 hours of signing up — Meta credits both sides with tokens when a code is redeemed.",
    gives:
      "An orchestrator with its own cloud machine that can hold your brief and call the engine. This is the free lane, and it is a real one.",
    caveat:
      "Meta runs this programme, not us. The token amount, the referral cap and the 48-hour window are their terms, they have changed before and can change again — check what the app tells you before you count on it.",
  },
  {
    id: "byok",
    title: "Bring your own engine key",
    cost: "1 credit per engine call — about a cent",
    setup: "Make a key, save it once. Ten minutes, then it is done.",
    gives:
      "Uncapped clips on your own infrastructure. No queue limits from us, no clip allowance, nothing to upgrade.",
    caveat:
      "It is yours to keep working: your key, your rate limits, your uptime. If it breaks, the fix is on your side of the fence.",
  },
  {
    id: "agent37",
    title: "Let the platform run the worker",
    cost: "Compute, billed per clip",
    setup: "Point the platform at your page and your brief. Nothing to babysit.",
    gives:
      "A worker that claims the queue, renders, retries once, reports, and fires on a schedule whether or not your laptop is open.",
    caveat:
      "You are paying for supervision, not for tokens. If you enjoy running your own agent, rung two is cheaper and always will be.",
  },
];

/** Claims we are not allowed to make, checked by test. */
export const FORBIDDEN_CLAIMS = [
  "guaranteed",
  "free forever",
  "unlimited free",
  "no cost ever",
  "we will give you",
];

export function onrampText(rung: Rung): string {
  return [rung.title, `Cost: ${rung.cost}`, rung.setup, rung.gives, `The catch: ${rung.caveat}`].join("\n");
}

/**
 * Cheap honesty check for any copy drawn from this file. Returns the claims it
 * found, so a page or a bot message can refuse to ship rather than hoping
 * someone notices.
 */
export function findForbiddenClaims(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN_CLAIMS.filter((claim) => lower.includes(claim));
}

export function onrampIsHonest(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const rung of ONRAMP) {
    const found = findForbiddenClaims(onrampText(rung));
    if (found.length) problems.push(`${rung.title}: ${found.join(", ")}`);
    if (!rung.caveat.trim()) problems.push(`${rung.title}: no caveat — every rung has a catch`);
  }
  return { ok: problems.length === 0, problems };
}
