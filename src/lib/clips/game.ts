/**
 * The Box Trade: a deal on clips where nothing can be lost.
 *
 * A member buys a pack — that count is their floor, permanently. Each round
 * reveals two upsides and they take one: extra clips, or a brief card that
 * changes the direction Muse gets. Declining is always safe, and the
 * session can never resolve below the floor.
 *
 * Three rules the code enforces, because a promotion that can be re-rolled
 * or quietly short-changed is not a promotion, it is a trick:
 *
 *   1. THE FLOOR IS ABSOLUTE. resolve() is `max(floor, floor + bonus)` by
 *      construction, and a test walks 500 seeds to prove it.
 *   2. NO RE-ROLLING. Offers are derived from a stored seed + round. Reload
 *      the page, restart the app, same offer. The only way to see another
 *      round is to accept or decline this one.
 *   3. NOTHING IS WITHHELD. Both upsides are shown before the choice. The
 *      tension is which one, never whether there is one.
 *
 * What a member actually receives: clips, and the brief that goes into the
 * Muse prompt when they queue that batch. No cash value, no odds claims, no
 * "you could win" copy.
 */

export type UpsideKind = "bonus_clips" | "brief";

export interface BriefCard {
  /** The angle the batch runs on. */
  angle: string;
  /** How the first second opens. */
  hookFrame: string;
  /** What to build — the format line that reaches Muse. */
  format: string;
  /** Why this frame works, in one dry line. Never a performance claim. */
  why: string;
}

export interface Upside {
  kind: UpsideKind;
  /** Clips added when kind is bonus_clips. */
  amount?: number;
  brief?: BriefCard;
  label: string;
}

export interface Round {
  round: number;
  options: [Upside, Upside];
}

export interface GameState {
  floor: number;
  bonus: number;
  briefs: BriefCard[];
  round: number;
  chosen: number[];
  seed: number;
  maxRounds: number;
}

export interface Resolution {
  clips: number;
  briefs: BriefCard[];
  extraClips: number;
  note: string;
}

const BRIEFS: BriefCard[] = [
  {
    angle: "then vs now",
    hookFrame: "One second of the old thing, then cut to the new one.",
    format: "Side-by-side opening, payoff on the second cut.",
    why: "A comparison needs no explanation and reads silently.",
  },
  {
    angle: "the timeline",
    hookFrame: "A date on screen. Nothing else.",
    format: "Date card, then the clip's own first line.",
    why: "A date sets stakes before anyone speaks.",
  },
  {
    angle: "countdown",
    hookFrame: "A number counting down in the corner from the first frame.",
    format: "Corner counter, trim to the payoff.",
    why: "A visible count keeps people past the first second.",
  },
  {
    angle: "the mistake",
    hookFrame: "Name the mistake in three words, in past tense.",
    format: "Mistake line, then the clip.",
    why: "A named mistake is specific; specifics read as true.",
  },
  {
    angle: "nobody noticed",
    hookFrame: "State that it went unnoticed, then show it.",
    format: "Hook line over the clip's own audio.",
    why: "Understatement beats a promise.",
  },
  {
    angle: "the receipt",
    hookFrame: "Show the source on screen for the first half second.",
    format: "Source label, then the clip, then the credit.",
    why: "Showing the receipt answers the first objection.",
  },
  {
    angle: "one question",
    hookFrame: "Ask the clip's own question before it is asked.",
    format: "Question line, clip, credit.",
    why: "A question opens a loop the clip closes.",
  },
  {
    angle: "the small detail",
    hookFrame: "Point at one detail in the frame, nothing more.",
    format: "Detail callout, clip at normal speed.",
    why: "A single detail rewards the second watch.",
  },
  {
    angle: "cut at the sigh",
    hookFrame: "Open mid-reaction, one frame before the words.",
    format: "Cold open on the reaction, clip from there.",
    why: "Opening on a reaction skips the wind-up.",
  },
  {
    angle: "the price of it",
    hookFrame: "A number in currency, nothing else.",
    format: "Number card, clip, credit.",
    why: "A number is the fastest thing to read while scrolling.",
  },
];

/** Deterministic PRNG — same seed, same offers, forever. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A session seed that a client cannot choose: member, page and day. */
export function sessionSeed(userId: string, pageId: string, now: Date = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  const text = `${userId}|${pageId}|${day}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bonusFor(roll: number, floor: number): number {
  // Upside only, and small: a trade adds a tenth to a half of the pack.
  const step = Math.max(1, Math.round(floor * 0.1));
  if (roll < 0.45) return step;
  if (roll < 0.8) return step * 2;
  return step * 3;
}

function pickBrief(roll: number, taken: BriefCard[]): BriefCard {
  const pool = BRIEFS.filter((b) => !taken.some((t) => t.angle === b.angle));
  const list = pool.length > 0 ? pool : BRIEFS;
  return list[Math.floor(roll * list.length) % list.length];
}

/**
 * The two upsides for a round, derived from the session seed. Pure and
 * stable: the same (seed, round, floor, briefs taken) always yields the
 * same pair, so a reload cannot fish for a better board.
 */
export function roundFor(state: Pick<GameState, "seed" | "round" | "floor" | "briefs">): Round {
  const rand = mulberry32(state.seed + state.round * 7919);
  const a = rand();
  const b = rand();

  const bonus: Upside = {
    kind: "bonus_clips",
    amount: bonusFor(a, state.floor),
    label: "",
  };
  bonus.label = `${bonus.amount} extra clip${bonus.amount === 1 ? "" : "s"}`;

  const brief = pickBrief(b, state.briefs);
  const briefUpside: Upside = {
    kind: "brief",
    brief,
    label: `A brief: ${brief.angle}`,
  };

  // Alternate which side the clips sit on, so the left box is not
  // always the same prize.
  const clipsFirst = state.round % 2 === 0;
  return {
    round: state.round,
    options: clipsFirst ? [bonus, briefUpside] : [briefUpside, bonus],
  };
}

export function startSession(input: {
  floor: number;
  seed: number;
  maxRounds?: number;
}): GameState {
  const floor = Math.max(0, Math.trunc(input.floor));
  return {
    floor,
    bonus: 0,
    briefs: [],
    round: 0,
    chosen: [],
    seed: input.seed >>> 0,
    maxRounds: input.maxRounds ?? 3,
  };
}

/** Take one of the two upsides and move to the next round. */
export function takeUpside(state: GameState, index: 0 | 1): GameState {
  if (state.round >= state.maxRounds) return state;
  const round = roundFor(state);
  const upside = round.options[index];
  if (!upside) return state;

  const bonus = upside.kind === "bonus_clips" ? state.bonus + (upside.amount ?? 0) : state.bonus;
  const briefs =
    upside.kind === "brief" && upside.brief ? [...state.briefs, upside.brief] : state.briefs;

  return {
    ...state,
    bonus,
    briefs,
    round: state.round + 1,
    chosen: [...state.chosen, index],
  };
}

/** Decline: nothing added, nothing removed, next round. */
export function declineRound(state: GameState): GameState {
  if (state.round >= state.maxRounds) return state;
  return { ...state, round: state.round + 1, chosen: [...state.chosen, -1] };
}

/**
 * What the member ends with. The floor is applied here as well as by
 * construction, because this is the number a person sees.
 */
export function resolve(state: GameState): Resolution {
  const extraClips = Math.max(0, state.bonus);
  const clips = Math.max(state.floor, state.floor + extraClips);
  const notes: string[] = [`${clips} clips — your pack was ${state.floor}, and the floor stands.`];
  if (extraClips > 0) notes.push(`${extraClips} came from trades.`);
  if (state.briefs.length > 0) {
    notes.push(
      `${state.briefs.length} brief${state.briefs.length === 1 ? "" : "s"} attached — these reach Muse when you queue the batch.`,
    );
  }
  return { clips, briefs: state.briefs, extraClips, note: notes.join(" ") };
}

/** The line that turns a brief into the prompt Muse receives. */
export function briefToPrompt(brief: BriefCard, pageNiche: string): string {
  return [
    `Angle: ${brief.angle}`,
    `Open on: ${brief.hookFrame}`,
    `Build: ${brief.format}`,
    `Page niche: ${pageNiche}`,
    "Keep the creator credit on its own line. Nothing is posted without the member's approval.",
  ].join("\n");
}

export const BRIEF_LIBRARY = BRIEFS;
