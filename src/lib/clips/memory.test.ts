import { test } from "node:test";
import assert from "node:assert/strict";

import { armyScope, clipScope, scopeHeaders, MemoryScopeError } from "./memory.ts";

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

test("bridge headers: a member is never written to Dave's store", () => {
  // The bridge defaults X-Mnemos-Person to "user" (Dave). If this ever returns
  // "user", a member's taste silently lands in the operator's memory.
  const h = scopeHeaders(clipScope("user_1", "page_9"));
  assert.equal(h.person, "member-user_1");
  assert.notEqual(h.person, "user");
  assert.equal(h.project, "whoparmy:page:page_9");
});

test("bridge headers: page and bot scopes stay separate projects", () => {
  assert.equal(scopeHeaders(clipScope("user_1")).project, "whoparmy");
  assert.equal(scopeHeaders(armyScope("user_1")).project, "whoparmy:army");
  assert.equal(scopeHeaders(armyScope("user_1", "bot_3")).project, "whoparmy:army:bot_3");
});

test("bridge headers: two members never share a person", () => {
  const a = scopeHeaders(clipScope("user_a", "page_1"));
  const b = scopeHeaders(clipScope("user_b", "page_1"));
  assert.notEqual(a.person, b.person);
  assert.equal(a.project, b.project, "same page, different people — person is what separates them");
});

test("bridge headers: an unknown scope kind is refused, not guessed", () => {
  assert.throws(() => scopeHeaders("nonsense:user_1"), MemoryScopeError);
  assert.throws(() => scopeHeaders(""), MemoryScopeError);
});
