/**
 * ─── NARRATIVE HOOK BANK ────────────────────────────────────────────
 *
 * The most common narrative themes across TikTok slideshow posts
 * promoting apps/SaaS (tracker data shared by Dave, 2026-11-17;
 * share = % of slideshows, change = monthly momentum). These are
 * first-person confessional story-openers — the reader is inside the
 * story by the second line, which is why they convert.
 *
 * The integration rule for every hook surface: borrow the FRAME,
 * never the literal story. Keep the first-person voice, the specific
 * detail, and the open loop; re-skin the specifics onto the reader's
 * world (for our members: the business owner's version — the client
 * who ghosted, the rent due after payday, the job quit with no
 * backup plan). Rising narratives (positive momentum) are the
 * freshest frames; falling ones still work but are cooling.
 */

export interface NarrativeHook {
  rank: number;
  text: string;
  sharePct: number;
  monthlyChangePct: number;
}

export const NARRATIVE_HOOKS: NarrativeHook[] = [
  { rank: 1, text: "My boyfriend cheated on me with someone I know.", sharePct: 14.2, monthlyChangePct: 32 },
  { rank: 2, text: "I broke up with my girlfriend after five years.", sharePct: 11.8, monthlyChangePct: 18 },
  { rank: 3, text: "My mom is a therapist, and she spotted the red flags first.", sharePct: 9.6, monthlyChangePct: 24 },
  { rank: 4, text: "I quit my job without a backup plan.", sharePct: 8.7, monthlyChangePct: 41 },
  { rank: 5, text: "My best friend stopped inviting me to things.", sharePct: 7.9, monthlyChangePct: -8 },
  { rank: 6, text: "My ex came back as soon as I moved on.", sharePct: 7.1, monthlyChangePct: 12 },
  { rank: 7, text: "I moved back in with my parents at 28.", sharePct: 6.4, monthlyChangePct: 16 },
  { rank: 8, text: "I found something on my partner's phone.", sharePct: 5.7, monthlyChangePct: -11 },
  { rank: 9, text: "My sister told me a family secret I wasn't ready for.", sharePct: 5.2, monthlyChangePct: 9 },
  { rank: 10, text: "I'm falling for someone I used to hate.", sharePct: 4.8, monthlyChangePct: -6 },
  { rank: 11, text: "I got paid yesterday, and I still can't afford rent.", sharePct: 4.3, monthlyChangePct: 35 },
  { rank: 12, text: "I finally love what I do, but I earn less.", sharePct: 3.8, monthlyChangePct: 23 },
  { rank: 13, text: "I got fired the week I signed a new lease.", sharePct: 3.3, monthlyChangePct: 14 },
  { rank: 14, text: "I stopped texting first and lost my friends.", sharePct: 2.9, monthlyChangePct: 7 },
  { rank: 15, text: "I told everyone I was fine until my mom called.", sharePct: 2.4, monthlyChangePct: 27 },
  { rank: 16, text: "I found out what my coworkers say when I'm not there.", sharePct: 1.9, monthlyChangePct: -4 },
];

/** Prompt-ready block: the strongest frames + how to use them.
 *  Risers first — momentum is the freshness signal. */
export function narrativePromptBlock(limit = 10): string {
  const top = [...NARRATIVE_HOOKS]
    .sort((a, b) => b.monthlyChangePct - a.monthlyChangePct)
    .slice(0, limit);
  const lines = top.map(
    (h) => `- "${h.text}" (${h.sharePct}% of viral slideshow posts, ${h.monthlyChangePct >= 0 ? "+" : ""}${h.monthlyChangePct}% this month)`,
  );
  return [
    "NARRATIVE HOOK BANK — the first-person story frames dominating TikTok slideshow posts that sell apps and SaaS right now:",
    ...lines,
    "HOW TO USE THEM: open with a first-person confessional line in one of these frames — borrow the emotional structure (betrayal, quitting, money panic, the secret, the person who saw it first), never the literal story. Re-skin the specifics onto the reader's world (a business owner's version: the client, the rent, the job, the partner, the phone). Specific detail + an open loop the rest of the piece pays off. First person, present-tense energy, no throat-clearing.",
  ].join("\n");
}
