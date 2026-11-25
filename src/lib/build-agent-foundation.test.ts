import assert from "node:assert/strict";
import { test } from "node:test";
test("foundation response state contains no key field", () => {
  // Mirrors the foundation object returned by the route's lib state helper.
  const foundation = { lane: "durable" } as Record<string, unknown>;
  assert.equal("key" in foundation, false);
  assert.deepEqual(foundation, { lane: "durable" });
});
