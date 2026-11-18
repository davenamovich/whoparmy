/**
 * Retail clip packs — the prepaid lane.
 *
 * These are NOT a markup on a BYOK call. BYOK is one cent a call on the
 * member's own key, their own infra, after ten minutes of saving API keys.
 * A pack sells the thing that replaces that work: no keys, no rate limits,
 * no uptime, and nothing to rotate. The anchor is a freelance edit
 * ($15–40 a clip), not engine time.
 *
 * Prices live here and nowhere else, so changing one is a one-line change.
 * `packs.test.ts` refuses to let a pack fall under MIN_GROSS_MARGIN even at
 * the game's maximum bonus — a price that only works if nobody wins the
 * trade-up is not a price, it is a hope.
 */

/**
 * What a clip actually costs: the render, as Agent37 charges for it
 * (Dave, 2026-11-18: "llm calls are near free and the cost to render is what
 * agent37 charges").
 *
 * LLM text is explicitly zero here, not "small" — modelling it twice is how a
 * price gets defended against a cost that does not exist.
 *
 * 25 is NOT a cost either: it is the number of LIST credits a call consumes,
 * i.e. the price the engine charges, kept only to compare retail with the BYOK
 * lane. Treating it as COGS overstated clip cost 25x.
 */
export const AGENT37_RENDER_COST_USD = 0.005;

/** Text generation. Near-free, and counted once — here, at zero. */
export const LLM_TEXT_COST_USD = 0;

/** The list-credit price of one clip — a comparison figure, never a cost. */
export const LIST_CREDITS_PER_CLIP = 25;
export const CREDIT_LIST_PRICE_USD = 0.01; // BYOK: 1 credit per engine call

/** Real COGS per delivered clip. */
export const CLIP_COGS_USD = AGENT37_RENDER_COST_USD + LLM_TEXT_COST_USD;

/**
 * The only thing that can wreck this model: turns.
 *
 * Agent37 charges for the compute a run uses, so a worker that loops, retries
 * blindly or re-sends its whole context per step multiplies the render charge
 * — the same failure that burned 800K tokens in one morning. The worker is
 * therefore budgeted to a single pass per clip: claim, one create_sitdown, poll
 * with backoff, report, exit. Over budget is a bug, not a tuning knob.
 */
export const MAX_TURNS_PER_CLIP = 3;

export interface ClipPack {
  key: string;
  name: string;
  clips: number;
  priceUsd: number;
  /** Rounds of the Box Trade this pack opens. */
  rounds: number;
  blurb: string;
}

export const CLIP_PACKS: ClipPack[] = [
  {
    key: "starter",
    name: "10 clips",
    clips: 10,
    priceUsd: 9,
    rounds: 2,
    blurb: "A week of posting, to see whether it holds up.",
  },
  {
    key: "page",
    name: "30 clips",
    clips: 30,
    priceUsd: 19,
    rounds: 3,
    blurb: "One a day for a month.",
  },
  {
    key: "studio",
    name: "100 clips",
    clips: 100,
    priceUsd: 49,
    rounds: 4,
    blurb: "Two pages, most days.",
  },
];

/** Free credits at signup: enough for one finished clip, not a page. */
export const FREE_GRANT_CLIPS = 3;

/** Below this, a pack is not worth selling — it is a subsidy. */
export const MIN_GROSS_MARGIN = 0.9;

/**
 * Must equal MAX_BONUS_RATIO in game.ts.
 *
 * Not imported: Next compiles extensionless imports, Node (which runs the
 * tests) needs an extension, and a .ts extension breaks the build. So the
 * value is asserted equal by packs.test.ts instead of shared by an import —
 * a duplicate the suite keeps honest.
 */
export const MAX_BONUS_RATIO = 0.5;

export function packByKey(key: string): ClipPack | null {
  return CLIP_PACKS.find((p) => p.key === key) ?? null;
}

/** Gross margin at a given extra-clip ratio (0 = no bonus taken). */
export function grossMargin(pack: ClipPack, bonusRatio = 0): number {
  const delivered = pack.clips * (1 + bonusRatio);
  const cogs = delivered * CLIP_COGS_USD;
  return (pack.priceUsd - cogs) / pack.priceUsd;
}

export function marginAtMaxBonus(pack: ClipPack): number {
  return grossMargin(pack, MAX_BONUS_RATIO);
}

export function pricePerClip(pack: ClipPack): number {
  return pack.priceUsd / pack.clips;
}

/**
 * Retail per clip against what the same clip costs on a BYOK key. Useful
 * internally when setting a price; never shown to the member as a computed
 * comparison (see laneCopy).
 */
export function timesListPrice(pack: ClipPack): number {
  return pricePerClip(pack) / (LIST_CREDITS_PER_CLIP * CREDIT_LIST_PRICE_USD);
}

/** The line the member sees. Both lanes, one sentence each, no sums done for them. */
export function laneCopy(): string {
  return [
    "Prepaid clips: no keys, no setup — you approve each clip before it exports.",
    "Your own P&R key: one cent a call on your own infrastructure, after you save an API key.",
  ].join(" ");
}
