/**
 * The brief — what we actually sell.
 *
 * Clips are the demo. The thing a member takes away is a standing instruction
 * for their own agent: an angle, a frame, a format, a length, a credit policy
 * and the rules that never bend. Muse orchestrates with it; Agent37 runs it;
 * P&R MCP renders it. If they leave, the brief still works on any agent they
 * own, which is the honest offer.
 *
 * A brief is a value, not a request: parse it, render it, store it. Nothing
 * here calls a model or a tool, so it is testable and it cannot quietly change
 * what gets made.
 */

export const MAX_CLIPS_PER_BRIEF = 25;
export const MIN_SECONDS = 3;
export const MAX_SECONDS = 30;
export const DEFAULT_SECONDS = 15;

export interface ClipBrief {
  /** One line: what this page is about. */
  niche: string;
  /** The angle this batch runs on. */
  angle: string;
  /** How the first second opens. */
  hookFrame: string;
  /** What to build, in production terms. */
  format: string;
  clipSeconds: number;
  count: number;
  /** Who gets credited, and how. Never optional. */
  creditPolicy: string;
  /** Fan pages carry this line in the copy. Empty for an owned page. */
  disclosure?: string;
}

const DEFAULT_CREDIT_POLICY =
  "Credit the creator on their own line, by handle, with the source link. No credit, no post.";

/**
 * The rules that never bend, written into every brief. If an agent only reads
 * one part of this file, it should be this — an agent that invents a result is
 * worse than an agent that produces nothing.
 */
export const BRIEF_GATES = [
  "Only clip public material. Never leaks, datamined files, pirated copies, or 'play early' tricks.",
  "Never invent a number. No views, reach, followers or income claims — not in the hook, not in the caption.",
  "Show a preview before exporting; a human approves each clip, one by one.",
  "Nothing is posted by the agent. The member posts, or approves an export.",
];

export function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(value)));
}

export function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_CLIPS_PER_BRIEF, Math.max(1, Math.trunc(value)));
}

/** From a Box Trade brief card, plus the page it belongs to. */
export function briefFromCard(
  card: { angle: string; hookFrame: string; format: string },
  page: { niche: string; disclosure?: string | null },
  options: { count?: number; clipSeconds?: number; creditPolicy?: string } = {},
): ClipBrief {
  return {
    niche: page.niche.trim(),
    angle: card.angle,
    hookFrame: card.hookFrame,
    format: card.format,
    clipSeconds: clampSeconds(options.clipSeconds ?? DEFAULT_SECONDS),
    count: clampCount(options.count ?? 1),
    creditPolicy: options.creditPolicy?.trim() || DEFAULT_CREDIT_POLICY,
    disclosure: page.disclosure?.trim() || undefined,
  };
}

/**
 * Parse what a member actually types: "10 clips, 20 seconds, the then-vs-now
 * angle". Tolerant about order and punctuation, strict about the bounds, and
 * it never invents an angle the member did not name.
 */
export function parseBrief(
  text: string,
  page: { niche: string; disclosure?: string | null },
): ClipBrief {
  const lower = text.toLowerCase();

  // Four digits, then clamp: "900 clips" must become the ceiling, not silently
  // fall back to one clip because the number looked unreasonable.
  const countMatch = lower.match(/(\d{1,4})\s*(?:clips?|videos?|posts?)/);
  const secondsMatch = lower.match(/(\d{1,4})\s*(?:s\b|sec|secs|seconds?)/);

  const angle =
    text
      .replace(/\d{1,4}\s*(clips?|videos?|posts?|s\b|sec|secs|seconds?)/gi, "")
      .replace(/[,.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || page.niche.trim();

  return {
    niche: page.niche.trim(),
    angle,
    hookFrame: "Open on the clip's own first line — never a written hook that outruns it.",
    format: "The clip's own words as burned-in captions, its own audio as the track.",
    clipSeconds: clampSeconds(secondsMatch ? Number(secondsMatch[1]) : DEFAULT_SECONDS),
    count: clampCount(countMatch ? Number(countMatch[1]) : 1),
    creditPolicy: DEFAULT_CREDIT_POLICY,
    disclosure: page.disclosure?.trim() || undefined,
  };
}

/**
 * The prompt a member pastes into Muse — or into any agent they own. It is
 * deliberately plain text: portable, inspectable, and editable by them.
 */
export function renderBrief(brief: ClipBrief): string {
  const lines = [
    `You are the clipping agent for a page about: ${brief.niche}`,
    "",
    `This batch: ${brief.count} clip${brief.count === 1 ? "" : "s"}, ${brief.clipSeconds} seconds each.`,
    `Angle: ${brief.angle}`,
    `Open on: ${brief.hookFrame}`,
    `Build: ${brief.format}`,
    "",
    `Credits: ${brief.creditPolicy}`,
  ];
  if (brief.disclosure) lines.push(`Disclosure in every caption: ${brief.disclosure}`);
  lines.push("", "Rules that do not bend:");
  lines.push(...BRIEF_GATES.map((g) => `- ${g}`));
  return lines.join("\n");
}

/** The structured fields a queued clip carries, so output matches the brief. */
export function toQueueFields(brief: ClipBrief): {
  angle: string;
  hookFrame: string;
  format: string;
  clipSeconds: number;
  disclosure: string | null;
} {
  return {
    angle: brief.angle,
    hookFrame: brief.hookFrame,
    format: brief.format,
    clipSeconds: brief.clipSeconds,
    disclosure: brief.disclosure ?? null,
  };
}

/**
 * A brief is only worth selling if it survives being handed to a stranger's
 * agent. This is the cheap check: the gates must be present and the bounds must
 * hold. Used by the desk before a brief is saved or exported.
 */
export function isPortableBrief(brief: ClipBrief): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!brief.niche.trim()) problems.push("No niche — an agent cannot aim at nothing.");
  if (!brief.angle.trim()) problems.push("No angle.");
  if (brief.count < 1 || brief.count > MAX_CLIPS_PER_BRIEF) problems.push(`Count outside 1–${MAX_CLIPS_PER_BRIEF}.`);
  if (brief.clipSeconds < MIN_SECONDS || brief.clipSeconds > MAX_SECONDS) {
    problems.push(`Length outside ${MIN_SECONDS}–${MAX_SECONDS}s.`);
  }
  if (!brief.creditPolicy.trim()) problems.push("No credit policy — every clip is credited.");
  const rendered = renderBrief(brief).toLowerCase();
  if (!rendered.includes("never invent a number")) problems.push("Gates missing from the rendered brief.");
  return { ok: problems.length === 0, problems };
}
