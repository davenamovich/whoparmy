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
/**
 * Agent37 bills compute PER CLIP — a flat charge for the render, not a rate
 * multiplied by how long it took (Dave, 2026-11-18). So a 6-second clip and a
 * 30-second clip cost the same to produce, and COGS per delivered clip is one
 * number.
 */
export const AGENT37_PER_CLIP_COST_USD = 0.005;

/**
 * Not a cost input, a reliability limit: a render that runs past this is a
 * stuck job, and it is failed and refunded rather than left to hold a worker.
 */
export const MAX_RENDER_SECONDS_PER_CLIP = 120;

/** Text generation. Near-free, and counted once — here, at zero. */
export const LLM_TEXT_COST_USD = 0;

/** The list-credit price of one clip — a comparison figure, never a cost. */
export const LIST_CREDITS_PER_CLIP = 25;
export const CREDIT_LIST_PRICE_USD = 0.01; // BYOK: 1 credit per engine call

/** Real COGS per delivered clip. */
export const CLIP_COGS_USD = AGENT37_PER_CLIP_COST_USD + LLM_TEXT_COST_USD;

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

/**
 * TOP-UPS, not the price of clips.
 *
 * Clips are included in the subscription (plans.ts `monthlyClips`): a Starter
 * member already pays $29 and gets 20 clips, so charging $29 for ten more was
 * selling the same thing twice. Packs exist for two cases only — someone who
 * is not on a plan yet, and someone who has run past their month and does not
 * want to upgrade.
 *
 * So they are priced as convenience, not as the product: under a dollar-three
 * a clip, comfortably under any freelance edit, and cheap enough that nobody
 * has to think about it. Nothing here is marked down; the trade-up is the only
 * way to get more for the same money, and it is earned.
 */
export const CLIP_PACKS: ClipPack[] = [
  {
    key: "starter",
    name: "10 clips",
    clips: 10,
    priceUsd: 12,
    rounds: 2,
    blurb: "A top-up for a week of posting.",
  },
  {
    key: "page",
    name: "30 clips",
    clips: 30,
    priceUsd: 29,
    rounds: 3,
    blurb: "A month on one page, past the plan's allowance.",
  },
  {
    key: "studio",
    name: "100 clips",
    clips: 100,
    priceUsd: 79,
    rounds: 4,
    blurb: "When two pages run every day.",
  },
];

/** Free credits at signup: enough for one finished clip, not a page. */
export const FREE_GRANT_CLIPS = 3;

/** Below this, a pack is not worth selling — it is a subsidy. */
export const MIN_GROSS_MARGIN = 0.9;

/**
 * A floor on price per clip, so a future "let's discount it" cannot quietly
 * turn a product into a commodity. Cost is $0.005; this floor is about
 * positioning, not margin.
 */
export const MIN_PRICE_PER_CLIP_USD = 0.75;

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
export function grossMargin(pack: ClipPack, bonusRatio = 0, perClipCost = CLIP_COGS_USD): number {
  const delivered = pack.clips * (1 + bonusRatio);
  const cogs = delivered * perClipCost;
  return (pack.priceUsd - cogs) / pack.priceUsd;
}

/**
 * Margin if every bonus in the pack is taken. Kept as a named case because it
 * is the one that actually moves: with a flat per-clip charge there is no
 * render-length exposure left to model.
 */
export function marginAtWorstCase(pack: ClipPack): number {
  return grossMargin(pack, MAX_BONUS_RATIO, CLIP_COGS_USD);
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
