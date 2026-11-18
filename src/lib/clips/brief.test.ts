import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BRIEF_GATES,
  DEFAULT_SECONDS,
  MAX_CLIPS_PER_BRIEF,
  briefFromCard,
  isPortableBrief,
  parseBrief,
  renderBrief,
  toQueueFields,
} from "./brief.ts";

const page = { niche: "GTA 6 news and nostalgia", disclosure: "Not affiliated with Rockstar Games" };

test("parse: count, seconds and the angle come out of a sentence", () => {
  const brief = parseBrief("10 clips at 20 seconds, then vs now", page);
  assert.equal(brief.count, 10);
  assert.equal(brief.clipSeconds, 20);
  assert.match(brief.angle, /then vs now/i);
});

test("parse: a bare sentence still yields a usable brief", () => {
  const brief = parseBrief("just make something about the hidden car", page);
  assert.equal(brief.count, 1);
  assert.equal(brief.clipSeconds, DEFAULT_SECONDS);
  assert.match(brief.angle, /hidden car/i);
});

test("parse: digits without a unit are not mistaken for a count", () => {
  const brief = parseBrief("the 2 minute intro, cut hard", page);
  assert.equal(brief.count, 1);
});

test("bounds: count and length are clamped, never trusted", () => {
  const big = parseBrief("900 clips at 300 seconds", page);
  assert.equal(big.count, MAX_CLIPS_PER_BRIEF);
  assert.equal(big.clipSeconds, 30);
});

test("gates: every rendered brief carries the four rules", () => {
  const rendered = renderBrief(parseBrief("5 clips", page)).toLowerCase();
  for (const gate of BRIEF_GATES) {
    assert.ok(rendered.includes(gate.toLowerCase().slice(0, 25)), `missing gate: ${gate}`);
  }
  assert.ok(rendered.includes("never invent a number"));
  assert.ok(!rendered.includes("guaranteed"));
});

test("disclosure: a fan page's line travels into the brief, and its absence does not invent one", () => {
  assert.match(renderBrief(parseBrief("3 clips", page)), /Not affiliated with Rockstar Games/);
  const owned = renderBrief(parseBrief("3 clips", { niche: "my own shop" }));
  assert.doesNotMatch(owned, /Not affiliated/i);
});

test("card: a game brief card becomes a full brief with the page attached", () => {
  const brief = briefFromCard(
    { angle: "then vs now", hookFrame: "One second of the old thing.", format: "Side-by-side opening." },
    page,
    { count: 4, clipSeconds: 12 },
  );
  assert.equal(brief.count, 4);
  assert.equal(brief.clipSeconds, 12);
  assert.equal(brief.angle, "then vs now");
  assert.equal(brief.niche, page.niche);
});

test("portable: a brief without a credit policy is not sellable", () => {
  const brief = parseBrief("2 clips", page);
  brief.creditPolicy = "";
  const check = isPortableBrief(brief);
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => /credit policy/i.test(p)));
});

test("portable: a normal brief passes", () => {
  const check = isPortableBrief(parseBrief("6 clips at 15 seconds, the mistake angle", page));
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
});

test("queue fields: what a clip carries matches the brief that made it", () => {
  const brief = parseBrief("3 clips at 9 seconds", page);
  const fields = toQueueFields(brief);
  assert.equal(fields.clipSeconds, 9);
  assert.equal(fields.disclosure, page.disclosure);
});
