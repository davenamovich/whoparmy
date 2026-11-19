import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_COMPOSITION,
  BAND_COUNTS,
  FINAL_READ_BONUS_TOKENS,
  LIBRARY,
  OFFER_MILESTONES,
  PICKAPHONE_PHONE_COUNT,
  RARITY_TOKENS,
  assetById,
  bandForRarity,
  bandForTokens,
  boardTokens,
  drawBoard,
  gensForTokens,
  isBand,
  isSlot,
  offerAt,
  payoutForOfferTokens,
  payoutTokens,
  scoreFinalRead,
  sweatTokensValue,
} from "./pickaphone-logic.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const seededRand = (seed: number) => {
  const random = mulberry32(seed);
  return (n: number) => Math.floor(random() * n);
};

describe("PICK A PHONE library and board", () => {
  it("contains the published library and enough assets for every pool", () => {
    assert.equal(LIBRARY.length, 30);
    assert.equal(new Set(LIBRARY.map((asset) => asset.id)).size, LIBRARY.length);
    for (const asset of LIBRARY) {
      assert.ok(asset.file.length > 0);
      assert.ok(["COMMON", "RARE", "EPIC", "LEGENDARY"].includes(asset.rarity));
    }
    for (const [rarity, count] of Object.entries(BOARD_COMPOSITION)) {
      assert.ok(LIBRARY.filter((asset) => asset.rarity === rarity).length >= count);
    }
  });

  it("has a twelve-slot composition worth 550 tokens", () => {
    assert.equal(Object.values(BOARD_COMPOSITION).reduce((sum, count) => sum + count, 0), PICKAPHONE_PHONE_COUNT);
    const board = drawBoard(seededRand(1));
    assert.equal(boardTokens(board), 550);
    assert.equal(
      Object.entries(BOARD_COMPOSITION).reduce(
        (sum, [rarity, count]) => sum + count * RARITY_TOKENS[rarity as keyof typeof RARITY_TOKENS],
        0,
      ),
      550,
    );
  });

  it("draws distinct, correctly composed boards", () => {
    const boardOne = drawBoard(seededRand(1));
    const boardTwo = drawBoard(seededRand(2));
    assert.equal(boardOne.length, 12);
    assert.equal(new Set(boardOne).size, 12);
    assert.notDeepEqual(boardOne, boardTwo);
    for (const board of [boardOne, boardTwo]) {
      assert.ok(board.every((id) => assetById(id)));
      for (const [rarity, count] of Object.entries(BOARD_COMPOSITION)) {
        assert.equal(board.filter((id) => assetById(id)?.rarity === rarity).length, count);
      }
    }
  });
});

describe("PICK A PHONE offers and payouts", () => {
  it("finds the published offer milestones", () => {
    assert.deepEqual(offerAt(4), { index: 0, milestone: OFFER_MILESTONES[0] });
    assert.deepEqual(offerAt(8), { index: 1, milestone: OFFER_MILESTONES[1] });
    assert.deepEqual(offerAt(11), { index: 2, milestone: OFFER_MILESTONES[2] });
    assert.equal(offerAt(0), null);
    assert.equal(offerAt(5), null);
    assert.equal(offerAt(12), null);
  });

  it("pays the better of banked tokens and accepted offers", () => {
    assert.equal(payoutTokens(100, null), 100);
    assert.equal(payoutTokens(100, 5), 115);
    assert.equal(payoutTokens(300, 5), 300);
    assert.equal(payoutTokens(0, 2), 46);
  });

  it("converts tokens to generations at the default rate", () => {
    assert.equal(gensForTokens(550), 23);
    assert.equal(gensForTokens(25), 1);
    assert.equal(gensForTokens(22), 0);
    assert.equal(gensForTokens(0), 0);
  });
});

describe("PICK A PHONE slots", () => {
  it("accepts only phone slots 0 through 11", () => {
    assert.equal(isSlot(0), true);
    assert.equal(isSlot(11), true);
    assert.equal(isSlot(12), false);
    assert.equal(isSlot(-1), false);
    assert.equal(isSlot(1.5), false);
    assert.equal(isSlot("3"), false);
  });
});

describe("PICK A PHONE bands", () => {
  it("maps rarities and token values to LOW or HIGH", () => {
    assert.equal(bandForRarity("COMMON"), "LOW");
    assert.equal(bandForRarity("RARE"), "LOW");
    assert.equal(bandForRarity("EPIC"), "HIGH");
    assert.equal(bandForRarity("LEGENDARY"), "HIGH");
    assert.equal(bandForTokens(0), "LOW");
    assert.equal(bandForTokens(25), "LOW");
    assert.equal(bandForTokens(100), "HIGH");
    assert.equal(bandForTokens(250), "HIGH");
  });

  it("publishes band counts and validates bands", () => {
    assert.deepEqual(BAND_COUNTS, { LOW: 9, HIGH: 3 });
    assert.equal(isBand("LOW"), true);
    assert.equal(isBand("HIGH"), true);
    assert.equal(isBand("low"), false);
    assert.equal(isBand(""), false);
    assert.equal(isBand(null), false);
    assert.equal(isBand(1), false);
  });
});

describe("PICK A PHONE Host Sweat and token offers", () => {
  it("multiplies offer values at the default rate", () => {
    assert.equal(sweatTokensValue(2), 51);
    assert.equal(sweatTokensValue(5), 127);
    assert.equal(sweatTokensValue(9), 228);
  });

  it("pays the better of banked tokens and effective offer value", () => {
    assert.equal(payoutForOfferTokens(100, null), 100);
    assert.equal(payoutForOfferTokens(100, 127), 127);
    assert.equal(payoutForOfferTokens(300, 127), 300);
    assert.equal(payoutForOfferTokens(0, 51), 51);
  });
});

describe("PICK A PHONE Final Read", () => {
  it("scores the final phone band read", () => {
    assert.equal(FINAL_READ_BONUS_TOKENS, 50);
    assert.equal(scoreFinalRead("HIGH", 100), true);
    assert.equal(scoreFinalRead("HIGH", 250), true);
    assert.equal(scoreFinalRead("HIGH", 25), false);
    assert.equal(scoreFinalRead("HIGH", 0), false);
    assert.equal(scoreFinalRead("LOW", 0), true);
    assert.equal(scoreFinalRead("LOW", 25), true);
    assert.equal(scoreFinalRead("LOW", 100), false);
  });
});
