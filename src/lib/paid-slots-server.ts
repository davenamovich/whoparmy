import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { etDateString } from "@/lib/rotator";
import { addDaysToEtDate, etWallTimeToUtc } from "@/lib/rotator-market";
import { FREE_DAY_SOURCE } from "@/lib/free-day-core";
import { splitCents } from "@/lib/settlement";
import { BASE_USDC, HOUSE_EVM, INTENT_TTL_MS, isIntentExpired, slotPriceCents, verifyUsdcPayment } from "@/lib/paid-slots";

export const placedPaidSlot: Prisma.PaidRotatorSlotWhereInput = { OR: [{ source: "paid" }, { redeemedAt: { not: null } }] };

export function mintFreeDaySlotCredit(store: Prisma.TransactionClient, userId: string, date: string, claimId: string, now: Date) {
  return store.paidRotatorSlot.create({ data: {
    userId, date, intentId: `${FREE_DAY_SOURCE}:${claimId}`, source: FREE_DAY_SOURCE,
    partner: "", url: "", txHash: "", priceCents: 0, expiresAt: etWallTimeToUtc(addDaysToEtDate(date, 7), 0, 0), createdAt: now,
  } });
}

export async function redeemFreeDaySlotCredit(userId: string, input: { creditId: string; date: unknown; partner: unknown }, now = new Date()) {
  const today = etDateString(now);
  const { creditId, date, partner } = input;
  if (typeof date !== "string" || ![today, addDaysToEtDate(today, 1), addDaysToEtDate(today, 2)].includes(date)) throw new Error("Choose today, tomorrow, or the day after");
  if (typeof partner !== "string" || !partner) throw new Error("Choose a saved link");
  const link = await db.engineLink.findUnique({ where: { userId_partner: { userId, partner } } });
  if (!link) throw new Error("Save that link first");
  const result = await db.paidRotatorSlot.updateMany({
    where: { id: creditId, userId, source: FREE_DAY_SOURCE, redeemedAt: null, expiresAt: { gt: date === today ? now : etWallTimeToUtc(date, 0, 0) } },
    data: { date, partner, url: link.url, redeemedAt: now },
  });
  if (!result.count) throw new Error("Credit is expired, already used, or unavailable for that date");
  return db.paidRotatorSlot.findUniqueOrThrow({ where: { id: creditId } });
}

export async function getPaidSlotPrices(now = new Date()) {
  const today = etDateString(now);
  const dates = [0, 1, 2].map((n) => addDaysToEtDate(today, n));
  const counts = await Promise.all(dates.map((date) => db.paidRotatorSlot.count({ where: { date, source: "paid" } })));
  return dates.map((date, i) => ({ date, priceCents: slotPriceCents({ date, today, paidSlotsSoldThatDay: counts[i], activeUsers: 0 }) }));
}

export async function createIntent(userId: string, input: { date: unknown; partner: unknown }) {
  const today = etDateString();
  const date = typeof input.date === "string" ? input.date : "";
  const partner = typeof input.partner === "string" ? input.partner : "";
  if (![today, addDaysToEtDate(today, 1), addDaysToEtDate(today, 2)].includes(date)) throw new Error("Choose today, tomorrow, or the day after");
  const link = await db.engineLink.findUnique({ where: { userId_partner: { userId, partner } } });
  if (!link) throw new Error("Save that link first");
  const sold = await db.paidRotatorSlot.count({ where: { date, source: "paid" } });
  const priceCents = slotPriceCents({ date, today, paidSlotsSoldThatDay: sold, activeUsers: 0 });
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
  const intent = await db.rotatorPurchaseIntent.create({ data: { userId, date, partner, priceCents, expiresAt } });
  return { ...intent, houseEvm: HOUSE_EVM, usdcContract: BASE_USDC, amountRaw: String(BigInt(priceCents) * BigInt(10_000)) };
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!response.ok) throw new Error("Could not read Base transaction");
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "Base RPC error");
  return body.result as Record<string, unknown> | null;
}

export async function submitPaidTx(userId: string, intentId: string, txHash: string) {
  const intent = await db.rotatorPurchaseIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.userId !== userId) return { ok: false as const, reason: "Purchase intent not found" };
  if (intent.status !== "PENDING") return { ok: false as const, reason: "Purchase intent is not pending" };
  if (isIntentExpired(intent)) {
    await db.rotatorPurchaseIntent.update({ where: { id: intent.id }, data: { status: "EXPIRED" } });
    return { ok: false as const, reason: "Purchase intent expired" };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false as const, reason: "Invalid transaction hash" };
  const [usedIntent, usedSlot] = await Promise.all([
    db.rotatorPurchaseIntent.findUnique({ where: { txHash } }),
    db.paidRotatorSlot.findFirst({ where: { txHash } }),
  ]);
  if ((usedIntent && usedIntent.id !== intent.id) || usedSlot) return { ok: false as const, reason: "Transaction hash already used" };
  let tx: Record<string, unknown> | null;
  let receipt: Record<string, unknown> | null;
  try { [tx, receipt] = await Promise.all([rpc("eth_getTransactionByHash", [txHash]), rpc("eth_getTransactionReceipt", [txHash])]); }
  catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : "Base RPC failed" }; }
  if (!tx || !receipt) return { ok: false as const, reason: "Transaction is not confirmed on Base yet" };
  const checked = verifyUsdcPayment({ tx: { to: tx.to as string | null, input: (tx.input ?? tx.data) as string }, receiptStatus: receipt.status as string, expectedTo: HOUSE_EVM, expectedAmountRaw: BigInt(intent.priceCents) * BigInt(10_000), usdcContract: BASE_USDC });
  if (!checked.ok) return checked;

  try {
    const result = await db.$transaction(async (txdb) => {
      const current = await txdb.rotatorPurchaseIntent.findUnique({ where: { id: intent.id } });
      if (!current || current.status !== "PENDING" || isIntentExpired(current)) throw new Error("Purchase intent is no longer pending");
      const link = await txdb.engineLink.findUnique({ where: { userId_partner: { userId, partner: intent.partner } } });
      if (!link) throw new Error("Save that link first");
      const buyer = await txdb.user.findUnique({ where: { id: userId }, select: { referredById: true } });
      const referrerId = buyer?.referredById ?? null;
      const [refLinks, ownerLinks, houseLink] = await Promise.all([
        referrerId ? txdb.identityLink.findMany({ where: { userId: referrerId } }) : Promise.resolve([]),
        txdb.identityLink.findMany({ where: { userId } }),
        txdb.identityLink.findUnique({ where: { kind_value: { kind: "wallet_evm", value: HOUSE_EVM } } }),
      ]);
      const wallet = (rows: Array<{ kind: string; value: string }>) => { const w = rows.find(x => x.kind === "wallet_evm") ?? rows.find(x => x.kind === "wallet_solana"); return w ? { address: w.value, chain: w.kind === "wallet_evm" ? "evm" : "solana" } : null; };
      const split = splitCents(intent.priceCents);
      const settlement = await txdb.settlement.create({ data: {
        date: intent.date, rotatorDayId: null, grossCents: intent.priceCents, currency: "USD", simulated: false, status: "DRAFT", referrerUnassigned: !referrerId,
        lines: { create: [
          { role: "PR", userId: houseLink?.userId ?? null, agentId: null, walletAddress: HOUSE_EVM, chain: "evm", amountCents: split.pr },
          { role: "REFERRER", userId: referrerId, agentId: null, walletAddress: referrerId ? wallet(refLinks)?.address ?? null : null, chain: referrerId ? wallet(refLinks)?.chain ?? null : null, amountCents: split.referrer },
          { role: "OWNER", userId, agentId: null, walletAddress: wallet(ownerLinks)?.address ?? null, chain: wallet(ownerLinks)?.chain ?? null, amountCents: split.owner },
        ] },
      } });
      await txdb.rotatorPurchaseIntent.update({ where: { id: intent.id }, data: { status: "PAID", txHash } });
      const slot = await txdb.paidRotatorSlot.create({ data: { intentId: intent.id, userId, partner: intent.partner, date: intent.date, url: link.url, priceCents: intent.priceCents, txHash, settlementId: settlement.id } });
      return { slot, settlementId: settlement.id };
    });
    return { ok: true as const, ...result };
  } catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : "Could not record payment" }; }
}

export async function listPaidSlotsForDate(date: string) {
  return db.paidRotatorSlot.findMany({ where: { date, ...placedPaidSlot }, include: { user: { select: { name: true, whopUsername: true } } }, orderBy: { createdAt: "asc" } });
}

export async function getMyPaidSlotData(userId: string) {
  const [intents, slots, prices, credits] = await Promise.all([
    db.rotatorPurchaseIntent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.paidRotatorSlot.findMany({ where: { userId, ...placedPaidSlot }, orderBy: { createdAt: "desc" }, take: 50 }),
    getPaidSlotPrices(),
    db.paidRotatorSlot.findMany({ where: { userId, source: FREE_DAY_SOURCE, redeemedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } }),
  ]);
  return { intents, slots, prices, credits };
}
