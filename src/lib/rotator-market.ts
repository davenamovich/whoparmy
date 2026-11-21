/**
 * ─── ROTATOR MARKETPLACE — pure core (Whop Army 2.0, Slice 5) ──────
 *
 * The public face of the EXISTING daily rotator (lib/rotator.ts).
 * Nothing here invents new auction mechanics or new DB states: the
 * lifecycle and inventory vocabularies below are DERIVED from the
 * rows the rotator already keeps (RotatorDay.status, RotatorBid
 * existence, RotatorPlacement.date), so the marketplace can never
 * disagree with the auction underneath it.
 *
 * Placement lifecycle — from RotatorPlacement.date vs the ET today:
 *   date >  today (ET)  → SCHEDULED
 *   date == today (ET)  → ACTIVE
 *   date <  today (ET)  → EXPIRED
 * The confirmed auction winner for a day is a placement too (the
 * winner fields on RotatorDay); its lifecycle follows the day's date
 * by the same rule.
 *
 * Inventory — one ET day of auction inventory, from RotatorDay:
 *   status CANCELLED                 → CANCELLED
 *   status CONFIRMED                 → SOLD (a winner was confirmed)
 *   past day, OPEN or never opened   → EXPIRED (closed unconfirmed)
 *   OPEN with ≥1 bid, not confirmed  → RESERVED (bids are placed;
 *                                      nothing is deducted until an
 *                                      operator confirms — "reserved"
 *                                      describes demand, not payment)
 *   OPEN or never opened, no bids    → AVAILABLE
 *
 * Bidding closes 23:50 ET (Dave's doctrine): the countdown target is
 * the next 23:50 America/New_York wall-clock moment.
 *
 * No imports: the pure cores in this repo stay import-free so
 * `node --test` can load them directly (same pattern as
 * lib/gate-paths.ts and lib/agent-profile.ts).
 */

export type PlacementLifecycle = "SCHEDULED" | "ACTIVE" | "EXPIRED";
export type InventoryState = "AVAILABLE" | "RESERVED" | "SOLD" | "EXPIRED" | "CANCELLED";
export type MarketPlacementSource = "auction" | "free-placement" | "house";

export interface MarketPlacement {
  partner: string;
  partnerName: string;
  /** Destination host only (e.g. "agent37.com") — the full URL stays
   *  behind the launch redirect, matching the exposure of the
   *  existing public rotator surfaces. */
  host: string | null;
  source: MarketPlacementSource;
  /** Owner display name when the placement belongs to a member;
   *  null for house placements. Never an id or an email. */
  ownerName: string | null;
  lifecycle: PlacementLifecycle;
}

export interface MarketDayInventory {
  date: string;
  state: InventoryState;
  bidCount: number;
}

export function placementLifecycle(date: string, today: string): PlacementLifecycle {
  if (date > today) return "SCHEDULED";
  if (date < today) return "EXPIRED";
  return "ACTIVE";
}

export function inventoryState(input: {
  /** RotatorDay.status, or null when no RotatorDay row exists yet. */
  status: string | null;
  bidCount: number;
  date: string;
  today: string;
}): InventoryState {
  if (input.status === "CANCELLED") return "CANCELLED";
  if (input.status === "CONFIRMED") return "SOLD";
  if (input.date < input.today) return "EXPIRED";
  if (input.bidCount > 0) return "RESERVED";
  return "AVAILABLE";
}

// ─── ET wall-clock math (Intl only, no date library) ───────────────

const ET_TZ = "America/New_York";

export function etDateStringFrom(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Add n days to an ET yyyy-mm-dd date string (pure calendar math). */
export function addDaysToEtDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * The UTC instant of an ET wall-clock time on an ET date, correcting
 * for the offset in force that day (EST vs EDT) — the same iterative
 * correction lib/rotator-v2.ts uses for ET midnight.
 */
export function etWallTimeToUtc(dateStr: string, hour: number, minute: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ET_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    const represented = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
    guess += target - represented;
  }
  return new Date(guess);
}

/**
 * The next bidding close: today 23:50 ET, or tomorrow's when today's
 * has passed. `etDate` is the ET calendar date the close belongs to.
 */
export function nextBiddingClose(now: Date): { etDate: string; closesAt: string } {
  const today = etDateStringFrom(now);
  const todaysClose = etWallTimeToUtc(today, 23, 50);
  if (now.getTime() < todaysClose.getTime()) {
    return { etDate: today, closesAt: todaysClose.toISOString() };
  }
  const tomorrow = addDaysToEtDate(today, 1);
  return { etDate: tomorrow, closesAt: etWallTimeToUtc(tomorrow, 23, 50).toISOString() };
}

/** UTC instant the ET day ends (the next ET midnight). */
export function etDayEndsAt(dateStr: string): string {
  return etWallTimeToUtc(addDaysToEtDate(dateStr, 1), 0, 0).toISOString();
}

// ─── Spot windows (Dave, 2026-11-21) ───────────────────────────────
// Open traffic-pool spots reset at 23:50 ET for the next 24 hours —
// the same 23:50 moment bidding closes. A spot window runs 23:50 ET
// → the next 23:50 ET and is keyed by the ET date on which it OPENS.
// The window math lives here, beside nextBiddingClose, because this
// module owns the ET conversion utilities and pure cores in this
// repo cross-import types only, never values (traffic-pool-core.ts
// holds the allotment policy and the pool decision).
//
// A placement dated D (an ET calendar date, like every
// RotatorPlacement row) rotates almost entirely inside the window
// that opened the previous evening — 00:00–23:50 of D sits in
// window D−1, only the last ten minutes of D spill into window D —
// so placement day D is governed by window key D−1, deterministically,
// as a pure function of the placement's date. Each placement belongs
// to exactly one date and each date to exactly one window, so
// consumption can never double-count across a 23:50 reset and
// yesterday's consumption can never leak into the new window.
//
// The AUCTION day (RotatorDay / RotatorBid) stays an ET CALENDAR
// day — only pool spots moved to the 23:50 window. The two clocks
// are deliberately separate: bidding closes at 23:50 ET for the
// next calendar day's auction while the spot window that opens at
// the same moment funds the placements that start rotating at
// midnight.

export const SPOT_WINDOW_OPEN_HOUR = 23;
export const SPOT_WINDOW_OPEN_MINUTE = 50;

export interface SpotWindow {
  /** ET yyyy-mm-dd on which the window opens (its 23:50 start date). */
  key: string;
  /** UTC instant the window opens (23:50 ET on `key`). */
  startUtc: string;
  /** UTC instant the window closes / the next window opens (23:50 ET on key+1). */
  endUtc: string;
}

/** The spot window containing `instant`. */
export function spotWindowFor(instant: Date): SpotWindow {
  const etToday = etDateStringFrom(instant);
  const todaysOpen = etWallTimeToUtc(etToday, SPOT_WINDOW_OPEN_HOUR, SPOT_WINDOW_OPEN_MINUTE);
  if (instant.getTime() >= todaysOpen.getTime()) {
    const nextKey = addDaysToEtDate(etToday, 1);
    return {
      key: etToday,
      startUtc: todaysOpen.toISOString(),
      endUtc: etWallTimeToUtc(nextKey, SPOT_WINDOW_OPEN_HOUR, SPOT_WINDOW_OPEN_MINUTE).toISOString(),
    };
  }
  const key = addDaysToEtDate(etToday, -1);
  return {
    key,
    startUtc: etWallTimeToUtc(key, SPOT_WINDOW_OPEN_HOUR, SPOT_WINDOW_OPEN_MINUTE).toISOString(),
    endUtc: todaysOpen.toISOString(),
  };
}

/** The window that governs a placement dated `date` (ET yyyy-mm-dd):
 *  the window that opened the previous evening, key = date − 1. */
export function spotWindowKeyForPlacementDate(date: string): string {
  return addDaysToEtDate(date, -1);
}

/** The placement date a spot window funds: key + 1. Placements dated
 *  this ET date are the ones rotating under the window's spots. */
export function placementDateForSpotWindow(windowKey: string): string {
  return addDaysToEtDate(windowKey, 1);
}

/** Operator summary shape (GET /api/admin/rotator-summary). Lives in
 *  the pure core so client components can type against it without
 *  importing the server module. The financials block is explicitly
 *  SIMULATED until paid placements exist (Slice 6). */
export interface RotatorSummary {
  today: string;
  window: { from: string; to: string };
  days: MarketDayInventory[];
  daysByState: Record<string, number>;
  totalBids: number;
  gensBidVolume: number;
  confirmedWinners: number;
  gensDeducted: number;
  countedImpressions: number;
  countedLaunches: number;
  activeFreePlacements: number;
  financials: { currency: "USD"; grossCents: 0; status: string };
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}
