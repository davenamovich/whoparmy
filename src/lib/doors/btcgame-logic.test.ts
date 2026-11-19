import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_TILES,
  BOARD_TOTAL_TOKENS,
  BTCGAME_CASE_COUNT,
  OFFER_MILESTONES,
  boardDisplay,
  boardTokens,
  drawBoard,
  gensForTokens,
  isSlot,
  offerAt,
  payoutTokens,
  tileById,
} from "./btcgame-logic.ts";

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

describe("BTC or No BTC board", () => {
  it("has 26 tiles: 22 VT tiles worth 1,444 VT plus 4 AGENT BOOST tiles", () => {
    assert.equal(BOARD_TILES.length, BTCGAME_CASE_COUNT);
    assert.equal(BTCGAME_CASE_COUNT, 26);
    assert.equal(new Set(BOARD_TILES.map((tile) => tile.id)).size, BOARD_TILES.length);
    const vtTiles = BOARD_TILES.filter((tile) => tile.type === "vt");
    const boosts = BOARD_TILES.filter((tile) => tile.type === "boost");
    assert.equal(vtTiles.length, 22);
    assert.equal(boosts.length, 4);
    assert.equal(boosts.filter((tile) => tile.kind === "rotator").length, 2);
    assert.equal(boosts.filter((tile) => tile.kind === "meme").length, 2);
    assert.ok(boosts.every((tile) => tile.vt === 0));
    assert.equal(BOARD_TOTAL_TOKENS, 1444);
    assert.equal(vtTiles.reduce((sum, tile) => sum + tile.vt, 0), 1444);
    const denominations = vtTiles.map((tile) => tile.vt).sort((a, b) => a - b);
    assert.deepEqual(denominations, [1, 1, 1, 1, 5, 5, 5, 5, 10, 10, 25, 25, 50, 50, 75, 75, 100, 100, 150, 200, 250, 300]);
  });

  it("draws distinct full boards that always total 1,444 VT", () => {
    const boardOne = drawBoard(seededRand(1));
    const boardTwo = drawBoard(seededRand(2));
    assert.equal(boardOne.length, 26);
    assert.equal(new Set(boardOne).size, 26);
    assert.notDeepEqual(boardOne, boardTwo);
    for (const board of [boardOne, boardTwo]) {
      assert.ok(board.every((id) => tileById(id)));
      assert.equal(boardTokens(board), 1444);
      assert.equal(board.filter((id) => tileById(id)?.type === "boost").length, 4);
    }
  });

  it("exposes a display board with no slot information", () => {
    const display = boardDisplay();
    assert.equal(display.length, 26);
    assert.equal(display.reduce((sum, tile) => sum + tile.vt, 0), 1444);
    assert.ok(display.every((tile) => !("id" in tile)));
  });
});

describe("BTC or No BTC offers and payouts", () => {
  it("finds the published offer milestones at 5, 9 and 12 opens", () => {
    assert.deepEqual(offerAt(5), { index: 0, milestone: OFFER_MILESTONES[0] });
    assert.deepEqual(offerAt(9), { index: 1, milestone: OFFER_MILESTONES[1] });
    assert.deepEqual(offerAt(12), { index: 2, milestone: OFFER_MILESTONES[2] });
    assert.equal(OFFER_MILESTONES[0]!.gens, 2);
    assert.equal(OFFER_MILESTONES[1]!.gens, 5);
    assert.equal(OFFER_MILESTONES[2]!.gens, 9);
    assert.equal(offerAt(0), null);
    assert.equal(offerAt(4), null);
    assert.equal(offerAt(6), null);
    assert.equal(offerAt(26), null);
  });

  it("pays the better of banked tokens and accepted offers", () => {
    assert.equal(payoutTokens(100, null), 100);
    assert.equal(payoutTokens(100, 5), 115);
    assert.equal(payoutTokens(300, 5), 300);
    assert.equal(payoutTokens(0, 2), 46);
    assert.equal(payoutTokens(0, 9), 207);
  });

  it("converts tokens to generations at the default rate", () => {
    assert.equal(gensForTokens(1444), 62);
    assert.equal(gensForTokens(25), 1);
    assert.equal(gensForTokens(22), 0);
    assert.equal(gensForTokens(0), 0);
  });
});

describe("BTC or No BTC slots", () => {
  it("accepts only case slots 0 through 25", () => {
    assert.equal(isSlot(0), true);
    assert.equal(isSlot(25), true);
    assert.equal(isSlot(26), false);
    assert.equal(isSlot(-1), false);
    assert.equal(isSlot(1.5), false);
    assert.equal(isSlot("3"), false);
  });
});
