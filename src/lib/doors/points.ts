/**
 * points.ts — Bid Points, the referral auction currency (Addendum v2 §A3).
 *
 * Append-only ledger on BidPointEvent; a member's balance is SUM(points)
 * over their events. Points are never purchasable and never convertible
 * from game credits — the only faucet is referrals, the only sink is the
 * weekly Key Auction (stakes in auction.ts).
 *
 * Referral awards fire at game finish (game.ts calls awardReferralPoints):
 *   REF_FINISH +10 — once per referred member, ever (their first finish)
 *   REF_3DAYS  +25 — once, when the referred member's finished games span
 *                    ≥ 3 distinct game dates
 *   REF_CLAIM  +10 — once per referred member, when a finish of theirs
 *                    awards free generations (gensAwarded > 0)
 * Daily cap: a referrer's REF_* earnings on one ET calendar day stay
 * ≤ 200 points; an event that would cross the cap pays only the remainder
 * (and still counts as fired — the once-only row exists).
 */

import { db } from "@/lib/db";
import { etDateFor } from "./logic";

export const REF_POINTS = { REF_FINISH: 10, REF_3DAYS: 25, REF_CLAIM: 10 } as const;
export type RefKind = keyof typeof REF_POINTS;
export const REF_DAILY_CAP = 200;

const REF_KINDS = Object.keys(REF_POINTS) as RefKind[];

/** A member's Bid Point balance: the ledger sum. */
export async function pointsBalance(userId: string): Promise<number> {
  const agg = await db.bidPointEvent.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

/** REF_* points the referrer has already earned on this ET calendar day. */
async function refEarnedTodayEt(referrerId: string, now: Date): Promise<number> {
  const todayEt = etDateFor(now);
  const since = new Date(now.getTime() - 36 * 60 * 60_000); // covers any ET day boundary
  const events = await db.bidPointEvent.findMany({
    where: { userId: referrerId, kind: { in: REF_KINDS }, createdAt: { gte: since } },
    select: { points: true, createdAt: true },
  });
  return events
    .filter((e) => etDateFor(e.createdAt) === todayEt)
    .reduce((sum, e) => sum + e.points, 0);
}

async function alreadyAwarded(kind: RefKind, referrerId: string, refUserId: string): Promise<boolean> {
  const existing = await db.bidPointEvent.findFirst({
    where: { kind, userId: referrerId, refUserId },
    select: { id: true },
  });
  return existing != null;
}

export interface ReferralAward {
  kind: RefKind;
  points: number;
}

/**
 * Fire any referral Bid Point events earned by `finisherId`'s just-finished
 * game. No-ops when the finisher has no referrer. Returns what was awarded
 * (after the daily cap), for the finish response / logging.
 */
export async function awardReferralPoints(
  finisherId: string,
  opts: { gensAwarded: number; now?: Date },
): Promise<ReferralAward[]> {
  const now = opts.now ?? new Date();
  const finisher = await db.user.findUnique({
    where: { id: finisherId },
    select: { referredById: true },
  });
  const referrerId = finisher?.referredById;
  if (!referrerId || referrerId === finisherId) return [];

  const earnedToday = await refEarnedTodayEt(referrerId, now);
  let remainingCap = Math.max(0, REF_DAILY_CAP - earnedToday);
  const awarded: ReferralAward[] = [];

  const fire = async (kind: RefKind): Promise<void> => {
    if (remainingCap <= 0) return;
    if (await alreadyAwarded(kind, referrerId, finisherId)) return;
    const points = Math.min(REF_POINTS[kind], remainingCap);
    if (points <= 0) return;
    await db.bidPointEvent.create({
      data: { userId: referrerId, points, kind, refUserId: finisherId },
    });
    remainingCap -= points;
    awarded.push({ kind, points });
  };

  // (a) First finish by this referred member.
  await fire("REF_FINISH");

  // (b) Referred member's finished games span ≥ 3 distinct game dates.
  const finished = await db.doorsSession.findMany({
    where: { userId: finisherId, state: "finished" },
    select: { gameDate: true },
  });
  const distinctDays = new Set(finished.map((s) => s.gameDate)).size;
  if (distinctDays >= 3) await fire("REF_3DAYS");

  // (c) A finish that actually paid out free generations.
  if (opts.gensAwarded > 0) await fire("REF_CLAIM");

  return awarded;
}
