import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashIp,
  mintUserRotatorCode,
  pickSequential,
  pickWeighted,
  uaFamily,
  validateLinkSet,
  verifyUserRotatorCode,
  type PickableLink,
} from "./rotator-v2-core.ts";

const secret = "test-secret";
const links: PickableLink[] = [
  { linkId: "b", weight: 2, position: 1, hopsToday: 0, dailyCap: null },
  { linkId: "a", weight: 1, position: 0, hopsToday: 0, dailyCap: null },
  { linkId: "c", weight: 1, position: 2, hopsToday: 3, dailyCap: 3 },
];

describe("user rotator code", () => {
  it("mints and verifies signed rotator ids", () => {
    const code = mintUserRotatorCode("rot-1", secret);
    assert.deepEqual(verifyUserRotatorCode(code, secret), { rotatorId: "rot-1" });
  });

  it("rejects changed payloads, signatures, wrong secrets and malformed codes", () => {
    const code = mintUserRotatorCode("rot-1", secret);
    const parts = code.split(".");

    assert.equal(
      verifyUserRotatorCode(
        `v1.${Buffer.from('{"r":"rot-2"}').toString("base64url")}.${parts[2]}`,
        secret,
      ),
      null,
    );
    assert.equal(verifyUserRotatorCode(`${parts[0]}.${parts[1]}.bad`, secret), null);
    assert.equal(verifyUserRotatorCode(code, "other"), null);
    assert.equal(verifyUserRotatorCode("nope", secret), null);
  });
});

describe("user rotator picks", () => {
  it("orders, wraps and excludes capped links sequentially", () => {
    assert.equal(pickSequential(links, 0)?.linkId, "a");
    assert.equal(pickSequential(links, 1)?.linkId, "b");
    assert.equal(pickSequential(links, 2)?.linkId, "a");
    assert.equal(pickSequential([{ ...links[0], dailyCap: 1, hopsToday: 1 }], 0), null);
    assert.equal(pickSequential([], 0), null);
  });

  it("uses weighted buckets and excludes capped links", () => {
    assert.equal(pickWeighted(links, 0)?.linkId, "a");
    assert.equal(pickWeighted(links, 0.999)?.linkId, "b");
    assert.equal(
      pickWeighted([{ ...links[0], weight: 100 }, { ...links[1], weight: 1 }], 0.999)?.linkId,
      "b",
    );
    assert.equal(pickWeighted([{ ...links[0], dailyCap: 1, hopsToday: 1 }], 0.5), null);
    assert.equal(pickWeighted([], 0), null);
  });
});

describe("rotator metadata and ownership validation", () => {
  it("parses coarse UA family and hashes IPs", () => {
    assert.equal(uaFamily(null), "Other");
    assert.equal(uaFamily("Googlebot"), "Bot");
    assert.equal(uaFamily("Mozilla/5.0 Chrome/120"), "Chrome");

    const hash = hashIp("127.0.0.1");
    assert.equal(hash?.length, 64);
    assert.notEqual(hash, "127.0.0.1");
    assert.equal(hashIp(null), null);
  });

  it("validates link ownership and settings as a pure operation", () => {
    assert.equal(validateLinkSet(new Set(["mine"]), [{ engineLinkId: "theirs" }]).ok, false);

    const result = validateLinkSet(new Set(["mine"]), [{ engineLinkId: "mine", weight: 5 }]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.links[0].weight, 5);
    }
  });

  it("rejects duplicate saved links", () => {
    const result = validateLinkSet(new Set(["mine"]), [
      { engineLinkId: "mine" },
      { engineLinkId: "mine" },
    ]);
    assert.deepEqual(result, { ok: false, error: "Each link can only appear once." });
  });
});
