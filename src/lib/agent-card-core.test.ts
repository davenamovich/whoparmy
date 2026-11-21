import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTokenAddress,
  parseProceedsPreference,
  etDateStringFrom,
  etMidnightUtc,
  addDaysToEtDate,
  clickWindows,
  summarizeClicks,
  maskAddress,
  type ClickRow,
} from "./agent-card-core.ts";

describe("classifyTokenAddress", () => {
  it("accepts EVM addresses (lowercase and checksummed)", () => {
    assert.deepEqual(classifyTokenAddress("0x1234567890abcdef1234567890abcdef12345678"), {
      chain: "EVM",
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    assert.equal(classifyTokenAddress("0xF0aB1234567890abcdef1234567890abcdef1234")?.chain, "EVM");
    assert.equal(classifyTokenAddress("  0x1234567890abcdef1234567890abcdef12345678  ")?.chain, "EVM");
  });

  it("rejects malformed EVM shapes", () => {
    assert.equal(classifyTokenAddress("0x1234567890abcdef1234567890abcdef1234567"), null); // 39 hex
    assert.equal(classifyTokenAddress("0x1234567890abcdef1234567890abcdef123456789"), null); // 41 hex
    assert.equal(classifyTokenAddress("0xZZ34567890abcdef1234567890abcdef12345678"), null); // bad hex
    assert.equal(classifyTokenAddress("0x"), null);
  });

  it("accepts Solana base58 addresses", () => {
    // Wrapped SOL mint — a real 43-char base58 address.
    assert.deepEqual(classifyTokenAddress("So11111111111111111111111111111111111111112"), {
      chain: "SOLANA",
      address: "So11111111111111111111111111111111111111112",
    });
    assert.equal(classifyTokenAddress("11111111111111111111111111111111")?.chain, "SOLANA"); // 32 chars
  });

  it("rejects non-base58 and wrong-length Solana shapes", () => {
    assert.equal(classifyTokenAddress("So1111111111111111111111111111111111111111O"), null); // contains O
    assert.equal(classifyTokenAddress("So1111111111111111111111111111111111111111l"), null); // contains l
    assert.equal(classifyTokenAddress("abc123"), null); // too short for either
    assert.equal(classifyTokenAddress(""), null);
    assert.equal(classifyTokenAddress("   "), null);
    assert.equal(classifyTokenAddress("not an address at all, just words"), null);
  });
});

describe("parseProceedsPreference", () => {
  it("accepts a BTC preference", () => {
    const r = parseProceedsPreference({ enabled: true, pct: 25, target: "BTC" }, false);
    assert.deepEqual(r, { ok: true, value: { enabled: true, pct: 25, target: "BTC" } });
  });

  it("accepts a TOKEN preference only when a token address exists", () => {
    assert.equal(parseProceedsPreference({ enabled: true, pct: 50, target: "TOKEN" }, true).ok, true);
    const no = parseProceedsPreference({ enabled: true, pct: 50, target: "TOKEN" }, false);
    assert.equal(no.ok, false);
    if (!no.ok) assert.match(no.error, /token address/);
  });

  it("rejects bad percentages and shapes", () => {
    for (const pct of [-1, 101, 1.5, Number.NaN, "50"]) {
      assert.equal(parseProceedsPreference({ enabled: true, pct, target: "BTC" }, false).ok, false, `pct=${String(pct)}`);
    }
    assert.equal(parseProceedsPreference({ enabled: "yes", pct: 10, target: "BTC" }, false).ok, false);
    assert.equal(parseProceedsPreference({ enabled: true, pct: 10, target: "ETH" }, false).ok, false);
    assert.equal(parseProceedsPreference(null, false).ok, false);
    assert.equal(parseProceedsPreference(undefined, false).ok, false);
  });

  it("accepts the 0 and 100 bounds", () => {
    assert.equal(parseProceedsPreference({ enabled: false, pct: 0, target: "BTC" }, false).ok, true);
    assert.equal(parseProceedsPreference({ enabled: true, pct: 100, target: "BTC" }, false).ok, true);
  });
});

describe("ET calendar helpers", () => {
  it("maps instants to ET dates across EST and EDT", () => {
    assert.equal(etDateStringFrom(new Date("2026-11-21T04:30:00Z")), "2026-11-20"); // 23:30 EST
    assert.equal(etDateStringFrom(new Date("2026-11-21T05:30:00Z")), "2026-11-21"); // 00:30 EST
    assert.equal(etDateStringFrom(new Date("2026-07-04T03:30:00Z")), "2026-07-03"); // 23:30 EDT
    assert.equal(etDateStringFrom(new Date("2026-07-04T04:30:00Z")), "2026-07-04"); // 00:30 EDT
  });

  it("computes ET midnight in UTC for both offsets and DST edges", () => {
    assert.equal(etMidnightUtc("2026-11-21").toISOString(), "2026-11-21T05:00:00.000Z"); // EST
    assert.equal(etMidnightUtc("2026-07-04").toISOString(), "2026-07-04T04:00:00.000Z"); // EDT
    assert.equal(etMidnightUtc("2026-03-08").toISOString(), "2026-03-08T05:00:00.000Z"); // spring-forward day starts EST
    assert.equal(etMidnightUtc("2026-11-01").toISOString(), "2026-11-01T04:00:00.000Z"); // fall-back day starts EDT
  });

  it("adds days across month boundaries", () => {
    assert.equal(addDaysToEtDate("2026-11-21", -6), "2026-11-15");
    assert.equal(addDaysToEtDate("2026-01-01", -1), "2025-12-31");
    assert.equal(addDaysToEtDate("2026-02-28", 1), "2026-03-01");
  });
});

describe("clickWindows + summarizeClicks", () => {
  const now = new Date("2026-11-21T17:00:00Z"); // noon EST, Nov 21

  it("builds ET calendar windows", () => {
    const w = clickWindows(now);
    assert.equal(w.todayEt, "2026-11-21");
    assert.equal(w.todayStart.toISOString(), "2026-11-21T05:00:00.000Z");
    assert.equal(w.weekStart.toISOString(), "2026-11-15T05:00:00.000Z");
    assert.equal(w.monthStart.toISOString(), "2026-10-23T04:00:00.000Z"); // Oct 23 is still EDT
    assert.deepEqual(w.last7EtDates, [
      "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21",
    ]);
  });

  it("counts rows into today / 7d / 30d buckets by ET boundaries", () => {
    const rows: ClickRow[] = [
      { partner: "a", createdAt: new Date("2026-11-21T05:00:00.000Z") }, // exactly today start → today
      { partner: "a", createdAt: new Date("2026-11-21T04:59:59.999Z") }, // just before → 7d only
      { partner: "b", createdAt: new Date("2026-11-15T05:00:00.000Z") }, // exactly week start → 7d
      { partner: "b", createdAt: new Date("2026-11-14T12:00:00.000Z") }, // → 30d only
      { partner: "b", createdAt: new Date("2026-10-23T04:00:00.000Z") }, // exactly month start → 30d
      { partner: "c", createdAt: new Date("2026-10-23T03:59:59.999Z") }, // before window → ignored
      { partner: "a", createdAt: new Date("2026-11-20T15:00:00.000Z") }, // yesterday → 7d
    ];
    const s = summarizeClicks(rows, now);
    assert.equal(s.today, 1);
    assert.equal(s.last7Days, 4);
    assert.equal(s.last30Days, 6);
    assert.deepEqual(s.topPartner, { partner: "a", clicks: 3 });
  });

  it("handles no clicks", () => {
    const s = summarizeClicks([], now);
    assert.deepEqual(s, { today: 0, last7Days: 0, last30Days: 0, topPartner: null });
  });
});

describe("maskAddress", () => {
  it("masks long addresses, leaves short ones alone", () => {
    assert.equal(maskAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x123456…345678");
    assert.equal(maskAddress("short"), "short");
  });
});
