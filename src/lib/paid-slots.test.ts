import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeUsdcTransfer, isIntentExpired, slotPriceCents, verifyUsdcPayment, BASE_USDC, HOUSE_EVM } from "./paid-slots.ts";
const data = (to: string, amount: bigint) => `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
test("price starts at $10 and increases 25% per prior sold slot using integer math", () => {
  assert.equal(slotPriceCents({ date: "2026-11-25", today: "2026-11-24", paidSlotsSoldThatDay: 7, activeUsers: 50 }), 2750);
  assert.equal(slotPriceCents({ date: "2026-11-25", today: "2026-11-24", paidSlotsSoldThatDay: 0, activeUsers: 50 }), 1000);
  assert.equal(slotPriceCents({ date: "2026-11-24", today: "2026-11-24", paidSlotsSoldThatDay: 1, activeUsers: 0 }), 1250);
  assert.equal(slotPriceCents({ date: "y", today: "y", paidSlotsSoldThatDay: 3, activeUsers: 9 }), 1750);
});
test("intent expiry is inclusive at expiresAt", () => {
  assert.equal(isIntentExpired({ expiresAt: "2026-11-24T00:00:00Z" }, "2026-11-24T00:00:00Z"), true);
  assert.equal(isIntentExpired({ expiresAt: "2026-11-24T00:00:01Z" }, "2026-11-24T00:00:00Z"), false);
});
test("decodes USDC transfer calldata", () => {
  assert.deepEqual(decodeUsdcTransfer(data(HOUSE_EVM, 123n)), { to: HOUSE_EVM, amountRaw: 123n });
  assert.equal(decodeUsdcTransfer("0x12345678"), null);
});
test("verifies contract, receipt, recipient and minimum amount", () => {
  const base = { tx: { to: BASE_USDC, input: data(HOUSE_EVM, 10_000_000n) }, receiptStatus: "0x1", expectedTo: HOUSE_EVM, expectedAmountRaw: 10_000_000n, usdcContract: BASE_USDC };
  assert.deepEqual(verifyUsdcPayment(base), { ok: true });
  assert.equal(verifyUsdcPayment({ ...base, tx: { to: BASE_USDC, input: data("0x0000000000000000000000000000000000000001", 10_000_000n) } }).ok, false);
  assert.equal(verifyUsdcPayment({ ...base, tx: { to: BASE_USDC, input: data(HOUSE_EVM, 1n) } }).ok, false);
  assert.equal(verifyUsdcPayment({ ...base, receiptStatus: "0x0" }).ok, false);
  assert.equal(verifyUsdcPayment({ ...base, tx: { to: BASE_USDC, input: "0x12345678" } }).ok, false);
});
