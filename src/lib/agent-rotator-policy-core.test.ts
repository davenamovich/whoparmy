import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BARRY_SLUG,
  DH_MEDIA_PARTNER_KEYS,
  effectivePolicy,
  filterRowsByPolicy,
  parseOffers,
  planMemberPoolSync,
  referrerRow,
  validateOffers,
  validatePool,
} from "./agent-rotator-policy-core.ts";

const row = (userId: string, partner: string, id = `${userId}-${partner}`) => ({ id, engineLink: { userId, partner } });

test("an unconfigured agent keeps its old behaviour: owner's links, no offer filter", () => {
  const p = effectivePolicy({ offersJson: null, pool: "OWNER", mode: "WEIGHTED" }, "some-agent");
  assert.deepEqual(p, { offers: null, pool: "OWNER", mode: "WEIGHTED", defaulted: false });
});

test("unconfigured house Barry defaults to DH Media, every member, round robin", () => {
  const p = effectivePolicy({ offersJson: null, pool: "OWNER", mode: "WEIGHTED" }, BARRY_SLUG);
  assert.deepEqual(p.offers, [...DH_MEDIA_PARTNER_KEYS]);
  assert.equal(p.pool, "MEMBERS");
  assert.equal(p.mode, "SEQUENTIAL");
  assert.equal(p.defaulted, true);
});

test("an owner's explicit pick overrides Barry's default", () => {
  const p = effectivePolicy({ offersJson: JSON.stringify(["fish"]), pool: "OWNER", mode: "WEIGHTED" }, BARRY_SLUG);
  assert.deepEqual(p.offers, ["fish"]);
  assert.equal(p.pool, "OWNER");
  assert.equal(p.defaulted, false);
});

test("a MEMBERS pool is always sequential, so no member is weighted up", () => {
  const p = effectivePolicy({ offersJson: '["salarium"]', pool: "MEMBERS", mode: "WEIGHTED" }, "x");
  assert.equal(p.mode, "SEQUENTIAL");
});

test("the agent only promotes the offers its owner picked", () => {
  const rows = [row("owner", "salarium"), row("owner", "muse"), row("owner", "agent37_ref")];
  const p = effectivePolicy({ offersJson: '["salarium"]', pool: "OWNER", mode: "WEIGHTED" }, "x");
  assert.deepEqual(filterRowsByPolicy(rows, p, "owner").map((r) => r.engineLink.partner), ["salarium"]);
});

test("an OWNER pool never serves another member's link; a MEMBERS pool does", () => {
  const rows = [row("owner", "salarium"), row("alice", "salarium"), row("bob", "salarium"), row("bob", "muse")];
  const owner = effectivePolicy({ offersJson: '["salarium"]', pool: "OWNER", mode: "WEIGHTED" }, "x");
  assert.deepEqual(filterRowsByPolicy(rows, owner, "owner").map((r) => r.engineLink.userId), ["owner"]);
  const members = effectivePolicy({ offersJson: '["salarium"]', pool: "MEMBERS", mode: "WEIGHTED" }, "x");
  assert.deepEqual(filterRowsByPolicy(rows, members, "owner").map((r) => r.id), ["owner-salarium", "alice-salarium", "bob-salarium"]);
});

test("an empty pick promotes nothing", () => {
  const p = effectivePolicy({ offersJson: "[]", pool: "MEMBERS", mode: "SEQUENTIAL" }, BARRY_SLUG);
  assert.deepEqual(filterRowsByPolicy([row("a", "salarium")], p, "owner"), []);
});

test("member sync appends new members after the last position and skips ones already in", () => {
  const plan = planMemberPoolSync(
    [
      { engineLinkId: "l1", position: 0 },
      { engineLinkId: "l2", position: 4 },
    ],
    [{ id: "l1" }, { id: "l3" }, { id: "l2" }, { id: "l4" }, { id: "l3" }],
  );
  assert.deepEqual(plan, [
    { engineLinkId: "l3", position: 5 },
    { engineLinkId: "l4", position: 6 },
  ]);
  assert.deepEqual(planMemberPoolSync([], [{ id: "a" }]), [{ engineLinkId: "a", position: 0 }]);
});

test("a referral goes to the referrer's own link when they have one", () => {
  const rows = [row("alice", "salarium"), row("bob", "salarium")];
  assert.equal(referrerRow(rows, "bob")?.engineLink.userId, "bob");
  assert.equal(referrerRow(rows, "carol"), null);
  assert.equal(referrerRow(rows, null), null);
});

test("offer validation: partner keys only, deduped, capped", () => {
  assert.deepEqual(validateOffers(["salarium", "salarium", " muse "]), { ok: true, offers: ["salarium", "muse"] });
  assert.equal(validateOffers("salarium").ok, false);
  assert.equal(validateOffers(["https://evil.example"]).ok, false);
  assert.equal(validateOffers(["a"], new Set(["b"])).ok, false);
  assert.equal(validateOffers(Array.from({ length: 21 }, (_, i) => `p${i}`)).ok, false);
  assert.deepEqual(validateOffers([]), { ok: true, offers: [] });
});

test("pool validation and offer parsing tolerate junk", () => {
  assert.equal(validatePool("MEMBERS").ok, true);
  assert.equal(validatePool("everyone").ok, false);
  assert.equal(parseOffers("not json"), null);
  assert.equal(parseOffers('{"a":1}'), null);
  assert.deepEqual(parseOffers('["a", 3, "", "b"]'), ["a", "b"]);
});
