/**
 * Assessment: should we build an agent for this niche?
 *
 * A model gives subjective sub-scores; the arithmetic stays here, in code, the
 * same way the clip factory treats a critic's scores (a missing sub-score is a
 * 1, never an average of what was supplied). That split is the point: a model
 * can argue about demand, it cannot quietly round a 2.4 into a "build".
 *
 * The question being scored is narrow and commercial: can a personal agent with
 * memory pay for itself in this vertical, at our cost of production?
 */

export type CriterionKey =
  | "buyerBudget"
  | "sourceMaterial"
  | "distribution"
  | "costRatio"
  | "memoryMoat"
  | "rightsRisk";

export interface Criterion {
  key: CriterionKey;
  label: string;
  weight: number;
  /** What a 1 and a 5 mean, so two people score the same vertical alike. */
  low: string;
  high: string;
}

/**
 * Weights sum to 1. Distribution is weighted as heavily as budget on purpose:
 * a niche with money and no way to reach them is a slow death, and a niche with
 * reach and no money is a hobby.
 */
export const CRITERIA: Criterion[] = [
  {
    key: "buyerBudget",
    label: "The buyer already spends money",
    weight: 0.2,
    low: "Nobody in this niche has a content budget; they post by hand and complain.",
    high: "There is an existing line item — an editor, an agency, a VA, or ads.",
  },
  {
    key: "sourceMaterial",
    label: "Public material to work from",
    weight: 0.2,
    low: "Almost nothing public; every source is private or rights-encumbered.",
    high: "Abundant public footage/posts they are allowed to reference, with credit.",
  },
  {
    key: "distribution",
    label: "A channel that does not need ad spend",
    weight: 0.2,
    low: "Would need paid acquisition to reach anyone.",
    high: "An existing audience, community, directory, or search demand to stand in front of.",
  },
  {
    key: "costRatio",
    label: "Cost per delivered piece vs its price",
    weight: 0.15,
    low: "Production cost is a meaningful fraction of the price.",
    high: "Cost is a rounding error: cents against a price that is dollars or a retainer.",
  },
  {
    key: "memoryMoat",
    label: "Memory compounds",
    weight: 0.15,
    low: "Every job is identical; remembering anything adds nothing.",
    high: "Voice, clients, rejected work and history make the agent materially better each week.",
  },
  {
    key: "rightsRisk",
    label: "Rights and compliance are manageable",
    weight: 0.1,
    low: "Clips of others' footage without permission; regulated claims; high takedown risk.",
    high: "Owned material, or public material with a clear credit convention.",
  },
];

export interface Scores {
  buyerBudget?: number;
  sourceMaterial?: number;
  distribution?: number;
  costRatio?: number;
  memoryMoat?: number;
  rightsRisk?: number;
}

export interface AssessmentInput {
  vertical: string;
  buyer: string;
  scores: Scores;
  /** The model's one-line reason per criterion, kept for the audit trail. */
  reasons?: Partial<Record<CriterionKey, string>>;
}

export type Verdict = "build" | "test" | "pass";

export interface Assessment {
  vertical: string;
  total: number; // 1–5, weighted
  verdict: Verdict;
  breakdown: Array<{ key: CriterionKey; label: string; score: number; weight: number; contribution: number }>;
  killedBy: string[];
  reason: string;
}

/** A missing sub-score is a 1, not an average of what was supplied. */
export function normaliseScore(value: number | undefined): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

/**
 * Hard stops. These override the total, because they are the failures that
 * memory, design or effort cannot fix — and because a niche that clips other
 * people's footage without a credit convention is a takedown waiting to happen.
 */
export const KILL_RULES: Array<{ when: (s: Required<Scores>) => boolean; why: string }> = [
  {
    when: (s) => s.rightsRisk <= 2,
    why: "Rights risk is too high for what we do: every clip would be a liability, not an asset.",
  },
  {
    when: (s) => s.buyerBudget <= 1,
    why: "Nobody in this niche pays for content. It would be free work at scale.",
  },
  {
    when: (s) => s.distribution <= 1,
    why: "No channel without ad spend. The agent would produce into a void.",
  },
  {
    when: (s) => s.costRatio <= 1,
    why: "Production cost is not a rounding error here, so the agent cannot pay for itself.",
  },
];

export function assess(input: AssessmentInput): Assessment {
  const scores: Required<Scores> = {
    buyerBudget: normaliseScore(input.scores.buyerBudget),
    sourceMaterial: normaliseScore(input.scores.sourceMaterial),
    distribution: normaliseScore(input.scores.distribution),
    costRatio: normaliseScore(input.scores.costRatio),
    memoryMoat: normaliseScore(input.scores.memoryMoat),
    rightsRisk: normaliseScore(input.scores.rightsRisk),
  };

  const breakdown = CRITERIA.map((c) => {
    const score = scores[c.key];
    return { key: c.key, label: c.label, score, weight: c.weight, contribution: score * c.weight };
  });

  const total = Number(breakdown.reduce((sum, b) => sum + b.contribution, 0).toFixed(2));

  const killedBy = KILL_RULES.filter((rule) => rule.when(scores)).map((rule) => rule.why);

  let verdict: Verdict;
  let reason: string;

  if (killedBy.length > 0) {
    verdict = "pass";
    reason = killedBy[0];
  } else if (total >= 4) {
    verdict = "build";
    reason = `Scores ${total}/5 with no hard stop. Build a stack for this niche and give it one revenue loop.`;
  } else if (total >= 3) {
    verdict = "test";
    reason = `Scores ${total}/5 — worth a two-week test with one real buyer, not a build. If nobody pays in two weeks, stop.`;
  } else {
    verdict = "pass";
    reason = `Scores ${total}/5. The agent would cost more attention than the niche returns.`;
  }

  return { vertical: input.vertical, total, verdict, breakdown, killedBy, reason };
}

/** Compact line for a roster or a Telegram reply. */
export function summarise(a: Assessment): string {
  const worst = [...a.breakdown].sort((x, y) => x.score - y.score)[0];
  return `${a.verdict.toUpperCase()} ${a.total}/5 — ${a.vertical}. Weakest: ${worst.label} (${worst.score}).`;
}
