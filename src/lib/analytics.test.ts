import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateAgentActivity, summarizePageViews } from "./analytics.ts";
import { clearPageViewRateLimitForTests, shouldRecordPageView, shouldTrackPageViews } from "./page-views.ts";

test("funnel aggregation summarizes seeded page view and agent event rows", () => {
  assert.deepEqual(summarizePageViews([
    { path: "/", referrerHost: "search.example" },
    { path: "/build", referrerHost: "search.example" },
    { path: "/", referrerHost: null },
  ]), {
    views: 3, uniquePaths: 2,
    topPaths: [{ name: "/", count: 2 }, { name: "/build", count: 1 }],
    topReferrers: [{ name: "search.example", count: 2 }],
  });
  assert.deepEqual(aggregateAgentActivity(
    [{ agentId: "a" }, { agentId: "a" }, { agentId: "b" }],
    [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
  ), [
    { agentId: "a", name: "Alpha", hops: 2 },
    { agentId: "b", name: "Beta", hops: 1 },
  ]);
});

test("Do Not Track and per-session repeat suppression are respected", () => {
  assert.equal(shouldTrackPageViews("1"), false);
  assert.equal(shouldTrackPageViews("0"), true);
  clearPageViewRateLimitForTests();
  assert.equal(shouldRecordPageView("member", "/build", 1000), true);
  assert.equal(shouldRecordPageView("member", "/build", 2000), false);
  assert.equal(shouldRecordPageView("member", "/other", 2000), true);
  assert.equal(shouldRecordPageView("member", "/build", 31_001), true);
});
