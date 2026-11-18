/**
 * logic.ts — PURE game math for "Who's Calling? Doors" (SPEC §5 + Addenda
 * v2/v3, Whoparmy port). No DB, no I/O: everything here is unit-checkable
 * (see doors.check.ts). The DB-backed session machine lives in game.ts.
 *
 * Ported from the reference implementation in meme-loop-engine
 * (bot/src/lib/doors/doors.ts, where gameDateFor + bankerOffer are tested);
 * extended for the v2 skill layer (Call It / Peek / Banker Sweat /
 * Read the Banker), the six-caller roster with perks, and the
 * credits → free-generations conversion.
 */

import { createHash } from "crypto";

// ─── Constants ───────────────────────────────────────────────────────────────

export const PRIZES: readonly number[] = [0, 25, 50, 100, 805];

export const DOOR_VISUALS = [
  { door: 0, visual: "torii", label: "Torii — the vermilion gate" },
  { door: 1, visual: "lantern", label: "Lantern — the festival stall" },
  { door: 2, visual: "sakura", label: "Sakura — the blossom shoji" },
  { door: 3, visual: "shoji", label: "Shoji — the lattice door" },
  { door: 4, visual: "shrine", label: "Shrine — the gold-leaf door" },
] as const;

export const CALLERS = [
  "joe",
  "grandma",
  "grandpa",
  "young-mom",
  "college-kid",
  "shop-owner-mike",
] as const;
export type DoorsCaller = (typeof CALLERS)[number];

export const isCaller = (v: unknown): v is DoorsCaller =>
  typeof v === "string" && (CALLERS as readonly string[]).includes(v);

export const isDoor = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4;

/** Banker generosity by caller (SPEC §6): added to the round factor.
 *  College Kid ignores this — his factor is rolled per offer (chaos). */
export const CALLER_MODIFIERS: Record<DoorsCaller, number> = {
  joe: 0,
  grandma: 0.1,
  grandpa: -0.1,
  "young-mom": 0,
  "college-kid": 0,
  "shop-owner-mike": 0,
};

/** Round factor: round 1 after 2 opens (3 prizes remain), round 2 after 3. */
export const ROUND_FACTORS: Record<1 | 2, number> = { 1: 0.7, 2: 0.85 };

/** College Kid's chaos factor range (uniform roll per offer). */
export const CHAOS_MIN = 0.6;
export const CHAOS_MAX = 1.0;

/** Banker Sweat multiplier (streak of 3 on Call It). */
export const SWEAT_MULTIPLIER = 1.1;

/** Read the Banker: correct band guess pays this at finish (×2 for Grandpa). */
export const READ_BONUS = 50;

/** College Kid perk: bonus credits when his keeper door holds the jackpot. */
export const COLLEGE_JACKPOT_BONUS = 50;

/**
 * Credits → free generations. 23 credits = 1 free generation, so the ladder
 * maps cleanly: 115 → 5 gens, 805 → 35 gens. CONFIG: DOORS_CREDITS_PER_GEN
 * env overrides; 23 is Dave-flippable (Addendum v3 build brief).
 */
export function creditsPerGen(): number {
  const raw = Number(process.env.DOORS_CREDITS_PER_GEN);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 23;
}
export const gensForCredits = (credits: number): number =>
  Math.max(0, Math.floor(credits / creditsPerGen()));

// ─── Bands (Call It / Peek / Read the Banker) ────────────────────────────────

export type Band2 = "low" | "high";
export type Band4 = "dud" | "low" | "high" | "jackpot";

/** Call It band: high = prize ≥ 100 (100 or 805). */
export const band2For = (prize: number): Band2 => (prize >= 100 ? "high" : "low");

/** Peek / Read band: dud 0 · low 25/50 · high 100 · jackpot 805. */
export function band4For(prize: number): Band4 {
  if (prize === 805) return "jackpot";
  if (prize === 100) return "high";
  if (prize === 0) return "dud";
  return "low";
}

export const isBand2 = (v: unknown): v is Band2 => v === "low" || v === "high";
export const isBand4 = (v: unknown): v is Band4 =>
  v === "dud" || v === "low" || v === "high" || v === "jackpot";

// ─── Game date (America/New_York, rolls 05:00 ET) ────────────────────────────

/**
 * The game date for a moment: the ET calendar date, except before 05:00 ET
 * it is still the previous ET date — the day's set goes live at 05:00 ET
 * (SPEC §8), so the small hours belong to yesterday's game.
 * (Ported verbatim from the reference; tested there for EST and EDT.)
 */
export function gameDateFor(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const et = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  if (get("hour") < 5) et.setUTCDate(et.getUTCDate() - 1);
  return et.toISOString().slice(0, 10);
}

/** ET calendar date (no 05:00 rollover) — for "earned today" caps. */
export function etDateFor(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => String(parts.find((p) => p.type === t)?.value ?? "0").padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ─── Deterministic daily picks (mulberry32, ported from the reference) ──────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRand(seedText: string): () => number {
  const digest = createHash("sha256").update(seedText).digest();
  return mulberry32(digest.readUInt32BE(0));
}

/**
 * The three callers who ring on a game date — a deterministic pick of 3
 * from the 6 by date hash, the same for every member that day (Addendum v2
 * §A1). Returned in roster order for stable UI.
 */
export function callersForDate(gameDate: string): DoorsCaller[] {
  const rand = seededRand(`doors-callers:${gameDate}`);
  const idx = CALLERS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const picked = new Set(idx.slice(0, 3));
  return CALLERS.filter((_, i) => picked.has(i));
}

// ─── Banker math (SPEC §5) ───────────────────────────────────────────────────

export const round5 = (x: number): number => Math.round(x / 5) * 5;

export interface OfferComputation {
  amount: number;
  /** The factor actually used (round factor + modifier, or the chaos roll). */
  factor: number;
  /** True when Banker Sweat (×1.10) was applied on top. */
  sweatApplied: boolean;
}

/**
 * offer = round_to_nearest_5( EV(remaining) × factor ), capped at
 * (largest remaining − 5) when the largest is > 0, floored at 0.
 * `remaining` always includes the keeper's prize plus every unopened door.
 *
 * factor: ROUND_FACTORS[round] + CALLER_MODIFIERS[caller] — except
 * College Kid, whose factor is the per-offer chaos roll (0.60–1.00).
 * When sweat is armed it multiplies the rounded offer ×1.10 (round5 again),
 * before the cap.
 */
export function computeOffer(opts: {
  remaining: readonly number[];
  round: 1 | 2;
  caller: DoorsCaller;
  chaosFactor?: number;
  sweat?: boolean;
}): OfferComputation {
  const { remaining, round, caller } = opts;
  if (remaining.length === 0) return { amount: 0, factor: 0, sweatApplied: false };
  const factor =
    caller === "college-kid" && typeof opts.chaosFactor === "number"
      ? opts.chaosFactor
      : ROUND_FACTORS[round] + CALLER_MODIFIERS[caller];
  const ev = remaining.reduce((a, b) => a + b, 0) / remaining.length;
  let amount = round5(ev * factor);
  const sweatApplied = !!opts.sweat;
  if (sweatApplied) amount = round5(amount * SWEAT_MULTIPLIER);
  const max = Math.max(...remaining);
  if (max > 0) amount = Math.min(amount, max - 5);
  return { amount: Math.max(0, amount), factor, sweatApplied };
}

/** The reference bankerOffer shape, kept for parity with the tested original. */
export function bankerOffer(remaining: readonly number[], round: 1 | 2, caller: DoorsCaller): number {
  return computeOffer({ remaining, round, caller }).amount;
}

/** Uniform chaos roll in [CHAOS_MIN, CHAOS_MAX], from an injectable rand. */
export function rollChaosFactor(rand: () => number = Math.random): number {
  return CHAOS_MIN + rand() * (CHAOS_MAX - CHAOS_MIN);
}

// ─── Assignment ──────────────────────────────────────────────────────────────

/** Fisher–Yates shuffle of the ladder into door index → prize, using an
 *  injectable rand (the session layer passes a CSPRNG-backed one). */
export function shuffleAssignment(rand: (n: number) => number): Record<string, number> {
  const prizes = [...PRIZES];
  for (let i = prizes.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [prizes[i], prizes[j]] = [prizes[j]!, prizes[i]!];
  }
  const assignment: Record<string, number> = {};
  prizes.forEach((prize, door) => {
    assignment[String(door)] = prize;
  });
  return assignment;
}

/** Prizes still in play given the opened doors (keeper + unopened). */
export function remainingPrizes(assignment: Record<string, number>, opened: readonly number[]): number[] {
  const openedSet = new Set(opened);
  return [0, 1, 2, 3, 4]
    .filter((d) => !openedSet.has(d))
    .map((d) => assignment[String(d)]!)
    .sort((a, b) => b - a);
}

/**
 * Shop Owner Mike's tip door: a non-keeper door whose prize is NOT the
 * jackpot. Derived deterministically from the session id + assignment
 * (both stored on the session row), so it is stable across requests
 * without a dedicated column — effectively stored on the session.
 */
export function mikeTipDoor(sessionId: string, keeperDoor: number, assignment: Record<string, number>): number {
  const candidates = [0, 1, 2, 3, 4].filter((d) => d !== keeperDoor && assignment[String(d)] !== 805);
  // candidates is never empty: only one door holds 805 and the keeper is one door.
  const rand = seededRand(`doors-mike:${sessionId}`);
  return candidates[Math.floor(rand() * candidates.length)]!;
}

// ─── Finish math ─────────────────────────────────────────────────────────────

export interface FinishMath {
  baseCredits: number;
  readBonus: number;
  collegeBonus: number;
  bonusCredits: number;
  totalCredits: number;
  gensAwarded: number;
}

/**
 * Finish totals. baseCredits is the deal amount or the keeper prize.
 * readBonus: READ_BONUS (×2 for Grandpa) when the Read guess matches the
 * keeper's band4. collegeBonus: College Kid only, no-deal keeper = 805.
 */
export function finishMath(opts: {
  resultType: "deal" | "keeper" | "dud";
  baseCredits: number;
  caller: DoorsCaller;
  readGuess: string | null;
  keeperPrize: number;
}): FinishMath {
  const readBonus =
    opts.readGuess != null && opts.readGuess === band4For(opts.keeperPrize)
      ? READ_BONUS * (opts.caller === "grandpa" ? 2 : 1)
      : 0;
  const collegeBonus =
    opts.caller === "college-kid" && opts.resultType === "keeper" && opts.keeperPrize === 805
      ? COLLEGE_JACKPOT_BONUS
      : 0;
  const bonusCredits = readBonus + collegeBonus;
  const totalCredits = opts.baseCredits + bonusCredits;
  return {
    baseCredits: opts.baseCredits,
    readBonus,
    collegeBonus,
    bonusCredits,
    totalCredits,
    gensAwarded: gensForCredits(totalCredits),
  };
}
