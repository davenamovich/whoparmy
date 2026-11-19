import { test } from "node:test";
import assert from "node:assert/strict";

import {
  armyScope,
  clipScope,
  decisionText,
  MemoryScopeError,
  pageTag,
} from "./memory.ts";

test("memory scope: every scope carries the member id", () => {
  assert.equal(clipScope("user_1"), "clip:user_1");
  assert.equal(clipScope("user_1", "page_9"), "clip:user_1:page:page_9");
  assert.equal(armyScope("user_1"), "army:user_1");
  assert.equal(armyScope("user_1", "bot_3"), "army:user_1:bot:bot_3");
});

test("memory scope: an empty or missing member id is refused, not defaulted", () => {
  // Defaulting here would silently share one member's taste with everyone.
  assert.throws(() => clipScope(""), MemoryScopeError);
  assert.throws(() => clipScope("   "), MemoryScopeError);
  assert.throws(() => armyScope(undefined as unknown as string), MemoryScopeError);
});

test("memory scope: one member can never appear inside another's scope", () => {
  const a = clipScope("user_a", "page_1");
  const b = clipScope("user_b", "page_1");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("clip:user_a:"));
  assert.ok(!a.includes("user_b"));
});

// The page tag is what keeps page taste apart now that the store is
// addressed by person (one bridge scope, so the Memory tab can read it).
test("page tag: present when there is a page, absent when there isn't", () => {
  assert.equal(pageTag("page_9"), "page:page_9");
  assert.equal(pageTag("  page_9  "), "page:page_9");
  assert.equal(pageTag(""), "");
  assert.equal(pageTag(undefined), "");
});

test("decision text: page first, then the decision, then the member's words", () => {
  const line = decisionText({
    pageId: "page_9",
    clipId: "clip_1",
    decision: "rejected",
    note: "too salesy for this page",
  });
  assert.equal(line, "page:page_9 — rejected clip clip_1 — too salesy for this page");
  assert.ok(line.indexOf("page:page_9") === 0);
});

test("decision text: the diff only belongs to an edit", () => {
  const edited = decisionText({
    clipId: "clip_2",
    decision: "edited",
    original: "Buy now",
    final: "Have a look",
  });
  assert.ok(edited.includes("was: Buy now → now: Have a look"));

  const approved = decisionText({
    clipId: "clip_3",
    decision: "approved",
    original: "Buy now",
    final: "Have a look",
  });
  assert.ok(!approved.includes("was:"), "an approval carries no diff");
});

test("decision text: a long edit is clipped, not stored whole", () => {
  const line = decisionText({
    clipId: "clip_4",
    decision: "edited",
    original: "x".repeat(400),
    final: "y".repeat(400),
  });
  assert.ok(line.length < 400, `expected a clipped diff, got ${line.length} chars`);
});
