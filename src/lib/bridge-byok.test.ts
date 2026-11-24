import assert from "node:assert/strict";
import { test } from "node:test";
import { byokViewFromUnlockPayload, deriveCreditsDisplay } from "./bridge-byok.ts";

/**
 * Payloads below mirror the engine's real check_my_unlock output
 * (bot unlock-diagnosis diagnoseUnlock): unlocks.<step>.saved flags,
 * links carries a count, mp4 carries the dry-run quote.
 */

const FULL_PAYLOAD = {
  member: { idKind: "telegram", fullByokPossible: false },
  unlocks: {
    links: { saved: true, count: 3 },
    llm: { saved: true },
    giphy: { saved: true },
    fish: { saved: true },
    herenow: { saved: true },
    renderer: { saved: true },
  },
  mp4: { creditsIfRenderedNow: 1, basis: "own render worker" },
  split: null,
  nextSteps: [],
};

const NOTHING_SAVED_PAYLOAD = {
  member: { idKind: "telegram", fullByokPossible: false },
  unlocks: {
    links: { saved: false, count: 0 },
    llm: { saved: false },
    giphy: { saved: false },
    fish: { saved: false },
    herenow: { saved: false },
    renderer: { saved: false },
  },
  mp4: { creditsIfRenderedNow: 25, basis: "house servers" },
  split: null,
  nextSteps: ["Save your offer or referral links on this record"],
};

test("a full check_my_unlock payload maps to a populated BYOK block", () => {
  assert.deepEqual(byokViewFromUnlockPayload(FULL_PAYLOAD), {
    anySaved: true,
    saved: { links: true, llm: true, giphy: true, fish: true, herenow: true, renderer: true },
    ownWorker: true,
    mp4QuoteCredits: 1,
  });
});

test("a member with nothing saved is recognized as non-BYOK, with the house MP4 quote", () => {
  assert.deepEqual(byokViewFromUnlockPayload(NOTHING_SAVED_PAYLOAD), {
    anySaved: false,
    saved: { links: false, llm: false, giphy: false, fish: false, herenow: false, renderer: false },
    ownWorker: false,
    mp4QuoteCredits: 25,
  });
});

test("one saved key is enough for BYOK recognition; ownWorker tracks only the renderer save", () => {
  const payload = {
    unlocks: {
      links: { saved: false, count: 0 },
      llm: { saved: false },
      giphy: { saved: true },
      fish: { saved: false },
      herenow: { saved: false },
      renderer: { saved: false },
    },
    mp4: { creditsIfRenderedNow: 25, basis: "house servers" },
  };
  const view = byokViewFromUnlockPayload(payload);
  assert.equal(view?.anySaved, true);
  assert.equal(view?.saved.giphy, true);
  assert.equal(view?.ownWorker, false);
  assert.equal(view?.mp4QuoteCredits, 25);
});

test("a missing MP4 quote degrades to null, never an invented figure", () => {
  const payload = { unlocks: { llm: { saved: true } } };
  const view = byokViewFromUnlockPayload(payload);
  assert.equal(view?.anySaved, true);
  assert.equal(view?.mp4QuoteCredits, null);
});

test("unrecognizable payloads map to null so the view degrades gracefully", () => {
  assert.equal(byokViewFromUnlockPayload(null), null);
  assert.equal(byokViewFromUnlockPayload(undefined), null);
  assert.equal(byokViewFromUnlockPayload("check_my_unlock"), null);
  assert.equal(byokViewFromUnlockPayload({}), null);
  assert.equal(byokViewFromUnlockPayload({ unlocks: null }), null);
  assert.equal(byokViewFromUnlockPayload({ unlocks: "yes" }), null);
  assert.equal(byokViewFromUnlockPayload({ result: "error" }), null);
});

test("BYOK members get the live-balance BYOK presentation with their saved keys named", () => {
  const byok = byokViewFromUnlockPayload(FULL_PAYLOAD);
  assert.deepEqual(deriveCreditsDisplay({ byok }), {
    byok: true,
    balanceLabel: "Your balance · BYOK",
    savedLabels: ["offer links", "LLM key", "Giphy key", "Fish Audio key", "here.now key", "render worker"],
    llmSaved: true,
    ownWorker: true,
    mp4QuoteCredits: 1,
  });
});

test("a partially-saved BYOK member lists only what is actually saved", () => {
  const byok = byokViewFromUnlockPayload({
    unlocks: { llm: { saved: true }, renderer: { saved: true } },
    mp4: { creditsIfRenderedNow: 1, basis: "own render worker" },
  });
  const display = deriveCreditsDisplay({ byok });
  assert.equal(display.byok, true);
  assert.deepEqual(display.savedLabels, ["LLM key", "render worker"]);
  assert.equal(display.llmSaved, true);
  assert.equal(display.ownWorker, true);
});

test("non-BYOK members keep the plain allowance presentation", () => {
  const byok = byokViewFromUnlockPayload(NOTHING_SAVED_PAYLOAD);
  assert.deepEqual(deriveCreditsDisplay({ byok }), {
    byok: false,
    balanceLabel: "Balance",
    savedLabels: [],
    llmSaved: false,
    ownWorker: false,
    mp4QuoteCredits: null,
  });
});

test("a failed unlock check (byok null) keeps the plain presentation", () => {
  assert.deepEqual(deriveCreditsDisplay({ byok: null }), {
    byok: false,
    balanceLabel: "Balance",
    savedLabels: [],
    llmSaved: false,
    ownWorker: false,
    mp4QuoteCredits: null,
  });
});
