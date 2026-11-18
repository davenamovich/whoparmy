import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FORBIDDEN_CLAIMS,
  MUSE_JOIN_URL,
  ONRAMP,
  findForbiddenClaims,
  onrampIsHonest,
  onrampText,
} from "./onramp.ts";

test("onramp: three rungs, in the order a member climbs them", () => {
  assert.deepEqual(
    ONRAMP.map((r) => r.id),
    ["muse-referral", "byok", "agent37"],
  );
});

test("onramp: every rung states a cost and a catch", () => {
  for (const rung of ONRAMP) {
    assert.ok(rung.cost.trim().length > 0, `${rung.id} has no cost`);
    assert.ok(rung.caveat.trim().length >= 40, `${rung.id}'s caveat is too thin to be a caveat`);
  }
});

test("onramp: the Muse rung is attributed to Meta, not to us", () => {
  const muse = ONRAMP.find((r) => r.id === "muse-referral")!;
  const text = onrampText(muse).toLowerCase();
  assert.match(text, /meta runs this programme, not us/);
  assert.match(text, /48 hours/);
  assert.equal(MUSE_JOIN_URL, "https://muse.ai/join");
});

test("onramp: no rung promises a token amount — that is Meta's number to change", () => {
  for (const rung of ONRAMP) {
    const text = onrampText(rung).toLowerCase();
    assert.doesNotMatch(text, /\bbillion\b/, `${rung.id} quotes a token amount as if it were ours`);
    assert.doesNotMatch(text, /\b\d+\s*(billion|million)\b/);
  }
});

test("honesty: the whole ladder passes its own check", () => {
  const check = onrampIsHonest();
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
});

test("honesty: the claim detector catches the phrases that would bite us", () => {
  assert.deepEqual(findForbiddenClaims("This is guaranteed to work"), ["guaranteed"]);
  assert.deepEqual(findForbiddenClaims("unlimited free clips"), ["unlimited free"]);
  assert.deepEqual(findForbiddenClaims("we will give you tokens"), ["we will give you"]);
  assert.deepEqual(findForbiddenClaims("Meta credits both sides"), []);
  for (const claim of FORBIDDEN_CLAIMS) {
    assert.ok(findForbiddenClaims(claim).length > 0, claim);
  }
});
