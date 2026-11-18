/**
 * game.ts — the Doors session machine, Whoparmy port (SPEC §4/§5/§9 +
 * Addenda v2/v3). Server-authoritative: the prize→door assignment is
 * drawn here with a CSPRNG, stored on the DoorsSession row, and revealed
 * one door at a time. Before any door opens the member holds a commitment
 * hash — sha256(sessionId + assignment + server secret).
 *
 * The secret comes from the DOORS_SECRET env var. When it is unset (dev,
 * tests) a random per-process secret is generated instead: commitments
 * still verify within the process, but PRODUCTION MUST SET DOORS_SECRET
 * so hashes survive restarts and verify across instances. The secret is
 * never returned by any endpoint. (Ported from the reference
 * implementation in meme-loop-engine, bot/src/lib/doors/doors.ts.)
 *
 * Prizes land as free generations: at finish, credits convert at
 * DOORS_CREDITS_PER_GEN (default 23 credits = 1 gen) and increment
 * User.freeGenBalance in the same transaction that finishes the session.
 */

import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import type { DoorsSession, User } from "@prisma/client";
import { db } from "@/lib/db";
import { awardXp } from "@/lib/game";
import {
  PRIZES,
  DOOR_VISUALS,
  band2For,
  band4For,
  callersForDate,
  computeOffer,
  creditsPerGen,
  finishMath,
  gameDateFor,
  isBand2,
  isBand4,
  isCaller,
  isDoor,
  mikeTipDoor,
  remainingPrizes,
  rollChaosFactor,
  shuffleAssignment,
  type Band2,
  type Band4,
  type DoorsCaller,
} from "./logic";
import { bankerLineFor, bankerLineKey, reactionLineKey, REACTION_LINES } from "./lines";
import { getDailySet, type DoorsMeme } from "./set";
import { awardReferralPoints, pointsBalance, type ReferralAward } from "./points";
import { getAuctionState, type AuctionState } from "./auction";

// ─── Errors ──────────────────────────────────────────────────────────────────

/** The shadow test-play account (see route.ts): its whopId marks a
 *  session as a test — repeatable starts, prizes stay on the throwaway
 *  account, no real member state is touched. */
export const DOORS_TEST_WHOPIID = "doors-test";

export class DoorsError extends Error {
  constructor(
    public code: string,
    public status: number = 400,
  ) {
    super(code);
  }
}
const fail = (code: string, status = 400): never => {
  throw new DoorsError(code, status);
};

// ─── Commitment secret ───────────────────────────────────────────────────────

const processSecret = randomBytes(32).toString("hex");

function doorsSecret(): string {
  // PROD MUST SET DOORS_SECRET — see the module header. The fallback keeps
  // dev/test self-consistent without ever logging or returning the value.
  return process.env.DOORS_SECRET || processSecret;
}

export function commitmentFor(sessionId: string, assignment: Record<string, number>): string {
  return createHash("sha256")
    .update(`${sessionId}:${JSON.stringify(assignment)}:${doorsSecret()}`)
    .digest("hex");
}

// ─── Session record helpers ──────────────────────────────────────────────────

interface OfferRecord {
  round: 1 | 2;
  amount: number;
  decision?: "deal" | "no_deal";
  chaosFactor?: number;
  sweatApplied?: boolean;
}
interface CallRecord {
  door: number;
  band: Band2;
  correct: boolean;
}

const asAssignment = (s: DoorsSession): Record<string, number> =>
  s.assignment as unknown as Record<string, number>;
const asOpened = (s: DoorsSession): number[] => (s.opened as unknown as number[]) ?? [];
const asOffers = (s: DoorsSession): OfferRecord[] => (s.offers as unknown as OfferRecord[]) ?? [];
const asCalls = (s: DoorsSession): CallRecord[] => (s.calls as unknown as CallRecord[]) ?? [];
const asPeeksUsed = (s: DoorsSession): number[] => (s.peeksUsed as unknown as number[]) ?? [];

async function loadOwnedSession(user: User, sessionId: unknown): Promise<DoorsSession> {
  if (typeof sessionId !== "string" || !sessionId) fail("session_not_found", 404);
  const s = await db.doorsSession.findUnique({ where: { id: sessionId as string } });
  if (!s) fail("session_not_found", 404);
  if (s!.userId !== user.id) fail("forbidden", 403);
  return s!;
}

function assertLive(s: DoorsSession): void {
  if (s.state === "finished") fail("game_finished");
  if (s.gameDate !== gameDateFor(new Date())) fail("session_expired");
}

// ─── Today ───────────────────────────────────────────────────────────────────

export interface DoorsTodayResult {
  gameDate: string;
  language: string;
  callersToday: DoorsCaller[];
  doors: typeof DOOR_VISUALS;
  memes: DoorsMeme[];
  prizes: number[];
  creditsPerGen: number;
  alreadyPlayed: boolean;
  existingResult: unknown;
  existingSession: { sessionId: string; state: string } | null;
  pointsBalance: number;
  freeGenBalance: number;
  auction: AuctionState;
}

export async function getToday(user: User, language: string): Promise<DoorsTodayResult> {
  const gameDate = gameDateFor(new Date());
  const [memes, session, balance, auction] = await Promise.all([
    getDailySet(gameDate, language),
    db.doorsSession.findUnique({ where: { userId_gameDate: { userId: user.id, gameDate } } }),
    pointsBalance(user.id),
    getAuctionState(),
  ]);
  return {
    gameDate,
    language,
    callersToday: callersForDate(gameDate),
    doors: DOOR_VISUALS,
    memes,
    prizes: [...PRIZES],
    creditsPerGen: creditsPerGen(),
    alreadyPlayed: session != null,
    existingResult: session?.state === "finished" ? (session.result ?? null) : null,
    existingSession: session ? { sessionId: session.id, state: session.state } : null,
    pointsBalance: balance,
    freeGenBalance: user.freeGenBalance,
    auction,
  };
}

// ─── Start ───────────────────────────────────────────────────────────────────

export async function startGame(
  user: User,
  input: { caller?: unknown; keeperDoor?: unknown },
  language: string,
) {
  if (!isCaller(input.caller)) fail("invalid_caller");
  if (!isDoor(input.keeperDoor)) fail("invalid_keeper_door");
  const caller = input.caller as DoorsCaller;
  const keeperDoor = input.keeperDoor as number;

  const gameDate = gameDateFor(new Date());
  if (!callersForDate(gameDate).includes(caller)) fail("caller_not_today");

  const existing = await db.doorsSession.findUnique({
    where: { userId_gameDate: { userId: user.id, gameDate } },
  });
  if (existing) {
    // Test play is repeatable: the shadow user's daily session is
    // disposable, so a fresh test start replaces it. Real members keep
    // the hard one-game-per-day rule.
    if (user.whopId === DOORS_TEST_WHOPIID) {
      await db.doorsSession.delete({ where: { id: existing.id } });
    } else {
      fail("already_played", 409);
    }
  }

  const assignment = shuffleAssignment((n) => randomInt(n));
  const sessionId = randomUUID();
  const session = await db.doorsSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      gameDate,
      language,
      caller,
      keeperDoor,
      assignment: assignment as unknown as object,
      commitmentHash: commitmentFor(sessionId, assignment),
      state: "opening",
      opened: [],
      offers: [],
      calls: [],
      peeksUsed: [],
      peeksBanked: caller === "young-mom" ? 1 : 0, // Young Mom perk: mom-intuition peek
    },
  });

  return {
    sessionId: session.id,
    commitmentHash: session.commitmentHash,
    gameDate,
    state: "opening" as const,
    opensNeeded: 2,
    peeksBanked: session.peeksBanked,
    // Shop Owner Mike perk: a door that is NOT the jackpot ("he knows the
    // suppliers"). Derived deterministically from the session — see logic.ts.
    ...(caller === "shop-owner-mike"
      ? { mikeTipDoor: mikeTipDoor(session.id, keeperDoor, assignment) }
      : {}),
  };
}

// ─── Open (with Call It) ─────────────────────────────────────────────────────

export async function openDoor(
  user: User,
  input: { sessionId?: unknown; door?: unknown; callBand?: unknown },
) {
  const s = await loadOwnedSession(user, input.sessionId);
  assertLive(s);
  if (s.state !== "opening" && s.state !== "opening2") fail("not_opening_state");
  if (!isDoor(input.door)) fail("invalid_door");
  const door = input.door as number;
  if (door === s.keeperDoor) fail("keeper_door");
  const opened = asOpened(s);
  if (opened.includes(door)) fail("already_opened");
  if (input.callBand !== undefined && !isBand2(input.callBand)) fail("invalid_call_band");

  const assignment = asAssignment(s);
  const prize = assignment[String(door)]!;

  // Call It: score the band call, move the streak, arm rewards.
  let streak = s.streak;
  let bestStreak = s.bestStreak;
  let peeksBanked = s.peeksBanked;
  let sweatArmed = s.sweatArmed;
  let callResult: CallRecord | null = null;
  const calls = asCalls(s);
  if (isBand2(input.callBand)) {
    const correct = band2For(prize) === input.callBand;
    callResult = { door, band: input.callBand, correct };
    calls.push(callResult);
    if (correct) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      if (streak === 2) peeksBanked += 1; // Peek earned
      if (streak === 3) sweatArmed = true; // Banker Sweat armed
    } else {
      streak = 0; // rewards re-arm: the climb starts over
    }
  }

  opened.push(door);
  let state = s.state;
  if (state === "opening" && opened.length === 2) state = "banker1";
  else if (state === "opening2" && opened.length === 3) state = "banker2";

  const updated = await db.doorsSession.update({
    where: { id: s.id },
    data: {
      opened: opened as unknown as object,
      calls: calls as unknown as object,
      streak,
      bestStreak,
      peeksBanked,
      sweatArmed,
      state,
    },
  });

  const set = await getDailySet(s.gameDate, s.language);
  const meme = set.find((m) => m.door === door) ?? set[0]!;
  const caller = s.caller as DoorsCaller;
  return {
    door,
    prize,
    meme,
    reaction: REACTION_LINES[caller][prize] ?? "",
    reactionKey: reactionLineKey(caller, prize),
    lineLang: "en",
    remainingPrizes: remainingPrizes(assignment, opened),
    openedCount: opened.length,
    state: updated.state,
    streak: updated.streak,
    bestStreak: updated.bestStreak,
    peeksBanked: updated.peeksBanked,
    sweatArmed: updated.sweatArmed,
    callResult,
  };
}

// ─── Peek ────────────────────────────────────────────────────────────────────

export async function peekDoor(user: User, input: { sessionId?: unknown; door?: unknown }) {
  const s = await loadOwnedSession(user, input.sessionId);
  assertLive(s);
  if (!isDoor(input.door)) fail("invalid_door");
  const door = input.door as number;
  const opened = asOpened(s);
  if (opened.includes(door)) fail("already_opened");
  const peeksUsed = asPeeksUsed(s);
  if (peeksUsed.includes(door)) fail("already_peeked");
  if (s.peeksBanked <= 0) fail("no_peeks");
  peeksUsed.push(door);
  await db.doorsSession.update({
    where: { id: s.id },
    data: { peeksBanked: s.peeksBanked - 1, peeksUsed: peeksUsed as unknown as object },
  });
  const prize = asAssignment(s)[String(door)]!;
  // Band only — never the exact prize. The keeper door may be peeked.
  return { door, band: band4For(prize) as Band4, peeksBanked: s.peeksBanked - 1 };
}

// ─── Read the Banker ─────────────────────────────────────────────────────────

export async function readGuess(user: User, input: { sessionId?: unknown; band?: unknown }) {
  const s = await loadOwnedSession(user, input.sessionId);
  assertLive(s);
  if (!isBand4(input.band)) fail("invalid_band");
  if (s.readGuess != null) fail("read_locked");
  await db.doorsSession.update({ where: { id: s.id }, data: { readGuess: input.band as Band4 } });
  return { ok: true as const, readGuess: input.band as Band4 };
}

// ─── Offer ───────────────────────────────────────────────────────────────────

async function currentOffer(s: DoorsSession) {
  if (s.state === "finished") fail("game_finished");
  if (s.state !== "banker1" && s.state !== "banker2") fail("no_offer_now");
  const round: 1 | 2 = s.state === "banker1" ? 1 : 2;
  const offers = asOffers(s);
  const stored = offers.find((o) => o.round === round);
  const caller = s.caller as DoorsCaller;
  const remaining = remainingPrizes(asAssignment(s), asOpened(s));

  if (stored) {
    return {
      round,
      amount: stored.amount,
      bankerLine: bankerLineFor(caller, round, stored.amount),
      bankerLineKey: bankerLineKey(caller, round, stored.amount),
      lineLang: "en",
      remainingPrizes: remaining,
      chaosFactor: stored.chaosFactor,
      sweatApplied: stored.sweatApplied ?? false,
    };
  }

  const chaosFactor =
    caller === "college-kid" ? rollChaosFactor(() => randomInt(0, 1_000_000) / 1_000_000) : undefined;
  const computed = computeOffer({
    remaining,
    round,
    caller,
    chaosFactor,
    sweat: s.sweatArmed,
  });
  offers.push({
    round,
    amount: computed.amount,
    ...(chaosFactor !== undefined ? { chaosFactor } : {}),
    sweatApplied: computed.sweatApplied,
  });
  await db.doorsSession.update({
    where: { id: s.id },
    data: {
      offers: offers as unknown as object,
      // Banker Sweat is consumed by the offer it boosted.
      ...(computed.sweatApplied ? { sweatArmed: false } : {}),
    },
  });
  return {
    round,
    amount: computed.amount,
    bankerLine: bankerLineFor(caller, round, computed.amount),
    bankerLineKey: bankerLineKey(caller, round, computed.amount),
    lineLang: "en",
    remainingPrizes: remaining,
    chaosFactor,
    sweatApplied: computed.sweatApplied,
  };
}

export async function getOffer(user: User, input: { sessionId?: unknown }) {
  const s = await loadOwnedSession(user, input.sessionId);
  if (s.state !== "finished" && s.gameDate !== gameDateFor(new Date())) fail("session_expired");
  return currentOffer(s);
}

// ─── Decide / finish ─────────────────────────────────────────────────────────

export async function decide(user: User, input: { sessionId?: unknown; decision?: unknown }) {
  if (input.decision !== "deal" && input.decision !== "no_deal") fail("invalid_decision");
  const decision = input.decision as "deal" | "no_deal";
  const s = await loadOwnedSession(user, input.sessionId);
  assertLive(s);
  if (s.state !== "banker1" && s.state !== "banker2") fail("no_offer_now");

  const offer = await currentOffer(s);
  const offers = asOffers(s);
  const stored = offers.find((o) => o.round === offer.round)!;
  stored.decision = decision;

  if (decision === "no_deal" && s.state === "banker1") {
    await db.doorsSession.update({
      where: { id: s.id },
      data: { offers: offers as unknown as object, state: "opening2" },
    });
    return { state: "opening2" as const, opensNeeded: 1 };
  }

  // Finish: a deal at either round, or the final no-deal reveals the keeper.
  const assignment = asAssignment(s);
  const keeperPrize = assignment[String(s.keeperDoor)]!;
  const caller = s.caller as DoorsCaller;
  let resultType: "deal" | "keeper" | "dud";
  let baseCredits: number;
  if (decision === "deal") {
    resultType = "deal";
    baseCredits = offer.amount;
  } else if (keeperPrize === 0) {
    resultType = "dud";
    baseCredits = 0;
  } else {
    resultType = "keeper";
    baseCredits = keeperPrize;
  }

  const fm = finishMath({
    resultType,
    baseCredits,
    caller,
    readGuess: s.readGuess,
    keeperPrize,
  });
  const result = {
    type: resultType,
    amount: fm.baseCredits,
    bonusCredits: fm.bonusCredits,
    readBonus: fm.readBonus,
    collegeBonus: fm.collegeBonus,
    totalCredits: fm.totalCredits,
    gensAwarded: fm.gensAwarded,
  };

  // Finish the session and pay the free generations in one transaction.
  await db.$transaction([
    db.doorsSession.update({
      where: { id: s.id },
      data: {
        offers: offers as unknown as object,
        state: "finished",
        result: result as unknown as object,
        prizeGensAwarded: fm.gensAwarded,
        finishedAt: new Date(),
      },
    }),
    db.user.update({
      where: { id: user.id },
      data: { freeGenBalance: { increment: fm.gensAwarded } },
    }),
  ]);

  // XP is a reward, not a gate — never fail the game over it.
  await awardXp(user.id, "DOORS_PLAYED", `doors:${s.gameDate}:${resultType}`).catch(() => {});
  if (resultType === "keeper" && baseCredits === 805) {
    await awardXp(user.id, "DOORS_JACKPOT", `doors:${s.gameDate}`).catch(() => {});
  }

  // Referral Bid Points ride the same finish (points.ts owns the rules).
  let referralAwards: ReferralAward[] = [];
  try {
    referralAwards = await awardReferralPoints(user.id, { gensAwarded: fm.gensAwarded });
  } catch {
    referralAwards = [];
  }

  return {
    state: "finished" as const,
    result,
    assignment,
    commitmentHash: s.commitmentHash,
    referralAwards,
  };
}
