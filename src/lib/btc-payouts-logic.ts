/**
 * ─── Real-BTC math + batch rules (pure, no DB) ──────────────────────
 *
 * Every amount inside the Real BTC rails is an integer number of
 * satoshis. BTC decimals exist only at the edges: the admin's form
 * input and the display/CSV formatting. Parsing is string-based —
 * no float ever touches money (0.1 + 0.2 !== 0.3 is not a rounding
 * strategy). The DB/service layer lives in lib/btc-payouts.ts; this
 * file is the testable core (spec: REAL-BTC-ADMIN-SPEC.md).
 */

export const SATS_PER_BTC = 100_000_000;
export const MAX_BTC = 21_000_000;

export type ParseResult = { ok: true; sats: number } | { ok: false; error: string };

/**
 * Strict BTC decimal → sats. Accepts "1", "0.5", "0.00000001".
 * Rejects signs, exponents, thousands separators, >8 decimals,
 * zero, and anything above the 21M supply cap.
 */
export function btcToSats(input: unknown): ParseResult {
  if (typeof input !== "string" && typeof input !== "number") {
    return { ok: false, error: "Amount must be a BTC value like 0.01" };
  }
  const raw = String(input).trim();
  if (!/^\d+(\.\d{1,8})?$/.test(raw)) {
    return { ok: false, error: "Enter a BTC amount with up to 8 decimal places (e.g. 0.01)" };
  }
  const [whole, frac = ""] = raw.split(".");
  const sats = Number(whole) * SATS_PER_BTC + Number(frac.padEnd(8, "0"));
  if (!Number.isSafeInteger(sats) || sats <= 0) {
    return { ok: false, error: "Amount must be more than 0 BTC" };
  }
  if (sats > MAX_BTC * SATS_PER_BTC) {
    return { ok: false, error: "Amount exceeds the total Bitcoin supply — check the number" };
  }
  return { ok: true, sats };
}

/** Sats → exact BTC decimal string for CSV (always 8 places). */
export function satsToBtcCsv(sats: number): string {
  const whole = Math.trunc(sats / SATS_PER_BTC);
  const frac = Math.abs(sats % SATS_PER_BTC);
  return `${whole}.${String(frac).padStart(8, "0")}`;
}

/** Sats → human display: "1,234,567 sats (0.01234567 BTC)". */
export function formatSats(sats: number): string {
  return `${sats.toLocaleString("en-US")} sats`;
}

export function formatSatsWithBtc(sats: number): string {
  return `${formatSats(sats)} (${satsToBtcCsv(sats)} BTC)`;
}

/** Ledger balance: everything funded minus everything actually PAID out. */
export function ledgerBalance(fundedSats: number, paidOutSats: number): number {
  return fundedSats - paidOutSats;
}

/**
 * Equal split of a run across N members, integer sats, floor.
 * The remainder is NOT distributed — it stays in the ledger balance.
 */
export function splitEqually(
  totalSats: number,
  count: number,
): { perLine: number; distributed: number; remainder: number } {
  if (count <= 0) return { perLine: 0, distributed: 0, remainder: totalSats };
  const perLine = Math.floor(totalSats / count);
  const distributed = perLine * count;
  return { perLine, distributed, remainder: totalSats - distributed };
}

/** A batch (or its edited lines) may never exceed the current balance. */
export function exceedsBalance(totalSats: number, balanceSats: number): boolean {
  return totalSats > balanceSats;
}

/* ─── The payout algo (Dave's amendment, 2026-11-21) ─────────────────
 * A run's total is COMPUTED from the pool, never typed:
 *   distributable = floor(balanceSats × payoutBps / 10000)
 *   per-member    = equal split of the distributable (floor)
 *   remainder     = distributable − distributed — stays in the pool.
 * payoutBps is chosen per run; 5000 (50%) is the default. The algo
 * sets the run's STARTING amounts — DRAFT lines stay editable after.
 * Edge cases refuse with a clear error, never a crash and never a
 * batch of zero-value lines. */
export const DEFAULT_PAYOUT_BPS = 5000;

export interface RunPlan {
  balanceSats: number;
  payoutBps: number;
  memberCount: number;
  distributableSats: number;
  perLineSats: number;
  distributedSats: number;
  remainderSats: number;
}

export type RunPlanResult = { ok: true; plan: RunPlan } | { ok: false; error: string };

export function computeRunPlan(balanceSats: number, payoutBps: number, memberCount: number): RunPlanResult {
  if (!Number.isSafeInteger(payoutBps) || payoutBps < 1 || payoutBps > 10_000) {
    return { ok: false, error: "Payout share must be between 0.01% and 100% of the pool" };
  }
  if (!Number.isSafeInteger(balanceSats) || balanceSats <= 0) {
    return { ok: false, error: "The real-BTC pool is empty — fund the ledger before creating a payout run" };
  }
  if (!Number.isSafeInteger(memberCount) || memberCount <= 0) {
    return { ok: false, error: "No member has saved a BTC payout address yet — there is nobody to pay" };
  }
  // BigInt for the multiply: balance × 10000 can exceed 2^53 at the
  // theoretical supply cap, and money math never rides on a float.
  const distributableSats = Number((BigInt(balanceSats) * BigInt(payoutBps)) / BigInt(10_000));
  if (distributableSats <= 0) {
    return { ok: false, error: "That share of the current pool is less than 1 sat — nothing to distribute" };
  }
  const split = splitEqually(distributableSats, memberCount);
  if (split.perLine <= 0) {
    return {
      ok: false,
      error: "The distributable amount is too small to give every eligible member at least 1 sat — raise the share or fund the pool",
    };
  }
  return {
    ok: true,
    plan: {
      balanceSats,
      payoutBps,
      memberCount,
      distributableSats,
      perLineSats: split.perLine,
      distributedSats: split.distributed,
      remainderSats: split.remainder,
    },
  };
}

/* ─── Batch state machine ────────────────────────────────────────────
 * DRAFT → APPROVED → PAID, CANCELLED from DRAFT or APPROVED.
 * No state skips APPROVED (the spend gate), and PAID additionally
 * requires a txid — enforced in the service layer via canMarkPaid. */
export type BatchStatus = "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";

const TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: BatchStatus): boolean {
  return (TRANSITIONS[from as BatchStatus] ?? []).includes(to);
}

/** PAID is only reachable from APPROVED and only with a real txid. */
export function canMarkPaid(from: string, txid: unknown): boolean {
  return from === "APPROVED" && typeof txid === "string" && txid.trim().length > 0;
}

/** Roster display: first 8 + last 6, never the whole address in admin lists. */
export function maskAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/* ─── Collection toggle ──────────────────────────────────────────────
 * AppSetting "btcexperiment:collect_btc_addresses" = "on" | "off",
 * default OFF. /bridge renders the BTC block optional (off) or as
 * payout collection (on) based on this one read. */
export const COLLECT_BTC_KEY = "btcexperiment:collect_btc_addresses";

export function parseCollectSetting(value: string | null | undefined): boolean {
  return value === "on";
}

export type BridgeBtcMode = "optional" | "collect";

export function bridgeBtcMode(collectOn: boolean): BridgeBtcMode {
  return collectOn ? "collect" : "optional";
}

/* ─── CSV export (the APPROVED batch → Dave's wallet) ─────────────── */
export interface CsvLine {
  address: string;
  amountSats: number;
  member: string;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildPayoutCsv(lines: CsvLine[]): string {
  const rows = lines.map((l) =>
    [l.address, satsToBtcCsv(l.amountSats), String(l.amountSats), csvCell(l.member)].join(","),
  );
  return ["address,amount_btc,amount_sats,member", ...rows].join("\n") + "\n";
}
