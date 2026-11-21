import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToEtDate,
  etDateStringFrom,
  etDayEndsAt,
  etWallTimeToUtc,
  hostOf,
  inventoryState,
  nextBiddingClose,
  placementLifecycle,
} from "./rotator-market.ts";

describe("placementLifecycle", () => {
  const today = "2026-11-21";
  it("maps placement dates against the ET today", () => {
    assert.equal(placementLifecycle("2026-11-22", today), "SCHEDULED");
    assert.equal(placementLifecycle("2026-11-21", today), "ACTIVE");
    assert.equal(placementLifecycle("2026-11-20", today), "EXPIRED");
  });
});

describe("inventoryState", () => {
  const today = "2026-11-21";
  it("cancelled and confirmed win over every other signal", () => {
    assert.equal(inventoryState({ status: "CANCELLED", bidCount: 3, date: today, today }), "CANCELLED");
    assert.equal(inventoryState({ status: "CANCELLED", bidCount: 0, date: "2026-11-19", today }), "CANCELLED");
    assert.equal(inventoryState({ status: "CONFIRMED", bidCount: 3, date: today, today }), "SOLD");
    assert.equal(inventoryState({ status: "CONFIRMED", bidCount: 1, date: "2026-11-19", today }), "SOLD");
  });

  it("a past day that never confirmed is expired, bids or not", () => {
    assert.equal(inventoryState({ status: "OPEN", bidCount: 2, date: "2026-11-20", today }), "EXPIRED");
    assert.equal(inventoryState({ status: null, bidCount: 0, date: "2026-11-20", today }), "EXPIRED");
  });

  it("bids on an open current/future day make it reserved", () => {
    assert.equal(inventoryState({ status: "OPEN", bidCount: 1, date: today, today }), "RESERVED");
    assert.equal(inventoryState({ status: "OPEN", bidCount: 5, date: "2026-11-23", today }), "RESERVED");
  });

  it("an open or unopened day with no bids is available", () => {
    assert.equal(inventoryState({ status: "OPEN", bidCount: 0, date: today, today }), "AVAILABLE");
    assert.equal(inventoryState({ status: null, bidCount: 0, date: today, today }), "AVAILABLE");
    assert.equal(inventoryState({ status: null, bidCount: 0, date: "2026-11-23", today }), "AVAILABLE");
  });
});

describe("ET date helpers", () => {
  it("formats instants as ET calendar dates", () => {
    // 2026-11-21T04:30Z is still Nov 20 in New York (EST, UTC-5).
    assert.equal(etDateStringFrom(new Date("2026-11-21T04:30:00Z")), "2026-11-20");
    assert.equal(etDateStringFrom(new Date("2026-11-21T05:30:00Z")), "2026-11-21");
    // July: EDT (UTC-4) — 03:30Z is still the previous ET day.
    assert.equal(etDateStringFrom(new Date("2026-07-04T03:30:00Z")), "2026-07-03");
  });

  it("adds days across month and year boundaries", () => {
    assert.equal(addDaysToEtDate("2026-11-30", 1), "2026-12-01");
    assert.equal(addDaysToEtDate("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysToEtDate("2026-11-21", -7), "2026-11-14");
  });

  it("converts ET wall time to UTC under EST and EDT", () => {
    // EST: 23:50 ET = 04:50 UTC next day.
    assert.equal(etWallTimeToUtc("2026-11-21", 23, 50).toISOString(), "2026-11-22T04:50:00.000Z");
    // EDT: 23:50 ET = 03:50 UTC next day.
    assert.equal(etWallTimeToUtc("2026-07-04", 23, 50).toISOString(), "2026-07-05T03:50:00.000Z");
    // ET midnight under EST = 05:00 UTC.
    assert.equal(etWallTimeToUtc("2026-11-21", 0, 0).toISOString(), "2026-11-21T05:00:00.000Z");
  });

  it("day end is the next ET midnight", () => {
    assert.equal(etDayEndsAt("2026-11-21"), "2026-11-22T05:00:00.000Z");
  });
});

describe("nextBiddingClose", () => {
  it("targets today 23:50 ET before the close", () => {
    // 18:00Z = 13:00 EST — before today's close.
    const close = nextBiddingClose(new Date("2026-11-21T18:00:00Z"));
    assert.equal(close.etDate, "2026-11-21");
    assert.equal(close.closesAt, "2026-11-22T04:50:00.000Z");
  });

  it("rolls to tomorrow 23:50 ET after the close", () => {
    // 05:30Z on Nov 22 = 00:30 EST Nov 22 — today's close is ahead again.
    const close = nextBiddingClose(new Date("2026-11-22T05:30:00Z"));
    assert.equal(close.etDate, "2026-11-22");
    assert.equal(close.closesAt, "2026-11-23T04:50:00.000Z");
    // 04:55Z on Nov 22 = 23:55 EST Nov 21 — just past Nov 21's close.
    const justAfter = nextBiddingClose(new Date("2026-11-22T04:55:00Z"));
    assert.equal(justAfter.etDate, "2026-11-22");
    assert.equal(justAfter.closesAt, "2026-11-23T04:50:00.000Z");
  });

  it("handles the EDT close", () => {
    // 20:00Z = 16:00 EDT — before today's close (03:50Z next day).
    const close = nextBiddingClose(new Date("2026-07-04T20:00:00Z"));
    assert.equal(close.etDate, "2026-07-04");
    assert.equal(close.closesAt, "2026-07-05T03:50:00.000Z");
  });
});

describe("hostOf", () => {
  it("extracts hosts and refuses junk", () => {
    assert.equal(hostOf("https://agent37.com/?via=riffle"), "agent37.com");
    assert.equal(hostOf("http://sub.example.com:8080/x"), "sub.example.com:8080");
    assert.equal(hostOf("not a url"), null);
    assert.equal(hostOf(null), null);
    assert.equal(hostOf(undefined), null);
  });
});
