import "server-only";
import { db } from "@/lib/db";
import { etDateString, getRotatorPool, type RotatorPoolEntry } from "@/lib/rotator";
import { recordRotatorHop } from "@/lib/rotator-v2";
import { recordLinkClick } from "@/lib/link-clicks";
import { getPaidSlotPrices, listPaidSlotsForDate, placedPaidSlot } from "@/lib/paid-slots-server";
import { FREE_DAY_SOURCE } from "@/lib/free-day-core";
import { partnerNameSync } from "@/lib/offer-catalog";
import { BTC_EXPERIMENT_URL } from "@/lib/rotator-house";
import {
  addDaysToEtDate,
  etDayEndsAt,
  etWallTimeToUtc,
  hostOf,
  inventoryState,
  nextBiddingClose,
  placementLifecycle,
  type MarketDayInventory,
  type MarketPlacement,
  type RotatorSummary,
} from "@/lib/rotator-market";

/**
 * ─── ROTATOR MARKETPLACE — server side (Whop Army 2.0, Slice 5) ────
 *
 * Read/write model for the public /rotator marketplace, built ON the
 * existing daily rotator (lib/rotator.ts): today's placements are
 * exactly getRotatorPool's pool (confirmed auction winner first, then
 * the day's free placements, traffic-pool filtered as everywhere
 * else). No second bidding system, no new auction state — the
 * lifecycle/inventory vocabulary is derived in lib/rotator-market.ts.
 *
 * HOUSE DESTINATION ON THE NEW SURFACES (Dave, 2026-11-21): "Enter
 * the rotator is sending users directly to DH Media — it should go
 * to www.thebtcexperiment.com." When no placement is live, the
 * marketplace's house entry is The BTC Experiment itself. The legacy
 * house pool in lib/rotator.ts originally rotated the whole offer
 * catalog; Dave closed that on 2026-11-24 ("we should be sending
 * users to dh.media or the btc experiment") — the legacy fallback
 * now alternates DH Media / BTC Experiment only (lib/rotator-house.ts),
 * and this surface's house entry stays the BTC Experiment.
 *
 * ON-SITE (Dave, 2026-11-24, supersedes the off-site half of the
 * above): the game now lives on-site at /play (site reorg R1 — "keep
 * users on-site, not sent off-site to play the game"), and Dave
 * ordered the rotator's remaining off-site pointer closed. The house
 * destination is the on-site /play; thebtcexperiment.com stays live
 * as a standalone site but nothing on this surface sends users there.
 *
 * TRACKING — one ledger, RotatorHop (no parallel analytics):
 * marketplace rows use surface "ROTATOR_PAGE". Impression vs click
 * is carried by linkId, the hop's per-destination key:
 *   impression → linkId "market-imp:<partner>"
 *   launch     → linkId "market-click:<partner>"
 * The kind-specific linkId matters: scoreHop's DEDUP filter keys on
 * ipHash+linkId, so an impression and the launch it leads to must not
 * dedup against each other, while repeat impressions (or repeat
 * launches) from one IP inside the window DO dedup. `code` is the
 * constant "marketplace" (no signed rotator code exists on this
 * surface). All marketplace hops flow through recordRotatorHop, so
 * bot/velocity/rate filtering applies exactly as for V2 hops —
 * filtering changes counting only, never the page or the redirect.
 */

export const MARKET_SURFACE = "ROTATOR_PAGE";
export const MARKET_HOUSE_PARTNER = "the-btc-experiment";
export const MARKET_HOUSE_NAME = "The BTC Experiment";
export const MARKET_HOUSE_URL = BTC_EXPERIMENT_URL;

const impLinkId = (partner: string) => `market-imp:${partner}`;
const clickLinkId = (partner: string) => `market-click:${partner}`;
const FREE_DAY_SLOT_PREFIX = "free-day-slot:";

export interface MarketTodayView {
  date: string;
  /** ISO instant of the next 23:50 ET bidding close. */
  closesAt: string;
  /** ISO instant today's placements stop (next ET midnight). */
  dayEndsAt: string;
  inventory: MarketDayInventory[];
  placements: MarketPlacement[];
  stats: { countedImpressions: number; countedLaunches: number };
}

interface InternalPlacement extends MarketPlacement {
  userId: string | null;
  agentId: string | null;
  url: string;
}

function displayName(user: { name: string | null; whopUsername: string | null } | null): string | null {
  return user?.name ?? user?.whopUsername ?? null;
}

async function inventoryFor(dates: string[], today: string): Promise<MarketDayInventory[]> {
  const days = await db.rotatorDay.findMany({
    where: { date: { in: dates } },
    include: { _count: { select: { bids: true } } },
  });
  const [prices, paidCounts] = await Promise.all([getPaidSlotPrices(), Promise.all(dates.map(date => db.paidRotatorSlot.count({ where: { date, ...placedPaidSlot } })))]);
  const byDate = new Map(days.map((d) => [d.date, d]));
  return dates.map((date, i) => {
    const day = byDate.get(date);
    const bidCount = day?._count.bids ?? 0;
    return {
      date,
      state: inventoryState({ status: day?.status ?? null, bidCount, date, today }),
      bidCount,
      priceCents: prices.find(p => p.date === date)?.priceCents ?? 1000,
      paid: paidCounts[i] > 0,
    };
  });
}

async function countedMarketHops(kind: "imp" | "click", from: Date, to: Date): Promise<number> {
  return db.rotatorHop.count({
    where: {
      surface: MARKET_SURFACE,
      counted: true,
      linkId: { startsWith: kind === "imp" ? "market-imp:" : "market-click:" },
      ts: { gte: from, lt: to },
    },
  });
}

/** Today's marketplace: placements (internal, with owner ids for
 *  tracking) + the public view. One load feeds the page, the API and
 *  impression recording so they can never disagree. */
export async function loadMarketToday(now = new Date()): Promise<{ view: MarketTodayView; internal: InternalPlacement[] }> {
  const today = etDateString(now);
  const dates = [0, 1, 2].map((n) => addDaysToEtDate(today, n));
  const pool = await getRotatorPool(today);

  let internal: InternalPlacement[];
  if (pool.length) {
    const ownerIds = [...new Set(pool.map((e) => e.userId).filter((id): id is string => Boolean(id)))];
    const owners = ownerIds.length
      ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, whopUsername: true } })
      : [];
    const ownerById = new Map(owners.map((u) => [u.id, u]));
    internal = pool.map((entry: RotatorPoolEntry) => ({
      partner: entry.partner,
      partnerName: entry.partnerName,
      host: hostOf(entry.url),
      source: entry.source === "auction" ? "auction" : "free-placement",
      ownerName: displayName(entry.userId ? (ownerById.get(entry.userId) ?? null) : null),
      lifecycle: placementLifecycle(today, today),
      userId: entry.userId,
      agentId: entry.agentId ?? null,
      url: entry.url,
    }));
  } else {
    // House fallback on the NEW surfaces = The BTC Experiment (see
    // the header note) — never the legacy DH Media house-pool pick.
    internal = [
      {
        partner: MARKET_HOUSE_PARTNER,
        partnerName: MARKET_HOUSE_NAME,
        host: hostOf(MARKET_HOUSE_URL),
        source: "house",
        ownerName: null,
        lifecycle: placementLifecycle(today, today),
        userId: null,
        agentId: null,
        url: MARKET_HOUSE_URL,
      },
    ];
  }

  const paidSlots = await listPaidSlotsForDate(today);
  internal.push(...paidSlots.map((slot) => ({
    partner: slot.source === FREE_DAY_SOURCE ? `${FREE_DAY_SLOT_PREFIX}${slot.id}` : slot.partner,
    partnerName: partnerNameSync(slot.partner),
    host: hostOf(slot.url),
    source: "paid" as const,
    ownerName: displayName(slot.user),
    lifecycle: placementLifecycle(today, today),
    userId: slot.userId,
    agentId: null,
    url: slot.url,
  })));

  const [inventory, countedImpressions, countedLaunches] = await Promise.all([
    inventoryFor(dates, today),
    countedMarketHops("imp", etWallTimeToUtc(today, 0, 0), etWallTimeToUtc(addDaysToEtDate(today, 1), 0, 0)),
    countedMarketHops("click", etWallTimeToUtc(today, 0, 0), etWallTimeToUtc(addDaysToEtDate(today, 1), 0, 0)),
  ]);

  const view: MarketTodayView = {
    date: today,
    closesAt: nextBiddingClose(now).closesAt,
    dayEndsAt: etDayEndsAt(today),
    inventory,
    placements: internal.map(({ userId: _u, agentId: _a, url: _url, ...pub }) => pub),
    stats: { countedImpressions, countedLaunches },
  };
  return { view, internal };
}

/** One counted-or-filtered impression hop per placement shown.
 *  Best-effort by construction: recordRotatorHop never throws, and
 *  the caller wraps this so a tracking failure can't break the page. */
export async function recordMarketImpressions(
  placements: InternalPlacement[],
  meta: { ip: string | null; ua: string | null; referer: string | null },
): Promise<void> {
  await Promise.allSettled(
    placements.map((p) =>
      recordRotatorHop({
        surface: MARKET_SURFACE,
        rotatorId: null,
        agentId: p.agentId,
        userId: p.userId,
        linkId: impLinkId(p.partner),
        code: "marketplace",
        meta,
      }),
    ),
  );
}

/**
 * Resolve a launch for a partner SERVER-SIDE from today's real pool
 * (or the marketplace house destination). A destination URL is never
 * taken from the request. Returns null for an unknown partner.
 * Records the counted click hop + the dashboard LinkClick, mirroring
 * /api/bridge/rotator/go.
 */
export async function resolveMarketLaunch(
  partner: string,
  meta: { ip: string | null; ua: string | null; referer: string | null },
): Promise<string | null> {
  const today = etDateString();
  let target: { url: string; userId: string | null; agentId: string | null; canonicalPartner?: string } | null = null;

  if (partner === MARKET_HOUSE_PARTNER) {
    target = { url: MARKET_HOUSE_URL, userId: null, agentId: null };
  } else if (partner.startsWith(FREE_DAY_SLOT_PREFIX)) {
    const credit = await db.paidRotatorSlot.findFirst({ where: { id: partner.slice(FREE_DAY_SLOT_PREFIX.length), date: today, source: FREE_DAY_SOURCE, redeemedAt: { not: null } } });
    if (credit) target = { url: credit.url, userId: credit.userId, agentId: null, canonicalPartner: credit.partner };
  } else {
    const paid = await db.paidRotatorSlot.findFirst({ where: { date: today, partner, source: "paid" }, orderBy: { createdAt: "asc" } });
    if (paid) target = { url: paid.url, userId: paid.userId, agentId: null };
    else {
      const pool = await getRotatorPool(today);
      const entry = pool.find((e) => e.partner === partner);
      if (entry) target = { url: entry.url, userId: entry.userId, agentId: entry.agentId ?? null };
    }
  }
  if (!target) return null;

  await recordRotatorHop({
    surface: MARKET_SURFACE,
    rotatorId: null,
    agentId: target.agentId,
    userId: target.userId,
    linkId: clickLinkId(partner),
    code: "marketplace",
    meta,
  });
  await recordLinkClick({ ownerUserId: target.userId, partner: target.canonicalPartner ?? partner, source: "rotator" });
  return target.url;
}

// ─── Operator summary (shape lives in lib/rotator-market.ts) ───────

export async function getRotatorSummary(now = new Date()): Promise<RotatorSummary> {
  const today = etDateString(now);
  const dates = Array.from({ length: 8 }, (_, i) => addDaysToEtDate(today, i - 7)); // today + last 7 days
  const from = dates[0];

  const [days, bids, dayRows, countedImpressions, countedLaunches, activeFreePlacements] = await Promise.all([
    inventoryFor(dates, today),
    db.rotatorBid.findMany({
      where: { day: { date: { in: dates } } },
      select: { amount: true },
    }),
    db.rotatorDay.findMany({ where: { date: { in: dates } } }),
    countedMarketHops("imp", etWallTimeToUtc(from, 0, 0), etWallTimeToUtc(addDaysToEtDate(today, 1), 0, 0)),
    countedMarketHops("click", etWallTimeToUtc(from, 0, 0), etWallTimeToUtc(addDaysToEtDate(today, 1), 0, 0)),
    db.rotatorPlacement.count({ where: { date: today } }),
  ]);

  const daysByState: Record<string, number> = {};
  for (const d of days) daysByState[d.state] = (daysByState[d.state] ?? 0) + 1;
  const confirmed = dayRows.filter((d) => d.status === "CONFIRMED");

  return {
    today,
    window: { from, to: today },
    days,
    daysByState,
    totalBids: bids.length,
    gensBidVolume: bids.reduce((sum, b) => sum + b.amount, 0),
    confirmedWinners: confirmed.length,
    gensDeducted: confirmed.reduce((sum, d) => sum + (d.gensDeducted ? (d.winningBid ?? 0) : 0), 0),
    countedImpressions,
    countedLaunches,
    activeFreePlacements,
    financials: {
      currency: "USD",
      grossCents: 0,
      status: "SIMULATED — paid placements not live; settlement is Slice 6",
    },
  };
}
