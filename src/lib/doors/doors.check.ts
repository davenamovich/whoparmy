/**
 * doors.check.ts — assertion script for the PURE doors logic (this repo
 * has no test runner wired for lib). Run: `bun run src/lib/doors/doors.check.ts`
 * (or bunx tsx). Covers logic.ts + lines.ts fully; DB-backed behavior
 * (sessions, points ledger, auction transactions) is exercised through
 * the API in integration testing, not here — the daily-set rotation in
 * set.ts is ported verbatim from the tested reference implementation
 * and is asserted here only via its seeded-shuffle equivalence.
 */

import {
  PRIZES,
  band2For,
  band4For,
  bankerOffer,
  callersForDate,
  computeOffer,
  etDateFor,
  finishMath,
  gameDateFor,
  gensForCredits,
  mikeTipDoor,
  remainingPrizes,
  rollChaosFactor,
  seededRand,
  shuffleAssignment,
} from "./logic";
import { BANKER_LINES, REACTION_LINES, bankerLineFor, bankerPersonaFor } from "./lines";

let passed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: got ${a}, want ${e}`);
  passed++;
}
function ok(cond: boolean, label: string) {
  if (!cond) throw new Error(`FAIL ${label}`);
  passed++;
}

// ─── Banker math — SPEC §5 worked examples ──────────────────────────────────
eq(bankerOffer([25, 100, 805], 1, "joe"), 215, "§5: {25,100,805} r1 Joe → 215");
eq(bankerOffer([100, 805], 2, "joe"), 385, "§5: {100,805} r2 Joe → 385");
eq(bankerOffer([0, 25], 2, "joe"), 10, "§5: {0,25} r2 Joe → 10");
eq(bankerOffer([0, 25], 2, "grandma"), 10, "§5: {0,25} r2 Grandma → 10");
eq(bankerOffer([0, 25], 2, "grandpa"), 10, "§5 (corrected): {0,25} r2 Grandpa → 10");
eq(bankerOffer([0], 1, "joe"), 0, "floor: only the dud remains → 0");
eq(bankerOffer([], 1, "joe"), 0, "empty remaining → 0");
eq(bankerOffer([805], 2, "grandma"), 765, "lone jackpot: EV 805 × 0.95 → 765 (cap 800 not binding)");
eq(
  computeOffer({ remaining: [805], round: 2, caller: "grandma", sweat: true }).amount,
  800,
  "cap binds under sweat: round5(765 × 1.10) = 840 → capped at max-5 = 800",
);

// ─── Banker Sweat ×1.10 ──────────────────────────────────────────────────────
const plain = computeOffer({ remaining: [25, 100, 805], round: 1, caller: "joe" });
const sweaty = computeOffer({ remaining: [25, 100, 805], round: 1, caller: "joe", sweat: true });
eq(plain.amount, 215, "sweat baseline 215");
eq(sweaty.amount, 235, "sweat: round5(215 × 1.10) = 235");
eq(sweaty.sweatApplied, true, "sweat flag set");

// ─── College Kid chaos factor ────────────────────────────────────────────────
for (let i = 0; i < 500; i++) {
  const f = rollChaosFactor();
  ok(f >= 0.6 && f <= 1.0, `chaos factor in [0.60, 1.00] (got ${f})`);
}
const chaos = computeOffer({ remaining: [50, 100], round: 2, caller: "college-kid", chaosFactor: 0.6 });
eq(chaos.factor, 0.6, "chaos factor used verbatim");
eq(chaos.amount, 45, "chaos: EV 75 × 0.60 = 45");

// ─── Bands ───────────────────────────────────────────────────────────────────
eq(band2For(805), "high", "band2 805 high");
eq(band2For(100), "high", "band2 100 high");
eq(band2For(50), "low", "band2 50 low");
eq(band4For(0), "dud", "band4 0 dud");
eq(band4For(25), "low", "band4 25 low");
eq(band4For(50), "low", "band4 50 low");
eq(band4For(100), "high", "band4 100 high");
eq(band4For(805), "jackpot", "band4 805 jackpot");

// ─── Credits → gens (23 = 1 gen) ─────────────────────────────────────────────
eq(gensForCredits(805), 35, "805 credits → 35 gens");
eq(gensForCredits(115), 5, "115 credits → 5 gens");
eq(gensForCredits(100), 4, "100 credits → 4 gens");
eq(gensForCredits(22), 0, "22 credits → 0 gens");
eq(gensForCredits(0), 0, "0 → 0");

// ─── Finish math ─────────────────────────────────────────────────────────────
const deal = finishMath({ resultType: "deal", baseCredits: 215, caller: "joe", readGuess: null, keeperPrize: 100 });
eq(deal.bonusCredits, 0, "deal, no read → no bonus");
eq(deal.gensAwarded, 9, "deal 215 → floor(215/23) = 9 gens");
const readWin = finishMath({ resultType: "keeper", baseCredits: 100, caller: "joe", readGuess: "high", keeperPrize: 100 });
eq(readWin.readBonus, 50, "read win → +50");
eq(readWin.gensAwarded, 6, "100 + 50 → floor(150/23) = 6 gens");
const readGrandpa = finishMath({ resultType: "keeper", baseCredits: 25, caller: "grandpa", readGuess: "low", keeperPrize: 25 });
eq(readGrandpa.readBonus, 100, "grandpa read win → +100 (×2)");
const readMiss = finishMath({ resultType: "keeper", baseCredits: 25, caller: "joe", readGuess: "jackpot", keeperPrize: 25 });
eq(readMiss.readBonus, 0, "read miss → 0");
const kidJackpot = finishMath({ resultType: "keeper", baseCredits: 805, caller: "college-kid", readGuess: null, keeperPrize: 805 });
eq(kidJackpot.collegeBonus, 50, "college-kid keeper jackpot → +50");
eq(kidJackpot.gensAwarded, 37, "805 + 50 → floor(855/23) = 37 gens");
const kidDeal805 = finishMath({ resultType: "deal", baseCredits: 805, caller: "college-kid", readGuess: null, keeperPrize: 805 });
eq(kidDeal805.collegeBonus, 0, "college bonus is keeper-path only");

// ─── Game date (05:00 ET rollover, EST + EDT) ────────────────────────────────
eq(gameDateFor(new Date("2026-01-15T04:59:00Z")), "2026-01-14", "EST 23:59 ET → previous game date");
eq(gameDateFor(new Date("2026-01-15T10:00:00Z")), "2026-01-15", "EST 05:00 ET → new game date");
eq(gameDateFor(new Date("2026-07-15T08:59:00Z")), "2026-07-14", "EDT 04:59 ET → previous game date");
eq(gameDateFor(new Date("2026-07-15T09:00:00Z")), "2026-07-15", "EDT 05:00 ET → new game date");
eq(etDateFor(new Date("2026-01-15T04:59:00Z")), "2026-01-14", "etDate EST evening");

// ─── Daily callers: 3 of 6, deterministic ────────────────────────────────────
const c1 = callersForDate("2026-11-20");
eq(c1.length, 3, "three callers ring");
eq(new Set(c1).size, 3, "callers distinct");
eq(callersForDate("2026-11-20"), c1, "same date → same callers");
const acrossWeek = new Set(
  ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].flatMap((d) =>
    callersForDate(d),
  ),
);
ok(acrossWeek.size >= 4, "rotation actually rotates across a week");

// ─── Assignment + remaining + Mike tip ───────────────────────────────────────
const assignment = shuffleAssignment((n) => {
  const r = seededRand("check-seed");
  return Math.floor(r() * n);
});
eq(
  Object.values(assignment).sort((a, b) => a - b),
  [...PRIZES].sort((a, b) => a - b),
  "assignment is a permutation of the ladder",
);
eq(remainingPrizes(assignment, [1, 3]).length, 3, "remaining after 2 opens = 3");
const keeper = 0;
const tip = mikeTipDoor("session-xyz", keeper, assignment);
ok(tip !== keeper && assignment[String(tip)] !== 805, "mike tip: non-keeper, non-jackpot");
eq(mikeTipDoor("session-xyz", keeper, assignment), tip, "mike tip deterministic");

// ─── Lines coverage ──────────────────────────────────────────────────────────
for (const caller of Object.keys(REACTION_LINES) as (keyof typeof REACTION_LINES)[]) {
  for (const prize of PRIZES) {
    ok(typeof REACTION_LINES[caller][prize] === "string" && REACTION_LINES[caller][prize]!.length > 0, `line ${caller}/${prize}`);
  }
}
eq(bankerPersonaFor("grandpa"), "joe", "banker is Joe when Grandpa hosts");
eq(bankerPersonaFor("young-mom"), "grandpa", "banker is Grandpa otherwise");
eq(bankerLineFor("joe", 1, 0), BANKER_LINES.grandpa.zero, "zero offer → zero line");

console.log(`doors.check: ${passed} assertions passed`);
