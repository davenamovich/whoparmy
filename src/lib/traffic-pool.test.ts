import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_TRAFFIC_SLOTS,
  decideTrafficPools,
  type TrafficAgentInput,
  type TrafficPlacementInput,
} from "./traffic-pool-core.ts";

const T0 = new Date("2026-11-19T12:00:00Z");

function agent(id: string, userId: string, over: Partial<TrafficAgentInput> = {}): TrafficAgentInput {
  return { id, userId, status: "ACTIVE", expiresAt: null, createdAt: T0, ...over };
}

function placement(id: string, userId: string, partner: string, at = T0): TrafficPlacementInput {
  return { id, userId, partner, createdAt: at };
}

function placementsFor(userId: string, n: number, prefix: string): TrafficPlacementInput[] {
  return Array.from({ length: n }, (_, i) =>
    placement(`${prefix}${i}`, userId, `partner-${i}`, new Date(T0.getTime() + i * 1000)),
  );
}

describe("decideTrafficPools", () => {
  it("gives every agent a fresh 10-slot pool — a new day resets the allotment", () => {
    const a = agent("a1", "u1");
    const dayOne = decideTrafficPools([a], placementsFor("u1", 10, "d1-"));
    assert.equal(dayOne.states.get("a1")!.used, 10);
    assert.equal(dayOne.states.get("a1")!.remaining, 0);
    // The next ET day is a fresh decision over that day's placements
    // only: nothing rolls over, nothing is owed.
    const dayTwo = decideTrafficPools([a], []);
    assert.equal(dayTwo.states.get("a1")!.used, 0);
    assert.equal(dayTwo.states.get("a1")!.remaining, DAILY_TRAFFIC_SLOTS);
  });

  it("caps consumption at 10 per agent — the 11th entry stops rotating", () => {
    const a = agent("a1", "u1");
    const ps = placementsFor("u1", 11, "p");
    const d = decideTrafficPools([a], ps);
    assert.equal(d.states.get("a1")!.used, 10);
    assert.equal(d.states.get("a1")!.remaining, 0);
    assert.equal(d.allowedPlacementIds.size, 10);
    assert.equal(d.allowedPlacementIds.has("p10"), false); // latest earned is the one held back
    assert.equal(d.states.get("a1")!.placementIds.length, 10);
  });

  it("spills over to the member's next active agent, oldest first", () => {
    const older = agent("a1", "u1", { createdAt: new Date(T0.getTime() - 2000) });
    const newer = agent("a2", "u1", { createdAt: new Date(T0.getTime() - 1000) });
    const d = decideTrafficPools([newer, older], placementsFor("u1", 15, "p"));
    assert.equal(d.states.get("a1")!.used, 10);
    assert.equal(d.states.get("a2")!.used, 5);
    assert.equal(d.allowedPlacementIds.size, 15);
  });

  it("leaves members with no agent untouched (legacy rotation)", () => {
    const ps = placementsFor("u-solo", 12, "p");
    const d = decideTrafficPools([], ps);
    assert.equal(d.allowedPlacementIds.size, 12);
    assert.equal(d.states.size, 0);
  });

  it("leaves members whose agents are all paused untouched", () => {
    const paused = agent("a1", "u1", { status: "PAUSED" });
    const ps = placementsFor("u1", 12, "p");
    const d = decideTrafficPools([paused], ps);
    assert.equal(d.allowedPlacementIds.size, 12);
    assert.equal(d.states.get("a1")!.used, 0);
  });

  it("does not count an expired referral bot as a working agent", () => {
    const expired = agent("a1", "u1", { expiresAt: new Date(T0.getTime() - 1000) });
    const ps = placementsFor("u1", 3, "p");
    const d = decideTrafficPools([expired], ps, DAILY_TRAFFIC_SLOTS, T0);
    assert.equal(d.allowedPlacementIds.size, 3); // legacy — no working agent
    assert.equal(d.states.get("a1")!.used, 0);
  });

  it("isolates members: one member's spent pool never touches another's entries", () => {
    const a1 = agent("a1", "u1");
    const ps = [...placementsFor("u1", 11, "x"), ...placementsFor("u2", 4, "y")];
    const d = decideTrafficPools([a1], ps);
    assert.equal(d.states.get("a1")!.used, 10);
    for (const id of ["y0", "y1", "y2", "y3"]) assert.equal(d.allowedPlacementIds.has(id), true);
    assert.equal(d.allowedPlacementIds.size, 14);
  });
});
