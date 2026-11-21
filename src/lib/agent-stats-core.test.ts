import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOUSE_CTA,
  buildSpotBlock,
  resolveHouseCta,
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

describe("resolveHouseCta — owner-first, per link (Dave, 2026-11-21)", () => {
  it("falls back to the house URLs when the owner saved neither link", () => {
    const cta = resolveHouseCta({});
    assert.deepEqual(cta.muse, { url: HOUSE_CTA.museUrl, source: "house" });
    assert.deepEqual(cta.agent37, { url: HOUSE_CTA.agent37Url, source: "house" });
    assert.equal(cta.muse.url, "https://www.plunderandriffle.com/muse-invite");
    assert.equal(cta.agent37.url, "https://www.plunderandriffle.com/agent37");
  });

  it("uses the owner's own links when both are saved", () => {
    const cta = resolveHouseCta({
      museUrl: "https://www.plunderandriffle.com/muse-invite?ref=OWNER1",
      agent37Url: "https://www.agent37.com/?via=owner",
    });
    assert.deepEqual(cta.muse, { url: "https://www.plunderandriffle.com/muse-invite?ref=OWNER1", source: "owner" });
    assert.deepEqual(cta.agent37, { url: "https://www.agent37.com/?via=owner", source: "owner" });
  });

  it("resolves mixed state per link: owner Muse, house Agent37", () => {
    const cta = resolveHouseCta({ museUrl: "https://example.com/my-muse" });
    assert.deepEqual(cta.muse, { url: "https://example.com/my-muse", source: "owner" });
    assert.deepEqual(cta.agent37, { url: HOUSE_CTA.agent37Url, source: "house" });
  });

  it("treats blank owner links as absent", () => {
    const cta = resolveHouseCta({ museUrl: "  ", agent37Url: "" });
    assert.equal(cta.muse.source, "house");
    assert.equal(cta.agent37.source, "house");
  });

  it("house fallback comes from the catalog when the server supplies one (still source house)", () => {
    // The fallback URLs are pulled from the P&R record (offers
    // catalog) by the server layer; the shape and the "house"
    // source label do not change — only the fallback's origin.
    const cta = resolveHouseCta(
      {},
      {
        museUrl: "https://www.plunderandriffle.com/muse-invite",
        agent37Url: "https://www.plunderandriffle.com/agent37",
      },
    );
    assert.deepEqual(cta.muse, { url: "https://www.plunderandriffle.com/muse-invite", source: "house" });
    assert.deepEqual(cta.agent37, { url: "https://www.plunderandriffle.com/agent37", source: "house" });
  });

  it("owner links still beat the catalog fallback, per link", () => {
    const cta = resolveHouseCta(
      { agent37Url: "https://www.agent37.com/?via=owner" },
      { museUrl: "https://catalog.example/muse", agent37Url: "https://catalog.example/a37" },
    );
    assert.deepEqual(cta.muse, { url: "https://catalog.example/muse", source: "house" });
    assert.deepEqual(cta.agent37, { url: "https://www.agent37.com/?via=owner", source: "owner" });
  });

  it("blank catalog fallback degrades to the constants", () => {
    const cta = resolveHouseCta({}, { museUrl: " ", agent37Url: null });
    assert.deepEqual(cta.muse, { url: HOUSE_CTA.museUrl, source: "house" });
    assert.deepEqual(cta.agent37, { url: HOUSE_CTA.agent37Url, source: "house" });
  });
});

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
