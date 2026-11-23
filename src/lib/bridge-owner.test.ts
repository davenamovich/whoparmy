import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBridgeOwnerId } from "./bridge-owner.ts";

test("bridge token owner is authoritative for address saves", async () => {
  const calls: string[] = [];
  const owner = await resolveBridgeOwnerId({
    authorization: "Bearer token-owner",
    verifyToken: async (token) => {
      calls.push(token);
      return { kind: "update", userId: "user-owner" };
    },
    sessionUserId: async () => "session-user",
  });
  assert.equal(owner, "user-owner");
  assert.deepEqual(calls, ["token-owner"]);
});

test("invalid bridge token is rejected and cannot select another user", async () => {
  const owner = await resolveBridgeOwnerId({
    authorization: "Bearer invalid",
    verifyToken: async () => null,
    sessionUserId: async () => "session-user",
  });
  assert.equal(owner, null);
});

test("session path remains available without a bearer token", async () => {
  const owner = await resolveBridgeOwnerId({
    authorization: null,
    verifyToken: async () => {
      throw new Error("token verifier should not run");
    },
    sessionUserId: async () => "session-user",
  });
  assert.equal(owner, "session-user");
});
