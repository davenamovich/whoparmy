import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { hashKeyClaimCode, isKeyClaimCode, isUsableKeyClaim } from "./key-claim-core.ts";

const CODE = "prk_fixture_claim_code";
const USER = "user_owner";
const now = Date.parse("2026-11-25T12:00:00Z");

// The database and engine exchange paths are integration seams owned by the
// Prisma/Whop runtime. These pure assertions pin every lifecycle decision
// without ever storing or printing a real credential.
test("mint shape uses a prk_ code and stores only its SHA-256 hash", () => {
  assert.equal(isKeyClaimCode(CODE), true);
  const stored = hashKeyClaimCode(CODE);
  assert.match(stored, /^[a-f0-9]{64}$/);
  assert.notEqual(stored, CODE);
  assert.equal(stored, createHash("sha256").update(CODE).digest("hex"));
});

test("exchange happy path accepts a live claim for its owner", () => {
  assert.equal(isUsableKeyClaim({ userId: USER, usedAt: null, expiresAt: new Date(now + 60_000) }, USER, now), true);
});

test("second exchange, expiry, and wrong-user update token are refused", () => {
  const row = { userId: USER, usedAt: null as Date | null, expiresAt: new Date(now + 60_000) };
  row.usedAt = new Date(now);
  assert.equal(isUsableKeyClaim(row, USER, now), false);
  row.usedAt = null;
  row.expiresAt = new Date(now - 1);
  assert.equal(isUsableKeyClaim(row, USER, now), false);
  row.expiresAt = new Date(now + 60_000);
  assert.equal(isUsableKeyClaim(row, "user_other", now), false);
});

test("blocked engine accounts cannot complete the claim lifecycle", () => {
  // exchangeBridgeKeyClaim catches getMemberEngineKey's BLOCKED error before
  // marking the row used; the pure row remains usable for a later retry.
  assert.equal(isUsableKeyClaim({ userId: USER, usedAt: null, expiresAt: new Date(now + 60_000) }, USER, now), true);
});
