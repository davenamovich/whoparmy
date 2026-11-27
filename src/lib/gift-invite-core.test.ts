import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GIFT_TIERS,
  giftInviteNote,
  serializeGiftInvite,
  validateGiftInviteInput,
  validateGiftInviteStatus,
  type GiftInviteRow,
} from "./gift-invite-core.ts";

const base = {
  recipientName: "Sam Rivera",
  recipientEmail: "Sam@Example.com",
  tier: "10m",
  keyName: "gift-sam-10m",
  accountLabel: "Muse-email Starimg account",
};

describe("validateGiftInviteInput", () => {
  it("accepts a complete invite and derives the cap from the tier", () => {
    const r = validateGiftInviteInput(base);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.tokenCap, 10_000_000);
    assert.equal(r.value.recipientEmail, "sam@example.com");
    assert.equal(r.value.notes, null);
  });

  it("maps the 1m tier to 1,000,000 and allows a missing email", () => {
    const r = validateGiftInviteInput({ ...base, tier: "1m", recipientEmail: undefined });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.tokenCap, GIFT_TIERS["1m"]);
    assert.equal(r.value.recipientEmail, null);
  });

  it("rejects a missing name, bad tier, and missing key reference", () => {
    assert.equal(validateGiftInviteInput({ ...base, recipientName: " " }).ok, false);
    assert.equal(validateGiftInviteInput({ ...base, tier: "5m" }).ok, false);
    assert.equal(validateGiftInviteInput({ ...base, keyName: "" }).ok, false);
    assert.equal(validateGiftInviteInput({ ...base, accountLabel: "" }).ok, false);
  });

  it("rejects an invalid email", () => {
    assert.equal(validateGiftInviteInput({ ...base, recipientEmail: "not-an-email" }).ok, false);
  });

  it("REJECTS any payload carrying a raw key value field — references only, by design", () => {
    for (const field of ["apiKey", "keyValue", "secret", "rawKey"]) {
      const r = validateGiftInviteInput({ ...base, [field]: "FAKE-KEY-VALUE-FOR-TEST" });
      assert.equal(r.ok, false, `expected rejection for ${field}`);
      if (!r.ok) assert.match(r.error, /never a raw key value/);
    }
  });
});

describe("validateGiftInviteStatus", () => {
  it("accepts the manual lifecycle states", () => {
    for (const s of ["draft", "ready", "handed_over", "exhausted", "revoked"]) {
      assert.equal(validateGiftInviteStatus({ status: s }).ok, true, s);
    }
  });
  it("rejects unknown states", () => {
    assert.equal(validateGiftInviteStatus({ status: "sent" }).ok, false);
    assert.equal(validateGiftInviteStatus({}).ok, false);
  });
});

const row: GiftInviteRow = {
  id: "inv_1",
  code: "gift_testcode123",
  recipientName: "Sam Rivera",
  recipientEmail: "sam@example.com",
  tier: "1m",
  tokenCap: 1_000_000,
  keyName: "gift-sam-1m",
  accountLabel: "Muse-email Starimg account",
  status: "draft",
  notes: null,
  createdById: "op_1",
  createdAt: new Date("2026-11-27T07:00:00Z"),
  updatedAt: new Date("2026-11-27T07:00:00Z"),
};

describe("serializeGiftInvite", () => {
  it("exposes the key REFERENCE (name + account + cap) and nothing else key-like", () => {
    const out = serializeGiftInvite(row) as unknown as Record<string, unknown>;
    assert.equal(out.keyName, "gift-sam-1m");
    assert.equal(out.accountLabel, "Muse-email Starimg account");
    assert.equal(out.tokenCap, 1_000_000);
    for (const k of Object.keys(out)) {
      assert.doesNotMatch(k, /apiKey|keyValue|secret|rawKey/i, `serialized invite must not carry ${k}`);
    }
  });
});

describe("giftInviteNote", () => {
  it("carries code + cap and no key material", () => {
    const note = giftInviteNote(row);
    assert.match(note, /gift_testcode123/);
    assert.match(note, /1,000,000 Starimg tokens/);
    assert.doesNotMatch(note, /gift-sam-1m/);
  });
});
