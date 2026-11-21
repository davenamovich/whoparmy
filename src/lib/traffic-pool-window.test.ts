import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_TRAFFIC_SLOTS,
  decideTrafficPools,
  spotAllotmentPerAgent,
  type TrafficAgentInput,
  type TrafficPlacementInput,
} from "./traffic-pool-core.ts";
import {
  placementDateForSpotWindow,
  spotWindowFor,
  spotWindowKeyForPlacementDate,
} from "./rotator-market.ts";

/**
 * Spot windows (Dave, 2026-11-21): open spots reset at 23:50 ET for
 * the next 24 hours. These tests pin the boundary math in both EST
 * and EDT, the placement-date ↔ window-key mapping, the flat
 * allotment policy, and the no-leakage property: one placement
 * date's consumption never touches another date's decision (each
 * date belongs to exactly one window).
 */

describe("spotWindowFor", () => {
  it("EST: midday ET sits in the window that opened the previous evening", () => {
    // 2026-01-15T12:00Z = 07:00 EST on Jan 15 → window opened Jan 14 23:50 EST.
    const w = spotWindowFor(new Date("2026-01-15T12:00:00Z"));
    assert.equal(w.key, "2026-01-14");
    assert.equal(w.startUtc, "2026-01-15T04:50:00.000Z"); // Jan 14 23:50 EST
    assert.equal(w.endUtc, "2026-01-16T04:50:00.000Z"); // Jan 15 23:50 EST
  });

  it("EST: 23:49 ET is still the old window; 23:51 ET is the new one", () => {
    const before = spotWindowFor(new Date("2026-01-16T04:49:00Z")); // Jan 15 23:49 EST
    assert.equal(before.key, "2026-01-14");
    const after = spotWindowFor(new Date("2026-01-16T04:51:00Z")); // Jan 15 23:51 EST
    assert.equal(after.key, "2026-01-15");
    assert.equal(after.startUtc, "2026-01-16T04:50:00.000Z");
    assert.equal(after.endUtc, "2026-01-17T04:50:00.000Z");
  });

  it("EST: exactly 23:50 ET opens the new window", () => {
    const at = spotWindowFor(new Date("2026-01-16T04:50:00Z"));
    assert.equal(at.key, "2026-01-15");
  });

  it("EDT: midday ET sits in the window that opened the previous evening", () => {
    // 2026-07-15T12:00Z = 08:00 EDT on Jul 15 → window opened Jul 14 23:50 EDT.
    const w = spotWindowFor(new Date("2026-07-15T12:00:00Z"));
    assert.equal(w.key, "2026-07-14");
    assert.equal(w.startUtc, "2026-07-15T03:50:00.000Z"); // Jul 14 23:50 EDT
    assert.equal(w.endUtc, "2026-07-16T03:50:00.000Z"); // Jul 15 23:50 EDT
  });

  it("EDT: 23:49 ET is still the old window; 23:51 ET is the new one", () => {
    const before = spotWindowFor(new Date("2026-07-16T03:49:00Z")); // Jul 15 23:49 EDT
    assert.equal(before.key, "2026-07-14");
    const after = spotWindowFor(new Date("2026-07-16T03:51:00Z")); // Jul 15 23:51 EDT
    assert.equal(after.key, "2026-07-15");
    assert.equal(after.startUtc, "2026-07-16T03:50:00.000Z");
  });

  it("every instant's window contains it (start ≤ t < end)", () => {
    for (const iso of [
      "2026-01-15T04:49:59Z",
      "2026-01-15T04:50:00Z",
      "2026-03-08T06:00:00Z", // EST→EDT switch day
      "2026-11-01T05:00:00Z", // EDT→EST switch day
      "2026-12-31T23:59:59Z",
    ]) {
      const t = new Date(iso).getTime();
      const w = spotWindowFor(new Date(iso));
      assert.ok(new Date(w.startUtc).getTime() <= t, `${iso} starts before`);
      assert.ok(t < new Date(w.endUtc).getTime(), `${iso} ends after`);
    }
  });
});

describe("placement date ↔ window key mapping", () => {
  it("a placement dated D is governed by the window that opened the previous evening (D−1)", () => {
    assert.equal(spotWindowKeyForPlacementDate("2026-11-21"), "2026-11-20");
    assert.equal(placementDateForSpotWindow("2026-11-20"), "2026-11-21");
  });

  it("is a bijection across month and year boundaries", () => {
    for (const d of ["2026-01-01", "2026-03-01", "2026-11-21", "2027-01-01"]) {
      assert.equal(placementDateForSpotWindow(spotWindowKeyForPlacementDate(d)), d);
      assert.equal(spotWindowKeyForPlacementDate(placementDateForSpotWindow(d)), d);
    }
    assert.equal(spotWindowKeyForPlacementDate("2026-01-01"), "2025-12-31");
    assert.equal(spotWindowKeyForPlacementDate("2026-03-01"), "2026-02-28");
  });

  it("agrees with spotWindowFor: placements dated D rotate under the window open at D's start", () => {
    // Midnight ET at the start of Nov 21 sits inside window 2026-11-20.
    const w = spotWindowFor(new Date("2026-11-21T05:00:00Z")); // Nov 21 00:00 EST
    assert.equal(w.key, spotWindowKeyForPlacementDate("2026-11-21"));
  });
});

describe("spotAllotmentPerAgent (the one policy point)", () => {
  it("returns the flat 10 today, whatever the measured demand", () => {
    assert.equal(spotAllotmentPerAgent({ activeAgents: 0, countedHops7d: 0 }), DAILY_TRAFFIC_SLOTS);
    assert.equal(spotAllotmentPerAgent({ activeAgents: 1, countedHops7d: 0 }), DAILY_TRAFFIC_SLOTS);
    assert.equal(spotAllotmentPerAgent({ activeAgents: 500, countedHops7d: 250000 }), DAILY_TRAFFIC_SLOTS);
  });
});

describe("no leakage across the 23:50 reset", () => {
  const T0 = new Date("2026-11-19T12:00:00Z");
  const agent: TrafficAgentInput = {
    id: "a1",
    userId: "u1",
    status: "ACTIVE",
    expiresAt: null,
    createdAt: T0,
  };
  const placements = (prefix: string, n: number): TrafficPlacementInput[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i}`,
      userId: "u1",
      partner: `partner-${i}`,
      createdAt: new Date(T0.getTime() + i * 1000),
    }));

  it("a spent window never reduces the next window's decision", () => {
    // Window for placements dated D: the pool decision over D's
    // placements only. Spending all 10 on D leaves D+1 (the next
    // window's placements) at a full, untouched allotment.
    const dayD = decideTrafficPools([agent], placements("d-", 10), spotAllotmentPerAgent({ activeAgents: 1, countedHops7d: 0 }), T0);
    assert.equal(dayD.states.get("a1")!.used, 10);
    assert.equal(dayD.states.get("a1")!.remaining, 0);
    const dayD1 = decideTrafficPools([agent], placements("e-", 4), spotAllotmentPerAgent({ activeAgents: 1, countedHops7d: 0 }), T0);
    assert.equal(dayD1.states.get("a1")!.used, 4);
    assert.equal(dayD1.states.get("a1")!.remaining, 6);
    assert.equal(dayD1.allowedPlacementIds.size, 4);
  });
});
