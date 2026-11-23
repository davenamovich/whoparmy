import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXPERIMENT_CODE_TTL_MS,
  EXPERIMENT_GENERATING_COSTS,
  codeTtlLabel,
  codeTtlMsForScope,
  ownBalanceBudget,
} from "./experiment-scope.ts";

describe("experiment scope", () => {
  it("gives every scope 24 hours", () => {
    assert.equal(codeTtlMsForScope("experiment"), EXPERIMENT_CODE_TTL_MS);
    assert.equal(EXPERIMENT_CODE_TTL_MS, 24 * 60 * 60_000);
    assert.equal(codeTtlMsForScope("week"), 24 * 60 * 60_000);
    assert.equal(codeTtlMsForScope("clips"), 24 * 60 * 60_000);
    assert.equal(codeTtlLabel("experiment"), "24 hours");
    assert.equal(codeTtlLabel("week"), "24 hours");
  });

  it("allows the ad tools and never the clip, publish or MP4 tools", () => {
    for (const t of ["generate_ad_creative", "generate_ad_copy", "create_demo_pack"]) {
      assert.ok(Object.hasOwn(EXPERIMENT_GENERATING_COSTS, t), t);
    }
    for (const t of ["create_sitdown", "publish_clip", "post_to_socials", "request_mp4", "constructor", "toString"]) {
      assert.equal(Object.hasOwn(EXPERIMENT_GENERATING_COSTS, t), false, t);
    }
  });

  it("budgets from the member's own balance", () => {
    assert.equal(ownBalanceBudget(320, 5000), 320);
    assert.equal(ownBalanceBudget(0, 5000), 0);
    assert.equal(ownBalanceBudget(9000, 5000), 5000);
    assert.equal(ownBalanceBudget(-1, 5000), 5000);
    assert.equal(ownBalanceBudget(12.9, 5000), 12);
    assert.equal(ownBalanceBudget(Number.NaN, 5000), 0);
  });
});
