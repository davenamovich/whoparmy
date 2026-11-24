/** Pure policy and Base USDC transfer verification for paid rotator slots. */

/** Dave's 2026-11-20 doctrine: $10 is a starting value per ET day; demand is the number of paid slots already sold that day. */
export const STARTING_PRICE_CENTS = 1000;
export const INTENT_TTL_MS = 15 * 60 * 1000;
export const HOUSE_EVM = "0x2416d6c32c75e58d436e598be3773a4c722053bc";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function slotPriceCents(input: { date: string; today: string; paidSlotsSoldThatDay: number; activeUsers: number }): number {
  void input.activeUsers;
  void input.date;
  void input.today;
  const sold = Math.max(0, Math.floor(input.paidSlotsSoldThatDay));
  return Math.floor(STARTING_PRICE_CENTS * (100 + 25 * sold) / 100);
}

export function isIntentExpired(intent: { expiresAt: Date | string | number }, now: Date | number = new Date()): boolean {
  return new Date(intent.expiresAt).getTime() <= new Date(now).getTime();
}

export function decodeUsdcTransfer(calldata: string): { to: string; amountRaw: bigint } | null {
  if (!/^0xa9059cbb[0-9a-fA-F]{128}$/.test(calldata)) return null;
  const body = calldata.slice(10);
  const addressWord = body.slice(0, 64);
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(addressWord)) return null;
  try { return { to: `0x${addressWord.slice(24)}`.toLowerCase(), amountRaw: BigInt(`0x${body.slice(64)}`) }; }
  catch { return null; }
}

export function verifyUsdcPayment(input: { tx: { to?: string | null; input?: string; data?: string }; receiptStatus: string | null | undefined; expectedTo: string; expectedAmountRaw: bigint | string; usdcContract: string }): { ok: true } | { ok: false; reason: string } {
  if (!input.tx.to || input.tx.to.toLowerCase() !== input.usdcContract.toLowerCase()) return { ok: false, reason: "Transaction is not a transfer from the Base USDC contract" };
  if (input.receiptStatus !== "0x1") return { ok: false, reason: "Transaction receipt was not successful" };
  const transfer = decodeUsdcTransfer(input.tx.input ?? input.tx.data ?? "");
  if (!transfer) return { ok: false, reason: "Transaction calldata is not a valid USDC transfer" };
  if (transfer.to !== input.expectedTo.toLowerCase()) return { ok: false, reason: "USDC recipient does not match the house wallet" };
  if (transfer.amountRaw < BigInt(input.expectedAmountRaw)) return { ok: false, reason: "USDC amount is below the quoted price" };
  return { ok: true };
}
