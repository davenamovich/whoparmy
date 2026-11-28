import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { researchGateState } from "./research-gate.ts";

describe("researchGateState", () => {
  it("done evidence wins over running and failed", () => {
    assert.equal(researchGateState({ hasDoneResearch: true, hasRunningResearch: true, hasFailedResearch: true }), "done");
  });
  it("running only is gated", () => {
    assert.equal(researchGateState({ hasDoneResearch: false, hasRunningResearch: true, hasFailedResearch: false }), "running");
  });
  it("failed only is gated", () => {
    assert.equal(researchGateState({ hasDoneResearch: false, hasRunningResearch: false, hasFailedResearch: true }), "failed");
  });
  it("nothing is gated", () => {
    assert.equal(researchGateState({ hasDoneResearch: false, hasRunningResearch: false, hasFailedResearch: false }), "none");
  });
});
