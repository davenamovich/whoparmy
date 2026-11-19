/**
 * auction.ts — the weekly Key Auction (Addendum v2 §A4).
 *
 * One prize per week: a 10,000,000-token OpenAI-compatible API key.
 * Members bid Bid Points (the referral currency in points.ts). The
 * winner's stake burns; every loser is refunded in full at close.
 * Fulfillment is a MANUAL key mint (KeyAuction.fulfilledAt) — this module
 * only runs the auction, it never issues a key.
 *
 * Window (anchored to the ISO week of the ET date): opens Friday
 * 05:00 ET, closes Sunday 05:00 ET. There is no cron: an auction whose
 * close has passed is resolved lazily by the next state read, inside a
 * transaction.
 */

import { db } from "@/lib/db";
import { etDateFor } from "./logic";
import { pointsBalance } from "./points";

export const PRIZE_LABEL = "10,000,000-token API key (OpenAI-compatible — Claude / DeepSeek / GPT)";
export const MIN_OPENING_BID = 50;
export const MIN_INCREMENT = 10;

// ─── ISO week + ET wall-clock helpers ────────────────────────────────────────

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO week key ("2026-W47") and the Monday of that week for a YYYY-MM-DD. */
export function isoWeek(dateStr: string): { weekKey: string; monday: string } {
  const date = parseDateStr(dateStr);
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(date.getTime() - dow * 86_400_000);
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { weekKey: `${isoYear}-W${String(week).padStart(2, "0")}`, monday: toDateStr(monday) };
}

/** Convert an America/New_York wall-clock time to the UTC instant. */
export function etWallToUtc(dateStr: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  let guess = Date.UTC(y!, m! - 1, d!, hour, minute);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const etAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const target = Date.UTC(y!, m! - 1, d!, hour, minute);
    const delta = target - etAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** The auction window for the ISO week containing an ET date string. */
export function auctionWindowFor(etDateStr: string): { weekKey: string; opensAt: Date; closesAt: Date } {
  const { weekKey, monday } = isoWeek(etDateStr);
  const mondayDate = parseDateStr(monday);
  const friday = toDateStr(new Date(mondayDate.getTime() + 4 * 86_400_000));
  const sunday = toDateStr(new Date(mondayDate.getTime() + 6 * 86_400_000));
  return { weekKey, opensAt: etWallToUtc(friday, 5), closesAt: etWallToUtc(sunday, 5) };
}

// ─── State ───────────────────────────────────────────────────────────────────

export type AuctionPhase = "UPCOMING" | "OPEN" | "CLOSED";

export interface AuctionState {
  phase: AuctionPhase;
  /** Alias of phase — the web client reads `status`. Keep both in sync. */
  status: AuctionPhase;
  weekKey: string;
  prizeLabel: string;
  opensAt: string;
  closesAt: string;
  auctionId: string | null;
  topBid: number;
  bidCount: number;
  winnerId: string | null;
  winningBid: number | null;
}

type AuctionRow = NonNullable<Awaited<ReturnType<typeof findAuction>>>;

function findAuction(weekKey: string) {
  return db.keyAuction.findUnique({ where: { weekKey } });
}

async function topBidOf(auctionId: string): Promise<{ topBid: number; bidCount: number }> {
  const agg = await db.keyBid.aggregate({
    where: { auctionId },
    _max: { points: true },
    _count: { _all: true },
  });
  return { topBid: agg._max.points ?? 0, bidCount: agg._count._all };
}

async function toState(auction: AuctionRow, phase: AuctionPhase): Promise<AuctionState> {
  const { topBid, bidCount } = await topBidOf(auction.id);
  return {
    phase,
    status: phase,
    weekKey: auction.weekKey,
    prizeLabel: auction.prizeLabel,
    opensAt: auction.opensAt.toISOString(),
    closesAt: auction.closesAt.toISOString(),
    auctionId: auction.id,
    topBid,
    bidCount,
    winnerId: auction.winnerId,
    winningBid: auction.winningBid,
  };
}

/**
 * Resolve a closed auction: highest bid wins (tie → earliest createdAt).
 * Losers are refunded in full (BID_REFUND); the winner's stake stays
 * consumed — a 0-point BID_BURN event marks the burn on the audit trail.
 */
async function resolveAuction(auction: AuctionRow): Promise<AuctionRow> {
  return db.$transaction(async (tx) => {
    const fresh = await tx.keyAuction.findUnique({ where: { id: auction.id } });
    if (!fresh || fresh.status !== "OPEN") return fresh ?? auction;
    const bids = await tx.keyBid.findMany({
      where: { auctionId: auction.id },
      orderBy: [{ points: "desc" }, { createdAt: "asc" }],
    });
    const winner = bids[0];
    const now = new Date();
    if (winner) {
      for (const loser of bids.slice(1)) {
        await tx.bidPointEvent.create({
          data: {
            userId: loser.userId,
            points: loser.points,
            kind: "BID_REFUND",
            auctionId: auction.id,
            meta: "auction lost — stake refunded",
          },
        });
      }
      await tx.bidPointEvent.create({
        data: {
          userId: winner.userId,
          points: 0,
          kind: "BID_BURN",
          auctionId: auction.id,
          meta: "won — stake burned",
        },
      });
    }
    return tx.keyAuction.update({
      where: { id: auction.id },
      data: {
        status: "CLOSED",
        winnerId: winner?.userId ?? null,
        winningBid: winner?.points ?? null,
        closedAt: now,
      },
    });
  });
}

/**
 * The auction state for a moment. Lazily resolves any OPEN auction whose
 * close has passed, then reports the current ET week's window:
 * before Friday 05:00 ET → UPCOMING; inside the window → OPEN (row is
 * created on first read); after close → CLOSED.
 */
export async function getAuctionState(now = new Date()): Promise<AuctionState> {
  // Lazy resolution of any past-close OPEN auction (e.g. last week's).
  const stale = await db.keyAuction.findMany({
    where: { status: "OPEN", closesAt: { lte: now } },
  });
  for (const a of stale) await resolveAuction(a);

  const { weekKey, opensAt, closesAt } = auctionWindowFor(etDateFor(now));
  let auction = await findAuction(weekKey);

  if (now < opensAt) {
    if (auction) return toState(auction, auction.status === "CLOSED" ? "CLOSED" : "UPCOMING");
    return {
      phase: "UPCOMING",
      status: "UPCOMING",
      weekKey,
      prizeLabel: PRIZE_LABEL,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      auctionId: null,
      topBid: 0,
      bidCount: 0,
      winnerId: null,
      winningBid: null,
    };
  }

  if (!auction) {
    // Upsert, not create: two concurrent first-visits of the week
    // used to race the create on the unique weekKey.
    auction = await db.keyAuction.upsert({
      where: { weekKey },
      create: { weekKey, prizeLabel: PRIZE_LABEL, opensAt, closesAt, status: "OPEN" },
      update: {},
    });
  }
  if (auction.status === "CLOSED" || now >= closesAt) {
    const resolved = auction.status === "CLOSED" ? auction : await resolveAuction(auction);
    return toState(resolved, "CLOSED");
  }
  return toState(auction, "OPEN");
}

// ─── Bidding ─────────────────────────────────────────────────────────────────

export interface BidResult {
  ok: true;
  myBid: number;
  topBid: number;
  balance: number;
}

export class BidError extends Error {}

/**
 * Place or raise the member's bid. Only while OPEN. Minimum: 50 with no
 * bids, else topBid + 10. A raise refunds the existing stake and stakes
 * the new amount atomically; the balance check counts the refund first.
 */
export async function placeBid(userId: string, points: number): Promise<BidResult> {
  if (!Number.isInteger(points) || points <= 0) throw new BidError("Bid must be a positive whole number of points.");
  const state = await getAuctionState();
  if (state.phase !== "OPEN" || !state.auctionId) throw new BidError("The auction is not open right now.");
  const auctionId = state.auctionId;

  const result = await db.$transaction(async (tx) => {
    // Recheck the auction INSIDE the transaction against the fresh
    // row: the phase check above ran before the tx, and the window
    // can close (or the auction resolve) in between — a bid landing
    // after close would stake points on a dead auction.
    const fresh = await tx.keyAuction.findUnique({ where: { id: auctionId } });
    const nowTx = new Date();
    if (!fresh || fresh.status !== "OPEN" || nowTx < fresh.opensAt || nowTx >= fresh.closesAt) {
      throw new BidError("The auction is not open right now.");
    }
    const existing = await tx.keyBid.findUnique({
      where: { auctionId_userId: { auctionId, userId } },
    });
    const top = await tx.keyBid.aggregate({ where: { auctionId }, _max: { points: true } });
    const topBid = top._max.points ?? 0;
    const min = topBid === 0 ? MIN_OPENING_BID : topBid + MIN_INCREMENT;
    if (points < min) throw new BidError(`Minimum bid is ${min} points.`);

    const agg = await tx.bidPointEvent.aggregate({ where: { userId }, _sum: { points: true } });
    const balanceNow = agg._sum.points ?? 0;
    const effective = balanceNow + (existing?.points ?? 0); // refund counted before the new stake
    if (points > effective) throw new BidError("Not enough Bid Points for that bid.");

    if (existing) {
      await tx.bidPointEvent.create({
        data: { userId, points: existing.points, kind: "BID_REFUND", auctionId, meta: "raise — previous stake refunded" },
      });
      await tx.keyBid.update({ where: { id: existing.id }, data: { points } });
    } else {
      await tx.keyBid.create({ data: { auctionId, userId, points } });
    }
    await tx.bidPointEvent.create({
      data: { userId, points: -points, kind: "BID_STAKE", auctionId },
    });
    return { myBid: points };
  });

  const top = await topBidOf(auctionId);
  return { ok: true, myBid: result.myBid, topBid: top.topBid, balance: await pointsBalance(userId) };
}

/** The member's current bid on an auction (0 when none). */
export async function myBidFor(userId: string, auctionId: string | null): Promise<number> {
  if (!auctionId) return 0;
  const bid = await db.keyBid.findUnique({ where: { auctionId_userId: { auctionId, userId } } });
  return bid?.points ?? 0;
}

/** Top bids for the leaderboard, flagged for the requesting member. */
export async function topBidsFor(
  auctionId: string | null,
  userId: string,
  limit = 5,
): Promise<{ points: number; mine: boolean }[]> {
  if (!auctionId) return [];
  const bids = await db.keyBid.findMany({
    where: { auctionId },
    orderBy: [{ points: "desc" }, { createdAt: "asc" }],
    take: limit,
    select: { points: true, userId: true },
  });
  return bids.map((b) => ({ points: b.points, mine: b.userId === userId }));
}
