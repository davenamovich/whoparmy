import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLIP_COGS_USD,
  CLIP_PACKS,
  CREDITS_PER_CLIP,
  FREE_GRANT_CLIPS,
  LIST_CREDIT_COST_USD,
  MIN_GROSS_MARGIN,
  grossMargin,
  laneCopy,
  marginAtMaxBonus,
  packByKey,
  pricePerClip,
} from "./packs.ts";

test("cogs: a house-lane clip is 25 list credits at the stated credit cost", () => {
  assert.equal(CREDITS_PER_CLIP, 25);
  assert.equal(LIST_CREDIT_COST_USD, 0.005);
  assert.equal(CLIP_COGS_USD, 0.125);
});

test("margin: every pack clears the floor even if the member takes the full bonus", () => {
  for (const pack of CLIP_PACKS) {
    const worst = marginAtMaxBonus(pack);
    assert.ok(
      worst >= MIN_GROSS_MARGIN,
      `${pack.name} falls to ${(worst * 100).toFixed(1)}% at the bonus cap, under ${MIN_GROSS_MARGIN * 100}%`,
    );
  }
});

test("margin: no pack is priced under cost at list, obviously", () => {
  for (const pack of CLIP_PACKS) {
    assert.ok(grossMargin(pack) > 0.7, `${pack.name} list margin ${grossMargin(pack)}`);
    assert.ok(pricePerClip(pack) > CLIP_COGS_USD);
  }
});

test("packs: bigger pack means a cheaper clip and more rounds", () => {
  const sorted = [...CLIP_PACKS].sort((a, b) => a.clips - b.clips);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      pricePerClip(sorted[i]) < pricePerClip(sorted[i - 1]),
      `${sorted[i].name} should be cheaper per clip than ${sorted[i - 1].name}`,
    );
    assert.ok(sorted[i].rounds >= sorted[i - 1].rounds);
  }
});

test("free grant: three clips is a few dimes of engine cost, not a subsidy", () => {
  const cost = FREE_GRANT_CLIPS * CLIP_COGS_USD;
  assert.ok(cost < 1, `free grant costs $${cost.toFixed(3)} per signup`);
  assert.ok(FREE_GRANT_CLIPS >= 3, "fewer than three is not enough to judge a clip");
});

test("lookup: a pack key resolves, an unknown one does not", () => {
  assert.equal(packByKey("page")?.clips, 30);
  assert.equal(packByKey("nope"), null);
});

test("copy: both lanes named, and the comparison is not computed for the member", () => {
  const copy = laneCopy();
  assert.match(copy, /no keys, no setup/i);
  assert.match(copy, /own P&R key/i);
  assert.doesNotMatch(copy, /\d+\s*(x|times)\s*(cheaper|less)/i);
});
