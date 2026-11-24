import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveWhopConnection } from "./whop-connection.ts";

test("unresolved session reads as checking", () => {
  assert.deepEqual(deriveWhopConnection(null, null), { tone: "checking", text: "Whop · Checking…" });
  assert.deepEqual(deriveWhopConnection(undefined, undefined), { tone: "checking", text: "Whop · Checking…" });
});

test("signed-out session reads as not connected", () => {
  assert.deepEqual(deriveWhopConnection({ connected: false, user: null }, null), {
    tone: "disconnected",
    text: "Whop · Not connected",
  });
});

test("connected session + linked bridge account reads as connected with plan and credits", () => {
  assert.deepEqual(
    deriveWhopConnection({ connected: true, user: { planName: "Creator" } }, { connected: true, credits: 120, errorCode: null }),
    { tone: "connected", text: "Whop · Connected · Creator · 120 credits" },
  );
});

test("connected without plan name or credit figure omits those parts", () => {
  assert.deepEqual(
    deriveWhopConnection({ connected: true, user: null }, { connected: true, credits: null, errorCode: null }),
    { tone: "connected", text: "Whop · Connected" },
  );
});

test("the -1 unlimited sentinel never renders as a credit count", () => {
  const state = deriveWhopConnection(
    { connected: true, user: { planName: "Operator" } },
    { connected: true, credits: -1, errorCode: null },
  );
  assert.equal(state.text, "Whop · Connected · Operator · Unlimited credits");
});

test("signed in but bridge account not linked reads as unlinked and surfaces the error code", () => {
  assert.deepEqual(
    deriveWhopConnection(
      { connected: true, user: { planName: "Creator" } },
      { connected: false, credits: null, errorCode: "NOT_CONFIGURED" },
    ),
    { tone: "unlinked", text: "Whop · Signed in — engine not linked · NOT_CONFIGURED" },
  );
});

test("signed in with no bridge account at all (fetch failed) reads as unlinked without inventing a code", () => {
  assert.deepEqual(deriveWhopConnection({ connected: true, user: { planName: "Creator" } }, null), {
    tone: "unlinked",
    text: "Whop · Signed in — engine not linked",
  });
});

test("a connected BYOK member's pill carries the BYOK marker after the live balance", () => {
  assert.deepEqual(
    deriveWhopConnection(
      { connected: true, user: { planName: "Creator" } },
      { connected: true, credits: 432, errorCode: null, byok: { anySaved: true } },
    ),
    { tone: "connected", text: "Whop · Connected · Creator · 432 credits · BYOK" },
  );
});

test("the BYOK marker also follows the unlimited sentinel", () => {
  const state = deriveWhopConnection(
    { connected: true, user: { planName: "Operator" } },
    { connected: true, credits: -1, errorCode: null, byok: { anySaved: true } },
  );
  assert.equal(state.text, "Whop · Connected · Operator · Unlimited credits · BYOK");
});

test("no BYOK marker when nothing is saved or the check did not run", () => {
  const base = { connected: true, user: { planName: "Creator" } };
  assert.equal(
    deriveWhopConnection(base, { connected: true, credits: 100, errorCode: null, byok: { anySaved: false } }).text,
    "Whop · Connected · Creator · 100 credits",
  );
  assert.equal(
    deriveWhopConnection(base, { connected: true, credits: 100, errorCode: null, byok: null }).text,
    "Whop · Connected · Creator · 100 credits",
  );
  assert.equal(
    deriveWhopConnection(base, { connected: true, credits: 100, errorCode: null }).text,
    "Whop · Connected · Creator · 100 credits",
  );
});
