import "server-only";
import { db } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/site-gate";
import {
  COLLECT_BTC_KEY,
  buildPayoutCsv,
  canMarkPaid,
  canTransition,
  computeRunPlan,
  availableBalance,
  exceedsBalance,
  ledgerBalance,
  maskAddress,
  parseCollectSetting,
  type BatchStatus,
  type CsvLine,
  type RunPlanResult,
} from "@/lib/btc-payouts-logic";

/**
 * ─── Real BTC rails — service layer (Dave, 2026-11-21) ─────────────
 *
 * Internal accounting for The BTC Experiment's real-BTC payouts:
 * a funding ledger (what Dave has put in), payout batches (equal
 * splits across members who saved a payout address), and the
 * collection toggle that turns /bridge address collection on.
 *
 * Doctrine: NO CUSTODY. The app never holds keys, never generates
 * wallets, never sends BTC. Dave approves a batch here (the spend
 * gate), exports its CSV, pays from his own wallet, and pastes the
 * txid back to mark it PAID. All money is integer sats — the pure
 * math lives in lib/btc-payouts-logic.ts and is unit-tested there.
 */

export class BtcAdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ─── Collection toggle ──────────────────────────────────────────── */

export async function getCollectBtcAddresses(): Promise<boolean> {
  try {
    return parseCollectSetting(await getSetting(COLLECT_BTC_KEY));
  } catch {
    // DB not ready (first boot) — collection stays OFF, /bridge
    // keeps its optional presentation. Never fail open into a
    // "required" state the operator didn't choose.
    return false;
  }
}

export async function setCollectBtcAddresses(on: boolean): Promise<boolean> {
  await setSetting(COLLECT_BTC_KEY, on ? "on" : "off");
  return getCollectBtcAddresses();
}

/* ─── Funding ledger ─────────────────────────────────────────────── */

export interface LedgerState {
  fundedSats: number;
  paidOutSats: number;
  /** funded − PAID: the sats actually still held. */
  balanceSats: number;
  /** APPROVED, not yet PAID: promised to members, not yet sent. */
  committedSats: number;
  /** balance − committed: what a new run or approval may spend. */
  availableSats: number;
}

export async function getLedgerState(): Promise<LedgerState> {
  const [funding, paid, approved] = await Promise.all([
    db.btcFundingEntry.aggregate({ _sum: { amountSats: true } }),
    db.btcPayoutBatch.aggregate({ _sum: { totalSats: true }, where: { status: "PAID" } }),
    db.btcPayoutBatch.aggregate({ _sum: { totalSats: true }, where: { status: "APPROVED" } }),
  ]);
  const fundedSats = funding._sum.amountSats ?? 0;
  const paidOutSats = paid._sum.totalSats ?? 0;
  const committedSats = approved._sum.totalSats ?? 0;
  const balanceSats = ledgerBalance(fundedSats, paidOutSats);
  return { fundedSats, paidOutSats, balanceSats, committedSats, availableSats: availableBalance(balanceSats, committedSats) };
}

export async function addFundingEntry(input: { amountSats: number; txid?: string; note?: string }) {
  if (!Number.isSafeInteger(input.amountSats) || input.amountSats <= 0) {
    throw new BtcAdminError("Funding amount must be a positive number of sats");
  }
  return db.btcFundingEntry.create({
    data: {
      amountSats: input.amountSats,
      txid: input.txid?.trim() || null,
      note: input.note?.trim() ?? "",
    },
  });
}

/* ─── Roster ─────────────────────────────────────────────────────── */

export function memberLabel(user: { name: string | null; whopUsername: string | null; id: string }): string {
  return user.name ?? user.whopUsername ?? user.id;
}

export interface RosterEntry {
  userId: string;
  member: string;
  maskedAddress: string | null;
}

export async function getRoster(): Promise<{ withAddress: RosterEntry[]; withoutAddress: RosterEntry[] }> {
  const users = await db.user.findMany({
    select: { id: true, name: true, whopUsername: true, btcReceiveAddress: true },
    orderBy: { createdAt: "asc" },
  });
  const withAddress: RosterEntry[] = [];
  const withoutAddress: RosterEntry[] = [];
  for (const u of users) {
    const entry: RosterEntry = {
      userId: u.id,
      member: memberLabel(u),
      maskedAddress: u.btcReceiveAddress ? maskAddress(u.btcReceiveAddress) : null,
    };
    (u.btcReceiveAddress ? withAddress : withoutAddress).push(entry);
  }
  return { withAddress, withoutAddress };
}

/* ─── Payout batches ─────────────────────────────────────────────── */

async function recomputeBatchTotal(batchId: string): Promise<number> {
  const agg = await db.btcPayoutLine.aggregate({ _sum: { amountSats: true }, where: { batchId } });
  const totalSats = agg._sum.amountSats ?? 0;
  await db.btcPayoutBatch.update({ where: { id: batchId }, data: { totalSats } });
  return totalSats;
}

/** Guards a NEW spend (create / edit / approve) against the sats not
 *  already promised to other APPROVED batches. */
async function assertWithinBalance(totalSats: number): Promise<void> {
  const { balanceSats, committedSats, availableSats } = await getLedgerState();
  if (exceedsBalance(totalSats, availableSats)) {
    const held = committedSats > 0
      ? ` (${balanceSats.toLocaleString("en-US")} sats held, ${committedSats.toLocaleString("en-US")} already approved for other runs)`
      : "";
    throw new BtcAdminError(
      `This run totals ${totalSats.toLocaleString("en-US")} sats but only ${availableSats.toLocaleString("en-US")} sats are available${held}. Fund the ledger, pay or cancel an approved run, or lower this one first.`,
      409,
    );
  }
}

async function eligibleMembers() {
  return db.user.findMany({
    where: { btcReceiveAddress: { not: null } },
    select: { id: true, btcReceiveAddress: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Preview the algo against the LIVE pool — no writes. The admin UI
 * shows these exact numbers (balance, share, eligible members,
 * per-member sats, undistributed remainder) before a run is created.
 */
export async function previewRun(payoutBps: number): Promise<RunPlanResult> {
  const [{ availableSats }, members] = await Promise.all([getLedgerState(), eligibleMembers()]);
  return computeRunPlan(availableSats, payoutBps, members.length);
}

/**
 * Create a run FROM THE POOL (Dave's algo amendment, 2026-11-21):
 * the total is computed — floor(balance × payoutBps / 10000) split
 * equally across members with a saved address — never typed. The
 * split remainder stays in the balance. Lines snapshot the address
 * AS SAVED NOW; later member changes never rewrite this run. The
 * algo sets starting amounts only: DRAFT lines stay editable.
 */
export async function createBatch(input: { payoutBps: number; note?: string }) {
  const members = await eligibleMembers();
  const { availableSats } = await getLedgerState();
  const result = computeRunPlan(availableSats, input.payoutBps, members.length);
  if (!result.ok) throw new BtcAdminError(result.error, 409);
  const plan = result.plan;
  const batch = await db.btcPayoutBatch.create({
    data: {
      totalSats: plan.distributedSats,
      status: "DRAFT",
      note: input.note?.trim() ?? "",
      lines: {
        create: members.map((m) => ({
          userId: m.id,
          address: m.btcReceiveAddress as string,
          amountSats: plan.perLineSats,
        })),
      },
    },
    include: { lines: true },
  });
  return { batch, plan };
}

async function getBatchOrThrow(batchId: string) {
  const batch = await db.btcPayoutBatch.findUnique({ where: { id: batchId }, include: { lines: true } });
  if (!batch) throw new BtcAdminError("Payout batch not found", 404);
  return batch;
}

export async function editLine(batchId: string, lineId: string, amountSats: number) {
  const batch = await getBatchOrThrow(batchId);
  if (batch.status !== "DRAFT") throw new BtcAdminError("Lines can only be edited while the batch is a DRAFT.", 409);
  if (!Number.isSafeInteger(amountSats) || amountSats < 0) {
    throw new BtcAdminError("Line amount must be 0 sats or more");
  }
  const line = batch.lines.find((l) => l.id === lineId);
  if (!line) throw new BtcAdminError("Payout line not found", 404);
  // Validate the PROSPECTIVE total before persisting anything — a
  // rejected edit must leave the batch exactly as it was.
  const prospectiveTotal = batch.totalSats - line.amountSats + amountSats;
  await assertWithinBalance(prospectiveTotal);
  await db.btcPayoutLine.update({ where: { id: lineId }, data: { amountSats } });
  await recomputeBatchTotal(batchId);
  return getBatchOrThrow(batchId);
}

export async function removeLine(batchId: string, lineId: string) {
  const batch = await getBatchOrThrow(batchId);
  if (batch.status !== "DRAFT") throw new BtcAdminError("Lines can only be removed while the batch is a DRAFT.", 409);
  const line = batch.lines.find((l) => l.id === lineId);
  if (!line) throw new BtcAdminError("Payout line not found", 404);
  await db.btcPayoutLine.delete({ where: { id: lineId } });
  await recomputeBatchTotal(batchId);
  return getBatchOrThrow(batchId);
}

/** The spend gate: DRAFT → APPROVED. Balance is re-validated here. */
export async function approveBatch(batchId: string) {
  const batch = await getBatchOrThrow(batchId);
  if (!canTransition(batch.status, "APPROVED")) {
    throw new BtcAdminError(`A ${batch.status} batch cannot be approved.`, 409);
  }
  if (batch.lines.length === 0) throw new BtcAdminError("Cannot approve a batch with no payout lines.", 409);
  await assertWithinBalance(batch.totalSats);
  return db.btcPayoutBatch.update({ where: { id: batchId }, data: { status: "APPROVED" } });
}

export async function cancelBatch(batchId: string) {
  const batch = await getBatchOrThrow(batchId);
  if (!canTransition(batch.status, "CANCELLED")) {
    throw new BtcAdminError(`A ${batch.status} batch cannot be cancelled.`, 409);
  }
  return db.btcPayoutBatch.update({ where: { id: batchId }, data: { status: "CANCELLED" } });
}

/** Dave paid externally → paste the txid → PAID. TxID is required. */
export async function markBatchPaid(batchId: string, txid: unknown) {
  const batch = await getBatchOrThrow(batchId);
  if (!canMarkPaid(batch.status, txid)) {
    throw new BtcAdminError(
      batch.status !== "APPROVED"
        ? `A ${batch.status} batch cannot be marked PAID — it must be APPROVED first.`
        : "A txid is required to mark a batch PAID.",
      409,
    );
  }
  // Belt and braces: this batch is already counted as committed, so
  // check it against the sats actually held, not the available figure.
  const { balanceSats } = await getLedgerState();
  if (exceedsBalance(batch.totalSats, balanceSats)) {
    throw new BtcAdminError(
      `This batch totals ${batch.totalSats.toLocaleString("en-US")} sats but the ledger only holds ${balanceSats.toLocaleString("en-US")} sats.`,
      409,
    );
  }
  return db.btcPayoutBatch.update({
    where: { id: batchId },
    data: { status: "PAID", txid: (txid as string).trim(), paidAt: new Date() },
  });
}

export async function transitionBatch(batchId: string, action: string, txid?: unknown) {
  switch (action) {
    case "approve":
      return approveBatch(batchId);
    case "cancel":
      return cancelBatch(batchId);
    case "paid":
      return markBatchPaid(batchId, txid);
    default:
      throw new BtcAdminError(`Unknown batch action: ${action}`);
  }
}

/* ─── Admin overview + CSV ───────────────────────────────────────── */

export async function getBatchDetail(batchId: string) {
  const batch = await getBatchOrThrow(batchId);
  const users = await db.user.findMany({
    where: { id: { in: batch.lines.map((l) => l.userId) } },
    select: { id: true, name: true, whopUsername: true },
  });
  const labels = new Map(users.map((u) => [u.id, memberLabel(u)]));
  return {
    ...batch,
    lines: batch.lines.map((l) => ({ ...l, member: labels.get(l.userId) ?? l.userId })),
  };
}

export async function listBatchesWithLines() {
  const batches = await db.btcPayoutBatch.findMany({ orderBy: { createdAt: "desc" }, select: { id: true } });
  return Promise.all(batches.map((b) => getBatchDetail(b.id)));
}

export async function getAdminOverview() {
  const [ledger, entries, roster, batches, collectOn] = await Promise.all([
    getLedgerState(),
    db.btcFundingEntry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getRoster(),
    listBatchesWithLines(),
    getCollectBtcAddresses(),
  ]);
  return { ledger, entries, roster, batches, collectOn };
}

/** CSV for Dave's wallet — the APPROVED batch (PAID stays exportable for records). */
export async function getBatchCsv(batchId: string): Promise<string> {
  const batch = await getBatchDetail(batchId);
  if (batch.status !== "APPROVED" && batch.status !== "PAID") {
    throw new BtcAdminError(`CSV export is available once a batch is APPROVED (this one is ${batch.status}).`, 409);
  }
  const lines: CsvLine[] = batch.lines.map((l) => ({
    address: l.address,
    amountSats: l.amountSats,
    member: l.member,
  }));
  return buildPayoutCsv(lines);
}

export type { BatchStatus };
