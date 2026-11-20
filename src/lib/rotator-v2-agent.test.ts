import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendSubParam, mintAgentRotatorCode, mintUserRotatorCode, pickGroupedDestination, verifyAgentRotatorCode, verifyUserRotatorCode } from "./rotator-v2-core.ts";
import { decideTrafficPools, placementAgentMap } from "./traffic-pool-core.ts";

const secret = "agent-test-secret";

describe("agent rotator codes", () => {
  it("round-trips and rejects tampering, wrong secrets, malformed and cross-scheme codes", () => {
    const code = mintAgentRotatorCode("rot-a", secret);
    assert.deepEqual(verifyAgentRotatorCode(code, secret), { rotatorId: "rot-a" });
    const parts = code.split(".");
    assert.equal(verifyAgentRotatorCode(`v1.${Buffer.from('{"a":"other"}').toString("base64url")}.${parts[2]}`, secret), null);
    assert.equal(verifyAgentRotatorCode(`${parts[0]}.${parts[1]}.bad`, secret), null);
    assert.equal(verifyAgentRotatorCode(code, "wrong"), null);
    assert.equal(verifyAgentRotatorCode("bad", secret), null);
    assert.equal(verifyAgentRotatorCode(mintUserRotatorCode("rot-u", secret), secret), null);
    assert.equal(verifyUserRotatorCode(code, secret), null);
  });
});

describe("agent rotator destinations", () => {
  it("appends sub while preserving query and hash and leaves existing or invalid inputs alone", () => {
    assert.equal(appendSubParam("https://example.test/path", "agent-1"), "https://example.test/path?sub=agent-1");
    assert.equal(appendSubParam("https://example.test/p?a=1#frag", "agent-1"), "https://example.test/p?a=1&sub=agent-1#frag");
    assert.equal(appendSubParam("https://example.test/p?sub=old", "agent-1"), "https://example.test/p?sub=old");
    assert.equal(appendSubParam("/relative", "agent-1"), "/relative");
  });

  it("shares hours equally across groups and rotates within each group", () => {
    const groups = [["a1", "a2"], ["b1"], [], ["c1", "c2"]];
    assert.equal(pickGroupedDestination(groups, 0), "a1");
    assert.equal(pickGroupedDestination(groups, 1), "b1");
    assert.equal(pickGroupedDestination(groups, 2), "c1");
    assert.equal(pickGroupedDestination(groups, 3), "a2");
    assert.equal(pickGroupedDestination([[], []], 4), null);
    assert.equal(pickGroupedDestination([["a"], ["b"]], -1), "b");
  });

  it("inverts traffic-pool attribution while omitting legacy placements", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const decision = decideTrafficPools(
      [{ id: "agent-1", userId: "u1", status: "ACTIVE", expiresAt: null, createdAt: now }],
      [
        { id: "p1", userId: "u1", partner: "x", createdAt: now },
        { id: "p2", userId: "u1", partner: "y", createdAt: new Date(now.getTime() + 1) },
        { id: "legacy", userId: "u2", partner: "z", createdAt: now },
      ],
    );
    assert.deepEqual([...placementAgentMap(decision)], [["p1", "agent-1"], ["p2", "agent-1"]]);
  });
});
