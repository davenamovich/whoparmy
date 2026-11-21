import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  btcToSats,
  satsToBtcCsv,
  ledgerBalance,
  splitEqually,
  computeRunPlan,
  exceedsBalance,
  canTransition,
  canMarkPaid,
  maskAddress,
  parseCollectSetting,
  bridgeBtcMode,
  buildPayoutCsv,
} from "./btc-payouts-logic.ts";

describe("btcToSats — strict decimal parsing, no floats", () => {
  it("parses whole and fractional BTC exactly", () => {
    assert.deepEqual(btcToSats("1"), { ok: true, sats: 100_000_000 });
    assert.deepEqual(btcToSats("0.5"), { ok: true, sats: 50_000_000 });
    assert.deepEqual(btcToSats("0.00000001"), { ok: true, sats: 1 });
    assert.deepEqual(btcToSats("0.1"), { ok: true, sats: 10_000_000 });
    assert.deepEqual(btcToSats(" 0.25 "), { ok: true, sats: 25_000_000 });
    assert.deepEqual(btcToSats("2.12345678"), { ok: true, sats: 212_345_678 });
  });

  it("rejects zero, negatives, exponents, separators and >8 decimals", () => {
    for (const bad of ["0", "0.0", "-0.5", "1e-3", "1,000", "0.000000001", "abc", "", ".5", "1."]) {
      const r = btcToSats(bad);
      assert.equal(r.ok, false, `expected rejection: ${JSON.stringify(bad)}`);
    }
  });

  it("rejects amounts above the 21M supply cap", () => {
    assert.equal(btcToSats("21000000").ok, true);
    assert.equal(btcToSats("21000000.00000001").ok, false);
    assert.equal(btcToSats("99999999").ok, false);
  });
});

describe("satsToBtcCsv — exact 8-place formatting", () => {
  it("formats edge values exactly", () => {
    assert.equal(satsToBtcCsv(1), "0.00000001");
    assert.equal(satsToBtcCsv(100_000_000), "1.00000000");
    assert.equal(satsToBtcCsv(212_345_678), "2.12345678");
    assert.equal(satsToBtcCsv(0), "0.00000000");
  });

  it("round-trips through btcToSats", () => {
    for (const sats of [1, 7, 1000, 999_999, 123_456_789]) {
      assert.deepEqual(btcToSats(satsToBtcCsv(sats)), { ok: true, sats });
    }
  });
});

describe("funding / balance math", () => {
  it("balance is funded minus PAID payouts only", () => {
    assert.equal(ledgerBalance(500_000, 125_000), 375_000);
    assert.equal(ledgerBalance(0, 0), 0);
  });

  it("exceedsBalance guards create / edit / approve", () => {
    assert.equal(exceedsBalance(100, 100), false);
    assert.equal(exceedsBalance(101, 100), true);
    assert.equal(exceedsBalance(0, 0), false);
  });
});

describe("splitEqually — floor split, remainder stays in the balance", () => {
  it("splits evenly when divisible", () => {
    assert.deepEqual(splitEqually(900, 3), { perLine: 300, distributed: 900, remainder: 0 });
  });

  it("floors and reports the undistributed remainder", () => {
    assert.deepEqual(splitEqually(1000, 3), { perLine: 333, distributed: 999, remainder: 1 });
    assert.deepEqual(splitEqually(10, 4), { perLine: 2, distributed: 8, remainder: 2 });
  });

  it("handles zero members without dividing by zero", () => {
    assert.deepEqual(splitEqually(1000, 0), { perLine: 0, distributed: 0, remainder: 1000 });
  });
});

describe("computeRunPlan — the payout algo", () => {
  it("computes the distributable as floor(balance × bps / 10000)", () => {
    const r = computeRunPlan(1_000_000, 5000, 4);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.plan.distributableSats, 500_000);
      assert.equal(r.plan.perLineSats, 125_000);
      assert.equal(r.plan.distributedSats, 500_000);
      assert.equal(r.plan.remainderSats, 0);
    }
  });

  it("floors the percentage math — never rounds up out of the pool", () => {
    // 33.33% of 999,999 = 333,299.6667 → floor 333,299
    const r = computeRunPlan(999_999, 3333, 1);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.plan.distributableSats, 333_299);
  });

  it("a 100% run distributes the whole balance (split remainder aside)", () => {
    const r = computeRunPlan(1000, 10_000, 3);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.plan.distributableSats, 1000);
      assert.equal(r.plan.perLineSats, 333);
      assert.equal(r.plan.distributedSats, 999);
      assert.equal(r.plan.remainderSats, 1);
    }
  });

  it("the split remainder stays in the pool and is reported as undistributed", () => {
    // 50% of 1001 = 500 distributable; 500 / 3 = 166 each, 2 left over
    const r = computeRunPlan(1001, 5000, 3);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.plan.distributableSats, 500);
      assert.equal(r.plan.perLineSats, 166);
      assert.equal(r.plan.distributedSats, 498);
      assert.equal(r.plan.remainderSats, 2);
    }
  });

  it("never plans a distribution above the balance", () => {
    for (const [bal, bps, n] of [[7, 9999, 2], [123_456_789, 1, 5], [100, 10_000, 7]] as const) {
      const r = computeRunPlan(bal, bps, n);
      assert.equal(r.ok, true);
      if (r.ok) assert.ok(r.plan.distributedSats <= bal, `${bal}/${bps}/${n}`);
    }
  });

  it("refuses a zero or negative balance — no crash, no zero-line batch", () => {
    for (const bal of [0, -5]) {
      const r = computeRunPlan(bal, 5000, 3);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /pool is empty/);
    }
  });

  it("refuses when no member is eligible", () => {
    const r = computeRunPlan(1_000_000, 5000, 0);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /nobody to pay/);
  });

  it("refuses out-of-range payout shares", () => {
    for (const bps of [0, -100, 10_001, 50.5, Number.NaN]) {
      assert.equal(computeRunPlan(1_000_000, bps, 2).ok, false, `bps=${bps}`);
    }
  });

  it("refuses when the share of the pool is under 1 sat", () => {
    // 0.01% of 100 sats = 0.01 → floors to 0 distributable
    const r = computeRunPlan(100, 1, 1);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /less than 1 sat/);
  });

  it("refuses when the distributable cannot give everyone at least 1 sat", () => {
    // 50% of 10 sats = 5 distributable across 6 members → 0 per line
    const r = computeRunPlan(10, 5000, 6);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /at least 1 sat/);
  });
});

describe("batch state machine", () => {
  it("allows the legal path DRAFT → APPROVED → PAID", () => {
    assert.equal(canTransition("DRAFT", "APPROVED"), true);
    assert.equal(canTransition("APPROVED", "PAID"), true);
  });

  it("forbids skipping the approval gate (no DRAFT → PAID)", () => {
    assert.equal(canTransition("DRAFT", "PAID"), false);
  });

  it("allows cancel from DRAFT and APPROVED only", () => {
    assert.equal(canTransition("DRAFT", "CANCELLED"), true);
    assert.equal(canTransition("APPROVED", "CANCELLED"), true);
    assert.equal(canTransition("PAID", "CANCELLED"), false);
    assert.equal(canTransition("CANCELLED", "APPROVED"), false);
  });

  it("blocks double-approve and any move out of PAID", () => {
    assert.equal(canTransition("APPROVED", "APPROVED"), false);
    assert.equal(canTransition("PAID", "APPROVED"), false);
  });

  it("PAID requires APPROVED state and a non-empty txid", () => {
    assert.equal(canMarkPaid("APPROVED", "abc123txid"), true);
    assert.equal(canMarkPaid("APPROVED", ""), false);
    assert.equal(canMarkPaid("APPROVED", "   "), false);
    assert.equal(canMarkPaid("APPROVED", null), false);
    assert.equal(canMarkPaid("DRAFT", "abc123txid"), false);
  });
});

describe("collection toggle", () => {
  it("defaults OFF for missing or unrecognized values", () => {
    assert.equal(parseCollectSetting(null), false);
    assert.equal(parseCollectSetting(undefined), false);
    assert.equal(parseCollectSetting("off"), false);
    assert.equal(parseCollectSetting("yes"), false);
  });

  it("is ON only for the exact value 'on'", () => {
    assert.equal(parseCollectSetting("on"), true);
  });

  it("drives the /bridge presentation mode", () => {
    assert.equal(bridgeBtcMode(false), "optional");
    assert.equal(bridgeBtcMode(true), "collect");
  });
});

describe("maskAddress", () => {
  it("shows first 8 + last 6", () => {
    assert.equal(maskAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"), "bc1qxy2k…hx0wlh");
    assert.equal(maskAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), "1A1zP1eP…DivfNa");
  });

  it("leaves short strings alone", () => {
    assert.equal(maskAddress("short"), "short");
  });
});

describe("buildPayoutCsv", () => {
  it("emits the wallet-ready shape: address,amount_btc,amount_sats,member", () => {
    const csv = buildPayoutCsv([
      { address: "bc1qaaa", amountSats: 150_000, member: "Alice" },
      { address: "bc1qbbb", amountSats: 1, member: "Bob" },
    ]);
    assert.equal(
      csv,
      "address,amount_btc,amount_sats,member\n" +
        "bc1qaaa,0.00150000,150000,Alice\n" +
        "bc1qbbb,0.00000001,1,Bob\n",
    );
  });

  it("quotes member names containing commas or quotes", () => {
    const csv = buildPayoutCsv([{ address: "bc1qccc", amountSats: 5, member: 'Doe, "JD"' }]);
    assert.match(csv, /bc1qccc,0\.00000005,5,"Doe, ""JD"""/);
  });

  it("an empty batch is just the header", () => {
    assert.equal(buildPayoutCsv([]), "address,amount_btc,amount_sats,member\n");
  });
});
