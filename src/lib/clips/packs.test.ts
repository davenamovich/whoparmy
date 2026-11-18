import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_BONUS_RATIO as GAME_MAX_BONUS_RATIO } from "./game.ts";
import {
  CLIP_COGS_USD,
  CLIP_PACKS,
  FREE_GRANT_CLIPS,
  LIST_CREDITS_PER_CLIP,
  MAX_BONUS_RATIO,
  MIN_GROSS_MARGIN,
  MIN_PRICE_PER_CLIP_USD,
  AGENT37_RENDER_COST_USD,
  LLM_TEXT_COST_USD,
  MAX_TURNS_PER_CLIP,
  grossMargin,
  laneCopy,
  marginAtMaxBonus,
  packByKey,
  pricePerClip,
} from "./packs.ts";

test("cogs: the render is the whole cost, counted once", () => {
  assert.equal(AGENT37_RENDER_COST_USD, 0.005);
  assert.equal(LLM_TEXT_COST_USD, 0, "text is near-free; counting it again is how a cost gets invented");
  assert.equal(CLIP_COGS_USD, AGENT37_RENDER_COST_USD + LLM_TEXT_COST_USD);
  assert.equal(LIST_CREDITS_PER_CLIP, 25, "25 is a list price, never a cost");
});

test("turns: the worker is budgeted to a single pass per clip", () => {
  // Agent37 bills compute, so turns are the real exposure — not the render.
  assert.equal(MAX_TURNS_PER_CLIP, 3);
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

test("ceiling: pricing reads the same ratio the game pays out on", () => {
  // Duplicated on purpose (see packs.ts) — this is the binding.
  assert.equal(MAX_BONUS_RATIO, GAME_MAX_BONUS_RATIO);
});

test("positioning: no pack is priced like a commodity", () => {
  // Cost is $0.005 a clip. Price is not derived from cost — this floor exists
  // so a later "let's discount it" is a decision someone makes, not a drift.
  for (const pack of CLIP_PACKS) {
    assert.ok(
      pricePerClip(pack) >= MIN_PRICE_PER_CLIP_USD,
      `${pack.name} is $${pricePerClip(pack).toFixed(2)} a clip, under the $${MIN_PRICE_PER_CLIP_USD} floor`,
    );
  }
});

test("positioning: the entry pack undercuts one freelance edit, not the compute", () => {
  const cheapestEdit = 15; // a freelance short-form edit, conservatively
  const entry = [...CLIP_PACKS].sort((a, b) => a.clips - b.clips)[0];
  assert.ok(
    pricePerClip(entry) < cheapestEdit,
    "a clip must still be cheaper than the cheapest freelance edit, or there is no offer",
  );
  assert.ok(pricePerClip(entry) > 1, "and never priced at a fraction of a dollar");
});
