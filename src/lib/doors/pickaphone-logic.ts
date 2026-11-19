/**
 * pickaphone-logic.ts — PURE PICK A PHONE game math. No DB, no I/O: the
 * public anonymous game can be tested independently of its session machine.
 *
 * The game currency is Vault Tokens (Dave locked 2026-11-18). Conversion is
 * 23 tokens = 1 free generation, mirroring the Doors credits rate
 * (DOORS_CREDITS_PER_GEN env override, default 23 — same semantics as
 * creditsPerGen in ./logic.ts: Number(env), finite && > 0 ? floor : 23).
 * Rewards pay out as free generations through the existing claim bridge,
 * never as engine credits.
 */

export type PickaphoneRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export interface PickaphoneAsset {
  id: string;
  file: string;
  type: "image" | "video";
  caption: string;
  category: string;
  rarity: PickaphoneRarity;
}

export const PICKAPHONE_PHONE_COUNT = 12;

export const RARITY_TOKENS: Record<PickaphoneRarity, number> = {
  COMMON: 0,
  RARE: 25,
  EPIC: 100,
  LEGENDARY: 250,
};

export const BOARD_COMPOSITION: Record<PickaphoneRarity, number> = {
  COMMON: 5,
  RARE: 4,
  EPIC: 2,
  LEGENDARY: 1,
};

export const LIBRARY: readonly PickaphoneAsset[] = [
  { id: "doors-m01", file: "assets/memes/m01.png", type: "image", caption: "Morning emergency", category: "doors", rarity: "COMMON" },
  { id: "doors-m02", file: "assets/memes/m02.png", type: "image", caption: "Wallet upgrade", category: "doors", rarity: "COMMON" },
  { id: "doors-m03", file: "assets/memes/m03.png", type: "image", caption: "Keys were never the problem", category: "doors", rarity: "COMMON" },
  { id: "doors-m04", file: "assets/memes/m04.png", type: "image", caption: "Kept on file", category: "doors", rarity: "COMMON" },
  { id: "doors-m05", file: "assets/memes/m05.png", type: "image", caption: "Cat battle, round one", category: "doors", rarity: "COMMON" },
  { id: "doors-m06", file: "assets/memes/m06.png", type: "image", caption: "Cat battle, round two", category: "doors", rarity: "COMMON" },
  { id: "doors-m07", file: "assets/memes/m07.png", type: "image", caption: "Dog battle, round one", category: "doors", rarity: "COMMON" },
  { id: "doors-m08", file: "assets/memes/m08.png", type: "image", caption: "Dog battle, round two", category: "doors", rarity: "RARE" },
  { id: "doors-m09", file: "assets/memes/m09.png", type: "image", caption: "Tokyo edition", category: "doors", rarity: "RARE" },
  { id: "doors-m10", file: "assets/memes/m10.png", type: "image", caption: "From the pack", category: "doors", rarity: "RARE" },
  { id: "doors-m11", file: "assets/memes/m11.png", type: "image", caption: "From the pack, again", category: "doors", rarity: "RARE" },
  { id: "doors-m12", file: "assets/memes/m12.png", type: "image", caption: "The invite", category: "doors", rarity: "EPIC" },
  { id: "mz-cleanskin", file: "assets/library/mz-cleanskin.png", type: "image", caption: "The cleanskin chronicles", category: "product", rarity: "COMMON" },
  { id: "mz-earpods", file: "assets/library/mz-earpods.png", type: "image", caption: "Earpods: a tragedy in one act", category: "product", rarity: "COMMON" },
  { id: "mz-eos", file: "assets/library/mz-eos.png", type: "image", caption: "Lip service", category: "product", rarity: "COMMON" },
  { id: "mz-medicube", file: "assets/library/mz-medicube.png", type: "image", caption: "The medicube glow-up", category: "product", rarity: "COMMON" },
  { id: "mz-mighty-patch", file: "assets/library/mz-mighty-patch.png", type: "image", caption: "Patch day", category: "product", rarity: "RARE" },
  { id: "pr-s1", file: "assets/library/pr-s1.png", type: "image", caption: "From the P&R slate", category: "slate", rarity: "RARE" },
  { id: "pr-s5", file: "assets/library/pr-s5.png", type: "image", caption: "From the P&R slate", category: "slate", rarity: "RARE" },
  { id: "pr-w2", file: "assets/library/pr-w2.png", type: "image", caption: "From the P&R slate", category: "slate", rarity: "RARE" },
  { id: "mz-eos-video", file: "assets/library/mz-eos.mp4", type: "video", caption: "Lip service, the motion picture", category: "product", rarity: "EPIC" },
  { id: "mz-earpods-video", file: "assets/library/mz-earpods.mp4", type: "video", caption: "Earpods: the motion picture", category: "product", rarity: "EPIC" },
  { id: "mz-cleantowels-video", file: "assets/library/mz-cleantowels.mp4", type: "video", caption: "The towel saga", category: "product", rarity: "LEGENDARY" },
  { id: "joe-slot5", file: "assets/library/joe-slot5.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "RARE" },
  { id: "joe-slot2", file: "assets/library/joe-slot2.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "EPIC" },
  { id: "joe-slot8", file: "assets/library/joe-slot8.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "EPIC" },
  { id: "joe-slot12", file: "assets/library/joe-slot12.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "EPIC" },
  { id: "joe-slot15", file: "assets/library/joe-slot15.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "EPIC" },
  { id: "joe-slot13", file: "assets/library/joe-slot13.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "LEGENDARY" },
  { id: "joe-slot14", file: "assets/library/joe-slot14.mp4", type: "video", caption: "Joe, on the job", category: "joe", rarity: "LEGENDARY" },
];

const ASSETS_BY_ID = new Map(LIBRARY.map((asset) => [asset.id, asset]));

export const assetById = (id: string): PickaphoneAsset | undefined => ASSETS_BY_ID.get(id);

export interface OfferMilestone {
  afterReveals: number;
  gens: number;
  perks: string[];
}

// Predetermined and transparent — the same table is published on the game
// page; offers are upgrades (banked tokens are never at risk; taking an offer
// pays max(banked, offer value).
export const OFFER_MILESTONES: readonly OfferMilestone[] = [
  { afterReveals: 4, gens: 2, perks: [] },
  { afterReveals: 8, gens: 5, perks: ["scout_audit"] },
  { afterReveals: 11, gens: 9, perks: ["scout_audit", "architect_blueprint"] },
];

export function tokensPerGen(): number {
  const value = Number(process.env.DOORS_CREDITS_PER_GEN);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 23;
}

export const gensForTokens = (tokens: number): number => Math.max(0, Math.floor(tokens / tokensPerGen()));

export function offerAt(revealsCompleted: number): { index: number; milestone: OfferMilestone } | null {
  const index = OFFER_MILESTONES.findIndex((milestone) => milestone.afterReveals === revealsCompleted);
  return index === -1 ? null : { index, milestone: OFFER_MILESTONES[index]! };
}

export function payoutTokens(bankedTokens: number, acceptedOfferGens: number | null): number {
  return acceptedOfferGens === null ? bankedTokens : Math.max(bankedTokens, acceptedOfferGens * tokensPerGen());
}

export function drawBoard(rand: (n: number) => number): string[] {
  const drawn: string[] = [];
  for (const rarity of ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const) {
    const pool = LIBRARY.filter((asset) => asset.rarity === rarity).map((asset) => asset.id);
    for (let count = 0; count < BOARD_COMPOSITION[rarity]; count++) {
      const index = rand(pool.length);
      drawn.push(pool.splice(index, 1)[0]!);
    }
  }
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [drawn[i], drawn[j]] = [drawn[j]!, drawn[i]!];
  }
  return drawn;
}

export function boardTokens(assignment: readonly string[]): number {
  return assignment.reduce((total, id) => {
    const asset = assetById(id);
    if (!asset) throw new Error("unknown asset");
    return total + RARITY_TOKENS[asset.rarity];
  }, 0);
}

export const isSlot = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < PICKAPHONE_PHONE_COUNT;
