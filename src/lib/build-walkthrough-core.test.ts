import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectWalkthroughOffers, shouldSuggestWalkthrough } from "./build-walkthrough-core.ts";

describe("build walkthrough selection", () => {
  it("filters saved and unresolved offers, preserves catalog order, and puts DH Media first", () => {
    const selected = selectWalkthroughOffers([
      { key: "second", name: "Second", url: "", signupUrl: "https://s.example", signupSource: "house" },
      { key: "saved", name: "Saved", url: "https://mine.example", signupUrl: "https://saved.example", signupSource: "referrer" },
      { key: "none", name: "None", url: "", signupUrl: null, signupSource: null },
      { key: "salarium", name: "DH Media", url: "", signupUrl: "https://dh.example", signupSource: "referrer" },
      { key: "last", name: "Last", url: "", signupUrl: "https://l.example", signupSource: "house" },
    ]);
    assert.deepEqual(selected.map((offer) => offer.step), ["salarium", "second", "last"]);
    assert.deepEqual(selected[0], { step: "salarium", name: "DH Media", signupUrl: "https://dh.example", signupSource: "referrer" });
  });

  it("suggests walkthrough below two saved links", () => {
    assert.equal(shouldSuggestWalkthrough(0), true);
    assert.equal(shouldSuggestWalkthrough(1), true);
    assert.equal(shouldSuggestWalkthrough(2), false);
  });
});
