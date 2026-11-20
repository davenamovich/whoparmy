/**
 * btcgame-logic.ts — PURE "BTC or No BTC" game math. No DB, no I/O: the
 * public anonymous game can be tested independently of its session machine.
 * Mirrors pickaphone-logic.ts.
 *
 * The game currency is Points (Dave's Option A decision, 2026-11-19 — BTC
 * game ONLY; Pickaphone and the Token Vault keep Vault Tokens). Conversion
 * is a constant 100 Points = 1 free generation — deliberately NOT the
 * DOORS_CREDITS_PER_GEN env (that env is shared with Pickaphone and the BTC
 * game must not drift with it). Rewards pay out as free generations through
 * the existing claim bridge, never as engine credits and never as Bitcoin.
 * Internal field names (vt / bankedTokens / tokensPerGen) predate the rename
 * and are kept for API/DB compatibility; values are Points.
 *
 * Board: 26 cases = 22 Point tiles (5,710 Points total) + 4 AGENT BOOST
 * tiles (2 Rotator Placement, 2 Meme Campaign; point value 0, recorded on
 * the session as perks when revealed — fulfillment wiring is a follow-up).
 * The player's own case never pays Points: its reveal is the experiment
 * twist, which lives in the client copy, not in this math.
 */

export type BtcBoostKind = "rotator" | "meme";

export interface BtcTile {
  id: string;
  type: "vt" | "boost";
  /** Points this tile banks when revealed (0 for boosts). Field name kept. */
  vt: number;
  kind: BtcBoostKind | null;
}

function vtTile(vt: number, instance: number): BtcTile {
  return { id: `vt-${vt}-${instance}`, type: "vt", vt, kind: null };
}

function boostTile(kind: BtcBoostKind, instance: number): BtcTile {
  return { id: `boost-${kind}-${instance}`, type: "boost", vt: 0, kind };
}

/** The full published board composition: 22 Point tiles + 4 boosts = 26 cases. */
export const BOARD_TILES: readonly BtcTile[] = [
  vtTile(10, 1), vtTile(10, 2),
  vtTile(20, 1), vtTile(20, 2),
  vtTile(50, 1), vtTile(50, 2),
  vtTile(100, 1), vtTile(100, 2),
  vtTile(150, 1), vtTile(150, 2),
  vtTile(200, 1), vtTile(200, 2),
  vtTile(250, 1), vtTile(250, 2),
  vtTile(300, 1), vtTile(300, 2),
  vtTile(400, 1), vtTile(400, 2),
  vtTile(500, 1), vtTile(500, 2),
  vtTile(750, 1),
  vtTile(1000, 1),
  boostTile("rotator", 1), boostTile("rotator", 2),
  boostTile("meme", 1), boostTile("meme", 2),
];

export const BTCGAME_CASE_COUNT = 26;

export const BOARD_TOTAL_TOKENS = BOARD_TILES.reduce((sum, tile) => sum + tile.vt, 0);

const TILES_BY_ID = new Map(BOARD_TILES.map((tile) => [tile.id, tile]));

export const tileById = (id: string): BtcTile | undefined => TILES_BY_ID.get(id);

/** Display-safe board composition (no slot mapping) — published on the page. */
export function boardDisplay(): Array<{ type: "vt" | "boost"; vt: number; kind: BtcBoostKind | null }> {
  return BOARD_TILES.map((tile) => ({ type: tile.type, vt: tile.vt, kind: tile.kind }));
}

export interface BtcOfferMilestone {
  afterOpens: number;
  gens: number;
  perks: string[];
}

// Predetermined and transparent — the same table is published on the game
// page; offers are upgrades (banked tokens are never at risk; taking an offer
// pays max(banked, offer value). Milestones align with the client's rounds:
// 5 opens (round 1), +4 = 9 (round 2), +3 = 12 (round 3).
export const OFFER_MILESTONES: readonly BtcOfferMilestone[] = [
  { afterOpens: 5, gens: 2, perks: [] },
  { afterOpens: 9, gens: 5, perks: [] },
  { afterOpens: 12, gens: 9, perks: [] },
];

/** Option A conversion: 100 Points = 1 free generation. Constant by design. */
export const POINTS_PER_GEN = 100;

export function tokensPerGen(): number {
  return POINTS_PER_GEN;
}

export const gensForTokens = (tokens: number): number => Math.max(0, Math.floor(tokens / tokensPerGen()));

export function offerAt(opensCompleted: number): { index: number; milestone: BtcOfferMilestone } | null {
  const index = OFFER_MILESTONES.findIndex((milestone) => milestone.afterOpens === opensCompleted);
  return index === -1 ? null : { index, milestone: OFFER_MILESTONES[index]! };
}

export function payoutTokens(bankedTokens: number, acceptedOfferGens: number | null): number {
  return acceptedOfferGens === null ? bankedTokens : Math.max(bankedTokens, acceptedOfferGens * tokensPerGen());
}

/** Fisher-Yates shuffle of the full 26-tile board using the injected rand. */
export function drawBoard(rand: (n: number) => number): string[] {
  const drawn = BOARD_TILES.map((tile) => tile.id);
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [drawn[i], drawn[j]] = [drawn[j]!, drawn[i]!];
  }
  return drawn;
}

export function boardTokens(assignment: readonly string[]): number {
  return assignment.reduce((total, id) => {
    const tile = tileById(id);
    if (!tile) throw new Error("unknown tile");
    return total + tile.vt;
  }, 0);
}

export const isSlot = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < BTCGAME_CASE_COUNT;
