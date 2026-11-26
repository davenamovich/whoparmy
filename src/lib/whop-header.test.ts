import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveWhopHeader, firstNameOf } from "./whop-header.ts";

test("unresolved session reads as checking, no greeting", () => {
  assert.deepEqual(deriveWhopHeader(null), { tone: "checking", firstName: null, welcomeText: null });
  assert.deepEqual(deriveWhopHeader(undefined), { tone: "checking", firstName: null, welcomeText: null });
});

test("signed-out session reads as disconnected, no greeting", () => {
  assert.deepEqual(deriveWhopHeader({ connected: false, user: null }), {
    tone: "disconnected",
    firstName: null,
    welcomeText: null,
  });
});

test("connected session greets by first name only", () => {
  assert.deepEqual(deriveWhopHeader({ connected: true, user: { name: "Dave Namovich", whopUsername: "dave" } }), {
    tone: "connected",
    firstName: "Dave",
    welcomeText: "Welcome, Dave",
  });
});

test("connected session falls back to the Whop username when the name is absent", () => {
  assert.equal(firstNameOf({ name: null, whopUsername: "rifflefan" }), "rifflefan");
  assert.equal(deriveWhopHeader({ connected: true, user: { name: "  ", whopUsername: "rifflefan" } }).welcomeText, "Welcome, rifflefan");
});

test("connected session with no name at all greets plainly, never inventing one", () => {
  assert.deepEqual(deriveWhopHeader({ connected: true, user: null }), {
    tone: "connected",
    firstName: null,
    welcomeText: "Welcome",
  });
  assert.equal(firstNameOf(null), null);
  assert.equal(firstNameOf({ name: "", whopUsername: "" }), null);
});
