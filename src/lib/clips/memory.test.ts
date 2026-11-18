import { test } from "node:test";
import assert from "node:assert/strict";

import { armyScope, clipScope, MemoryScopeError } from "./memory.ts";

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
