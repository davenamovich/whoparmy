/**
 * ─── AGENT CARD — pure core ─────────────────────────────────────────
 *
 * Dave (2026-11-21): "Add spots, analytics, clicks to agent card.
 * Give options to owners to launch token in bankr and use proceeds
 * to buy coin."
 *
 * This module is the pure half (no DB, no server imports — client
 * components type against it): token-address shape validation, the
 * proceeds-preference validation, ET calendar windows, and the click
 * summary math. The server half is lib/agent-card.ts.
 *
 * Honesty rules baked in here:
 *  - Clicks join at MEMBER level only. LinkClick carries an owner
 *    user id and a partner key — there is NO per-agent click join in
 *    the data, so the card labels these numbers as the member's link
 *    clicks, never as the agent's own.
 *  - The proceeds preference is a RECORDED owner instruction. Nothing
 *    in this build executes it: no wallet writes, no Bankr API calls.
 *    Execution stays in Bankr, by the owner's own hand, until a write
 *    integration is separately approved.
 */

/** Bankr's own app surface. Token launches happen there, in the
 *  owner's own Bankr session (Bankr docs: bankr.bot → "launch a
 *  token"). We link out; we never launch for the owner. */
export const BANKR_LAUNCH_URL = "https://bankr.bot/terminal";

export type TokenChain = "EVM" | "SOLANA";

export interface ClassifiedTokenAddress {
  chain: TokenChain;
  address: string;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// Base58 alphabet (no 0, O, I, l); Solana addresses are 32–44 chars.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Classify a pasted token contract address by shape. EVM requires the
 * 0x prefix + 40 hex chars; Solana is base58, 32–44 chars. Anything
 * else returns null — the caller rejects it, nothing is saved.
 */
export function classifyTokenAddress(raw: string): ClassifiedTokenAddress | null {
  const address = typeof raw === "string" ? raw.trim() : "";
  if (!address) return null;
  if (EVM_ADDRESS.test(address)) return { chain: "EVM", address };
  if (SOLANA_ADDRESS.test(address)) return { chain: "SOLANA", address };
  return null;
}

export type ProceedsTarget = "BTC" | "TOKEN";

export interface ProceedsPreference {
  enabled: boolean;
  pct: number; // 0–100
  target: ProceedsTarget;
}

export const DEFAULT_PROCEEDS: ProceedsPreference = { enabled: false, pct: 0, target: "BTC" };

export type ProceedsParse =
  | { ok: true; value: ProceedsPreference }
  | { ok: false; error: string };

/**
 * Validate a proceeds→buy-coin preference. `hasToken` is whether the
 * agent will have a saved Bankr token address AFTER this save (the
 * TOKEN target is meaningless without one, so it is refused).
 */
export function parseProceedsPreference(input: unknown, hasToken: boolean): ProceedsParse {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Proceeds preference must be an object." };
  }
  const { enabled, pct, target } = input as { enabled?: unknown; pct?: unknown; target?: unknown };
  if (typeof enabled !== "boolean") {
    return { ok: false, error: "Proceeds toggle must be true or false." };
  }
  if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 0 || pct > 100) {
    return { ok: false, error: "Proceeds percentage must be a whole number from 0 to 100." };
  }
  if (target !== "BTC" && target !== "TOKEN") {
    return { ok: false, error: "Proceeds target must be BTC or the agent's token." };
  }
  if (target === "TOKEN" && !hasToken) {
    return { ok: false, error: "Save the agent's Bankr token address before pointing proceeds at the token." };
  }
  return { ok: true, value: { enabled, pct, target } };
}

// ─── ET calendar helpers ────────────────────────────────────────────
// Same Intl technique as lib/traffic-pool.ts / lib/rotator-market.ts
// (duplicated, per the traffic-pool precedent, to keep this slice
// self-contained): the pool day is the America/New_York calendar day,
// and the click windows are ET calendar windows too.

export const AGENT_CARD_ET_TZ = "America/New_York";

/** ET calendar date (yyyy-mm-dd) containing the instant `d`. */
export function etDateStringFrom(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENT_CARD_ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Add `n` days to an ET yyyy-mm-dd date string (pure calendar math). */
export function addDaysToEtDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * The UTC instant of an ET wall-clock midnight on an ET date,
 * correcting for the offset in force that day (EST vs EDT) — the
 * iterative correction the rotator uses for ET midnight.
 */
export function etMidnightUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: AGENT_CARD_ET_TZ,
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

export interface ClickWindows {
  /** ET yyyy-mm-dd of "today". */
  todayEt: string;
  /** Inclusive start of today (ET midnight). */
  todayStart: Date;
  /** Inclusive start of the 7-day window (ET midnight, 6 days before today). */
  weekStart: Date;
  /** Inclusive start of the 30-day window (ET midnight, 29 days before today). */
  monthStart: Date;
  /** The last 7 ET dates, oldest → newest, today last. */
  last7EtDates: string[];
}

export function clickWindows(now: Date): ClickWindows {
  const todayEt = etDateStringFrom(now);
  const weekDate = addDaysToEtDate(todayEt, -6);
  const monthDate = addDaysToEtDate(todayEt, -29);
  return {
    todayEt,
    todayStart: etMidnightUtc(todayEt),
    weekStart: etMidnightUtc(weekDate),
    monthStart: etMidnightUtc(monthDate),
    last7EtDates: Array.from({ length: 7 }, (_, i) => addDaysToEtDate(todayEt, i - 6)),
  };
}

export interface ClickRow {
  partner: string;
  createdAt: Date;
}

export interface ClickSummary {
  today: number;
  last7Days: number;
  last30Days: number;
  /** Partner key with the most clicks inside the 30-day window. */
  topPartner: { partner: string; clicks: number } | null;
}

/**
 * Summarize click rows the server fetched for the 30-day window.
 * Counts are pure functions of the rows and the ET windows; rows
 * outside the window are ignored (defensive — the server pre-filters).
 */
export function summarizeClicks(rows: ClickRow[], now: Date): ClickSummary {
  const w = clickWindows(now);
  let today = 0;
  let last7Days = 0;
  let last30Days = 0;
  const perPartner = new Map<string, number>();
  for (const r of rows) {
    const t = r.createdAt.getTime();
    if (t < w.monthStart.getTime()) continue;
    last30Days++;
    perPartner.set(r.partner, (perPartner.get(r.partner) ?? 0) + 1);
    if (t >= w.weekStart.getTime()) last7Days++;
    if (t >= w.todayStart.getTime()) today++;
  }
  let topPartner: ClickSummary["topPartner"] = null;
  for (const [partner, clicks] of perPartner) {
    if (!topPartner || clicks > topPartner.clicks) topPartner = { partner, clicks };
  }
  return { today, last7Days, last30Days, topPartner };
}

// ─── Card stats wire shape (GET /api/agents/[id]/card) ─────────────

export interface AgentCardStats {
  agentId: string;
  spots: {
    /** Traffic-pool slots used in the CURRENT spot window
     *  (AgentTrafficDay, keyed by 23:50 ET window since 2026-11-21). */
    todayUsed: number;
    todayTotal: number;
    /** Slots used across the last 7 spot windows, current included. */
    last7DaysUsed: number;
  };
  clicks: {
    /** Clicks are counted per MEMBER (LinkClick has no per-agent
     *  join) — the UI labels them exactly that way. */
    scope: "member";
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
    topLink: { partner: string; name: string; clicks: number } | null;
  };
  bankr: {
    tokenAddress: string | null;
    tokenChain: TokenChain | null;
    proceeds: ProceedsPreference;
  };
}

/** Display mask for a saved address: first 8 + last 6 (the BTC admin
 *  roster's masking precedent). */
export function maskAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
