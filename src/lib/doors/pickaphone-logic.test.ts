import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_COMPOSITION,
  LIBRARY,
  OFFER_MILESTONES,
  PICKAPHONE_PHONE_COUNT,
  RARITY_TOKENS,
  assetById,
  boardTokens,
  drawBoard,
  gensForTokens,
  isSlot,
  offerAt,
  payoutTokens,
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
