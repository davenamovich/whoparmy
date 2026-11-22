import test from "node:test";
import assert from "node:assert/strict";
import { canUseForMcp, publicUpdateTokenStatus, tokenKind } from "./update-token-core.ts";

test("update tokens are classified as updates and rejected by MCP spend", () => {
  assert.equal(tokenKind("pru_secret"), "update");
  assert.equal(canUseForMcp(tokenKind("pru_secret")), false);
  assert.equal(tokenKind("prb_secret"), "spend");
  assert.equal(canUseForMcp(tokenKind("prb_secret")), true);
});

test("status contains dates and active state only, never token material", () => {
  const createdAt = new Date("2026-11-21T00:00:00Z");
  const status = publicUpdateTokenStatus({ createdAt, lastUsedAt: null });
  assert.deepEqual(status, { active: true, createdAt, lastUsedAt: null });
  assert.equal("token" in status, false);
  assert.equal("tokenHash" in status, false);
  assert.deepEqual(publicUpdateTokenStatus(null), { active: false, createdAt: null, lastUsedAt: null });
});
