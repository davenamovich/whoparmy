import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BARRY_AGENT_NAME,
  BARRY_PROFILE_NEXT,
  BARRY_PROFILE_PREVIOUS,
  BARRY_SOURCE,
  BARRY_TEMPLATE_KEY,
  barryHireData,
  barryProfileRefreshReport,
  planBarryProfileRefresh,
  selectBarryRecord,
  type BarryCandidate,
} from "./barry-agent-core.ts";
import {
  DAILY_TRAFFIC_SLOTS,
  decideTrafficPools,
  type TrafficAgentInput,
  type TrafficPlacementInput,
} from "./traffic-pool-core.ts";

const T0 = new Date("2026-11-19T15:00:00Z");

describe("barryHireData — the record a successful BTC launch creates", () => {
  it("marks the record as BTC Barry from the btc-experiment stack", () => {
    const data = barryHireData("user-1", 50_000);
    assert.equal(data.userId, "user-1");
    assert.equal(data.templateKey, BARRY_TEMPLATE_KEY);
    assert.equal(data.templateKey, "btc-barry");
    assert.equal(data.name, BARRY_AGENT_NAME);
    assert.equal(data.name, "BTC Barry");
    assert.equal(data.source, BARRY_SOURCE);
    assert.equal(data.source, "STACK"); // not RENTAL, not REFERRAL
    assert.equal(data.tokenBudget, 50_000); // caller's internalBotBudget(plan)
    assert.equal(data.tokensUsed, 0);
    assert.ok(data.role.length > 0); // the factory role line, in plain words
  });

  it("is born ACTIVE with no expiry — a working agent under the pool rules", () => {
    const data = barryHireData("user-1", 1);
    assert.equal(data.status, "ACTIVE");
    assert.equal(data.expiresAt, null); // not a 24h referral grant — nothing lapses
  });

  it("carries no factory instructions or tools — Barry's instructions are the launch prompt", () => {
    const data = barryHireData("user-1", 1);
    assert.equal(data.instructions, null);
    assert.equal(data.toolsJson, null);
  });
});

function candidate(id: string, templateKey: string, at = T0): BarryCandidate {
  return { id, templateKey, createdAt: at };
}

describe("selectBarryRecord — one Barry per member, ever", () => {
  it("returns null when the member has no Barry yet (launch creates one)", () => {
    assert.equal(selectBarryRecord([]), null);
    assert.equal(selectBarryRecord([candidate("h1", "meme-smith"), candidate("h2", "scout")]), null);
  });

  it("reuses the existing Barry on re-launch instead of creating a second", () => {
    const barry = candidate("barry-1", BARRY_TEMPLATE_KEY);
    assert.equal(selectBarryRecord([candidate("h1", "scout"), barry])?.id, "barry-1");
  });

  it("picks the oldest Barry if duplicates ever exist, regardless of input order", () => {
    const older = candidate("barry-old", BARRY_TEMPLATE_KEY, new Date(T0.getTime() - 60_000));
    const newer = candidate("barry-new", BARRY_TEMPLATE_KEY, new Date(T0.getTime() + 60_000));
    assert.equal(selectBarryRecord([newer, older])?.id, "barry-old");
    assert.equal(selectBarryRecord([older, newer])?.id, "barry-old");
  });
});

describe("planBarryProfileRefresh — outcome-led copy, guarded (Dave, 2026-11-21)", () => {
  const previous = {
    description: BARRY_PROFILE_PREVIOUS.description,
    category: BARRY_PROFILE_PREVIOUS.category,
    capabilities: [...BARRY_PROFILE_PREVIOUS.capabilities],
  };

  it("the new defaults lead with outcome and name no offer", () => {
    assert.ok(!/DH Media|dh\.media/i.test(BARRY_PROFILE_NEXT.description));
    assert.deepEqual(BARRY_PROFILE_NEXT.capabilities, [
      "Daily content engine",
      "First-video creation",
      "Business research & audit",
      "Rotator distribution",
      "Tracked clicks & stats",
    ]);
    // Category stays in the fixed taxonomy (no "Growth" entry exists).
    assert.equal(BARRY_PROFILE_NEXT.category, "Marketing");
  });

  it("refreshes a row still carrying the previous shipped defaults exactly", () => {
    const plan = planBarryProfileRefresh(previous);
    assert.equal(plan.updates.description, BARRY_PROFILE_NEXT.description);
    assert.deepEqual(plan.updates.capabilities, [...BARRY_PROFILE_NEXT.capabilities]);
    assert.equal(plan.updates.category, undefined, "category is unchanged between defaults");
    assert.deepEqual(plan.customizedFields, []);
    const report = barryProfileRefreshReport(plan);
    assert.equal(report.profileRefreshed, true);
    assert.match(report.reason, /refreshed to the outcome-led defaults/);
  });

  it("fills empty fields with the new defaults", () => {
    const plan = planBarryProfileRefresh({ description: null, category: null, capabilities: [] });
    assert.equal(plan.updates.description, BARRY_PROFILE_NEXT.description);
    assert.equal(plan.updates.category, BARRY_PROFILE_NEXT.category);
    assert.deepEqual(plan.updates.capabilities, [...BARRY_PROFILE_NEXT.capabilities]);
  });

  it("leaves hand-edited copy untouched and reports it customized", () => {
    const plan = planBarryProfileRefresh({
      description: "Dave's own words about Barry.",
      category: BARRY_PROFILE_PREVIOUS.category,
      capabilities: [...BARRY_PROFILE_PREVIOUS.capabilities],
    });
    assert.equal(plan.updates.description, undefined, "edited description is never overwritten");
    assert.deepEqual(plan.customizedFields, ["description"]);
    assert.deepEqual(plan.updates.capabilities, [...BARRY_PROFILE_NEXT.capabilities], "untouched fields still refresh");
  });

  it("a fully customized profile is left entirely as-is", () => {
    const plan = planBarryProfileRefresh({
      description: "Custom description.",
      category: "Content",
      capabilities: ["Custom capability"],
    });
    assert.deepEqual(plan.updates, {});
    assert.deepEqual(plan.customizedFields, ["description", "category", "capabilities"]);
    const report = barryProfileRefreshReport(plan);
    assert.equal(report.profileRefreshed, false);
    assert.equal(report.reason, "Profile copy customized — left as-is.");
  });

  it("is a no-op once the row already carries the new defaults", () => {
    const plan = planBarryProfileRefresh({
      description: BARRY_PROFILE_NEXT.description,
      category: BARRY_PROFILE_NEXT.category,
      capabilities: [...BARRY_PROFILE_NEXT.capabilities],
    });
    assert.deepEqual(plan.updates, {});
    assert.deepEqual(plan.customizedFields, []);
    assert.equal(barryProfileRefreshReport(plan).profileRefreshed, false);
  });
});

describe("a launch-created Barry in Traffic Pool v1", () => {
  // The agent input exactly as the pool core reads a HiredAgent row:
  // Barry's hire shape (ACTIVE, expiresAt null) as the member's ONLY
  // agent — before the record existed this member had no pool at all
  // and every placement rotated on the legacy path.
  const hire = barryHireData("user-1", 50_000);
  const barry: TrafficAgentInput = {
    id: "barry-1",
    userId: hire.userId,
    status: hire.status,
    expiresAt: hire.expiresAt,
    createdAt: T0,
  };

  function placements(n: number): TrafficPlacementInput[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      userId: "user-1",
      partner: `partner-${i}`,
      createdAt: new Date(T0.getTime() + i * 1000),
    }));
  }

  it("attributes the member's placements to Barry's pool, capped at 10 a day", () => {
    const d = decideTrafficPools([barry], placements(12));
    const state = d.states.get("barry-1")!;
    assert.equal(state.total, DAILY_TRAFFIC_SLOTS);
    assert.equal(state.used, 10);
    assert.equal(state.remaining, 0);
    assert.equal(state.placementIds.length, 10);
    assert.equal(d.allowedPlacementIds.size, 10);
    assert.equal(d.allowedPlacementIds.has("p10"), false); // 11th stops rotating
    assert.equal(d.allowedPlacementIds.has("p11"), false); // 12th stops rotating
  });

  it("shows a full untouched pool on a day with no placements", () => {
    const d = decideTrafficPools([barry], []);
    const state = d.states.get("barry-1")!;
    assert.equal(state.used, 0);
    assert.equal(state.remaining, DAILY_TRAFFIC_SLOTS);
  });
});
