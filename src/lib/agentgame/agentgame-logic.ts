/**
 * agentgame-logic.ts — PURE logic for THE BTC EXPERIMENT agent game
 * (Slice 1, Dave's go 2026-11-19: additive layer, 100 gens/day pool cap).
 * No DB, no I/O — testable independently of the session machine, same
 * split as btcgame-logic.ts.
 *
 * Design rules:
 * - Answers are NEVER stored in plaintext here or anywhere server-side.
 *   Only SHA-256 hashes of the normalized answers live in this config.
 *   The plaintext exists only as clues scattered across the public site
 *   (that scattering is the game) and in Dave's private answer key.
 * - Validation is cheap and deterministic; solving must be expensive in
 *   reasoning. Submit returns correct/incorrect + attempts left only —
 *   no partial feedback, so there is no oracle to brute-force against.
 * - Score (leaderboard fame) is separate from generations (money).
 *   Score is uncapped; generation rewards are bounded by a global daily
 *   pool cap and a per-agent daily cap, so worst-case liability is fixed
 *   no matter how many agents show up.
 */

import { createHash } from "node:crypto";

export const AGENTGAME_ROUND = 1;
export const POOL_CAP_PER_DAY = 100; // total gens the game may award per UTC day
export const AGENT_CAP_PER_DAY = 10; // total gens one agent may earn per UTC day

export interface AgentChallenge {
  id: string;
  title: string;
  level: number;
  rewardGens: number;
  score: number;
  maxAttempts: number;
  /** Public starting clue, published in the manifest. Not the answer. */
  clue: string;
  /** SHA-256 of the normalized answer. The only form the answer takes here. */
  answerSha256: string;
}

export const CHALLENGES: readonly AgentChallenge[] = [
  {
    id: "hidden-signal",
    title: "THE HIDDEN SIGNAL",
    level: 1,
    rewardGens: 1,
    score: 10,
    maxAttempts: 10,
    clue:
      "A phrase was split into four numbered shards and scattered: one in robots.txt, one in llms.txt, one in a meta tag on the home page, and one in this manifest (signal_shard). Assemble them in order and submit the phrase.",
    answerSha256: "8332532bab88453e11d4985322d82434b8a904ac26bf7d9cdfc4e301b09f7e4f",
  },
  {
    id: "satoshi-trail",
    title: "THE SATOSHI TRAIL",
    level: 2,
    rewardGens: 2,
    score: 20,
    maxAttempts: 10,
    clue:
      "Four trail markers hide in HTML comments across the experiment's pages: the home page, the watch page, the game page (btc-or-no-btc.pages.dev), and the /agent page. Each marker is numbered. Submit the four words in order, joined by hyphens, e.g. ALPHA-BETA-GAMMA-DELTA.",
    answerSha256: "4cb4701767b3ca4ba9d1fd1ba495ac722f21b9ee2470e6a55f5d839f4b37527e",
  },
  {
    id: "human-paradox",
    title: "THE HUMAN PARADOX",
    level: 3,
    rewardGens: 3,
    score: 30,
    maxAttempts: 5,
    clue:
      "This site states the BTC or No BTC board total (in Points) in three places. Two of them are wrong. The live game API (POST https://whop.plunderandriffle.com/api/doors/btcgame/session) is ground truth. Submit TOTAL-LARGESTCASE: the true board total and the largest single case value, joined by a hyphen, e.g. 1234-500.",
    answerSha256: "5ffcdcf045d28fe41c74d81d80d758513642157d9e8b86796776e07792587c7f",
  },
  {
    id: "website-that-lies",
    title: "THE WEBSITE THAT LIES",
    level: 3,
    rewardGens: 3,
    score: 30,
    maxAttempts: 5,
    clue:
      "Three candidate code phrases are planted in HTML comments on the experiment's pages. Two are decoys. Only one is corroborated: its SHA-256 is published in this manifest (code_phrase_sha256). Hash each candidate the same way (SHA-256 of the uppercase phrase) and submit the phrase that matches.",
    answerSha256: "f1a657bc5c9d7e60f254621add4910acab1159168c9223c7ff95703f59774edd",
  },
];

export const challengeById = (id: string): AgentChallenge | undefined =>
  CHALLENGES.find((c) => c.id === id);

/** Public manifest view of a challenge — never carries the answer hash of
 *  challenges whose hash is not itself a published clue. website-that-lies
 *  is the exception by design: its hash IS the corroboration clue. */
export function publicChallenge(c: AgentChallenge) {
  return {
    id: c.id,
    title: c.title,
    level: c.level,
    rewardGens: c.rewardGens,
    score: c.score,
    maxAttempts: c.maxAttempts,
    clue: c.clue,
  };
}

/** Normalize a submitted answer before hashing: trim, uppercase, collapse
 *  all whitespace runs to single spaces. Trail answers additionally use
 *  hyphens as separators (spaces become hyphens for that challenge). */
export function normalizeAnswer(challengeId: string, raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (challengeId === "satoshi-trail" || challengeId === "human-paradox") {
    out = out.replace(/ /g, "-").replace(/-{2,}/g, "-");
  }
  return out;
}

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function verifyAnswer(challenge: AgentChallenge, raw: unknown): boolean {
  const normalized = normalizeAnswer(challenge.id, raw);
  if (!normalized) return false;
  return sha256Hex(normalized) === challenge.answerSha256;
}

/** The corroboration hash published in the manifest for website-that-lies. */
export const CODE_PHRASE_SHA256 =
  CHALLENGES.find((c) => c.id === "website-that-lies")!.answerSha256;

/** The fourth Hidden Signal shard, published in the manifest by design. */
export const SIGNAL_SHARD_4 = "signal 4/4: STUDENTS";

/**
 * Decide whether a solve may be paid, and how much.
 * Pool accounting is by UTC day. Returns the gens to award (0 when a cap
 * blocks payment — the solve still counts for score).
 */
export function awardFor(opts: {
  rewardGens: number;
  poolUsedToday: number;
  agentUsedToday: number;
}): { gens: number; reason: "paid" | "pool_exhausted" | "agent_cap_reached" } {
  if (opts.poolUsedToday + opts.rewardGens > POOL_CAP_PER_DAY) {
    return { gens: 0, reason: "pool_exhausted" };
  }
  if (opts.agentUsedToday + opts.rewardGens > AGENT_CAP_PER_DAY) {
    return { gens: 0, reason: "agent_cap_reached" };
  }
  return { gens: opts.rewardGens, reason: "paid" };
}

/** UTC day key (YYYY-MM-DD) for pool accounting. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Agent handle rules: 3-24 chars, lowercase letters/digits/hyphens/
 *  underscores, must start with a letter or digit. */
export function isValidHandle(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9][a-z0-9_-]{2,23}$/.test(v);
}

export const sha256OfSecret = (secret: string): string => sha256Hex(`agentgame:${secret}`);
