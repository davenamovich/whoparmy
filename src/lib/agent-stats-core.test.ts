import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSpotBlock,
  summarizeAgentHops,
  summarizePool,
  type HopSurfaceGroup,
} from "./agent-stats-core.ts";
import { spotWindowFor } from "./rotator-market.ts";

/**
 * Public agent stats definitions (agent-stats-core.ts): visitors
 * sent = every counted hop carrying the agent's id; launches =
 * counted hops on surface AGENT (the agent's own rotator link) only.
 * Filtered hops never reach these functions — the server queries
 * counted=true rows only — so nothing here can resurrect them.
 */

describe("summarizeAgentHops", () => {
  it("visitors sent sums all counted surfaces; launches count AGENT serves only", () => {
    const groups: HopSurfaceGroup[] = [
      { surface: "AGENT", allTime: 40, last7d: 9 },
      { surface: "ALLOCATOR", allTime: 25, last7d: 4 },
    ];
    const s = summarizeAgentHops(groups);
    assert.equal(s.visitorsSent, 65);
    assert.equal(s.visitorsSent7d, 13);
    assert.equal(s.launches, 40);
    assert.equal(s.launches7d, 9);
  });

  it("an agent with no counted hops is an honest zero", () => {
    const s = summarizeAgentHops([]);
    assert.deepEqual(s, { visitorsSent: 0, visitorsSent7d: 0, launches: 0, launches7d: 0 });
  });

  it("marketplace hops never count — an impression is not a visitor sent", () => {
    // ROTATOR_PAGE hops carry an agentId for placement attribution,
    // but they are the marketplace's impressions/clicks, not serves
    // through the agent's rotator.
    const s = summarizeAgentHops([{ surface: "ROTATOR_PAGE", allTime: 3, last7d: 1 }]);
    assert.equal(s.visitorsSent, 0);
    assert.equal(s.visitorsSent7d, 0);
    assert.equal(s.launches, 0);
  });
});

describe("buildSpotBlock", () => {
  const window = spotWindowFor(new Date("2026-11-21T12:00:00Z")); // key 2026-11-20

  it("available = allotment − used for a working agent", () => {
    const spots = buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 3, active: true });
    assert.equal(spots.windowKey, "2026-11-20");
    assert.equal(spots.opensAt, window.startUtc);
    assert.equal(spots.resetsAt, window.endUtc);
    assert.equal(spots.allotment, 10);
    assert.equal(spots.used, 3);
    assert.equal(spots.available, 7);
    assert.equal(spots.nextWindowAllotment, 10);
    assert.equal(spots.active, true);
  });

  it("over-consumption clamps at zero available, never negative", () => {
    const spots = buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 14, active: true });
    assert.equal(spots.available, 0);
    assert.equal(spots.used, 14);
  });

  it("a non-working agent has no available spots, whatever the arithmetic", () => {
    const spots = buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 0, active: false });
    assert.equal(spots.available, 0);
    assert.equal(spots.active, false);
  });
});

describe("summarizePool", () => {
  const window = spotWindowFor(new Date("2026-11-21T12:00:00Z"));

  it("totals open spots over working agents only", () => {
    const spots = [
      buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 3, active: true }),
      buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 10, active: true }),
      buildSpotBlock({ window, allotment: 10, nextWindowAllotment: 10, used: 0, active: false }),
    ];
    const pool = summarizePool(window, spots);
    assert.equal(pool.totalAvailable, 7);
    assert.equal(pool.activeAgents, 2);
    assert.equal(pool.windowKey, "2026-11-20");
    assert.equal(pool.resetsAt, window.endUtc);
  });

  it("an empty directory is an honest zero", () => {
    const pool = summarizePool(window, []);
    assert.equal(pool.totalAvailable, 0);
    assert.equal(pool.activeAgents, 0);
  });
});
