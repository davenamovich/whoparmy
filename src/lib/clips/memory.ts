/**
 * mnemos: the taste layer.
 *
 * The database is the record — states, approvals, allowances, money. This
 * file carries the part that has no columns: why the page exists, what
 * the member rejected and in whose words, which corrections stuck.
 *
 * TRANSPORT — one way in. Everything here goes through the Mnemos Bridge
 * (src/lib/mnemos-bridge.ts): MCP JSON-RPC over HTTP, the person carried
 * in the `X-Mnemos-Person` header. An earlier version of this file kept
 * its own MNEMOS_URL / MNEMOS_KEY pair and passed `scope` as an argument,
 * so clip taste was written to `clip:<user>:page:<page>` while the Memory
 * tab read the person scope `member-<id>`. Two scopes that could never
 * meet — approvals were being captured and were invisible in the app.
 * There is now one transport and one scope, or there is nothing.
 *
 * Three rules hold it honest:
 *   1. Numbers never go in here. A count read back as memory becomes a
 *      "result", and invented performance data is the one thing this
 *      product must never do.
 *   2. Every scope carries the member's id. A shared scope leaks one
 *      member's taste into another member's output.
 *   3. A memory failure never blocks a clip. Timeout, return empty,
 *      carry on — the batch is more important than the hint.
 */

import {
  bridgeCall,
  mnemosConfigured,
  mnemosExport,
  mnemosPersonFor,
  mnemosRecall,
} from "@/lib/mnemos-bridge";

export class MemoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryScopeError";
  }
}

/**
 * The Memory tab reads the person scope with the global project, so page
 * identity rides in the captured TEXT (`page:<id>`) instead of a project
 * partition. Partitioning by page here would hide every page-tagged fact
 * from the tab again — the exact bug this rewrite exists to fix.
 */
const BRIDGE_PROJECT = "global";

function requireId(value: unknown, field: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new MemoryScopeError(`${field} is required in a memory scope.`);
  return id;
}

/** `page:<id>` — the tag that keeps one page's taste apart in the text. */
export function pageTag(pageId?: string): string {
  const id = typeof pageId === "string" ? pageId.trim() : "";
  return id ? `page:${id}` : "";
}

/**
 * The human-readable label for a scope. Kept because callers and tests
 * read it, and because it is the honest description of what a fact is
 * about — but it is no longer the key the store is addressed by.
 */
export function clipScope(userId: string, pageId?: string): string {
  const user = requireId(userId, "userId");
  if (!pageId) return `clip:${user}`;
  return `clip:${user}:page:${requireId(pageId, "pageId")}`;
}

/** House rules for every army bot, or one bot's own lessons. */
export function armyScope(userId: string, botId?: string): string {
  const user = requireId(userId, "userId");
  if (!botId) return `army:${user}`;
  return `army:${user}:bot:${requireId(botId, "botId")}`;
}

/** One call for one member. Null means the store was unavailable. */
async function scopedCall(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  const person = mnemosPersonFor(requireId(userId, "userId"));
  return bridgeCall(person, name, args, { project: BRIDGE_PROJECT });
}

/**
 * One call per batch. Returns up to five hints, or [] when memory is
 * absent, slow or unsure. The caller treats these as suggestions that
 * shape a brief, never as rules that block a clip.
 */
export async function recallForPage(
  userId: string,
  pageId: string,
  question: string,
): Promise<string[]> {
  requireId(pageId, "pageId");
  const raw = await scopedCall(userId, "mnemos_recall", {
    query: question,
    max_results: 5,
  });
  if (!raw || typeof raw !== "string") return [];
  const lines = raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter((l) => l.length > 0 && !/^\d+$/.test(l));
  return lines.slice(0, 5);
}

export type Decision = "approved" | "edited" | "rejected";

export interface DecisionInput {
  pageId?: string;
  clipId: string;
  decision: Decision;
  /** The member's own words. Required for a rejection worth remembering. */
  note?: string;
  original?: string;
  final?: string;
}

/**
 * What one decision is worth remembering, in one line. Pure so it can be
 * tested without a store: the page tag first (so the fact is findable per
 * page), then the decision, then the member's own words, then the diff.
 */
export function decisionText(input: DecisionInput): string {
  const parts: string[] = [];
  const tag = pageTag(input.pageId);
  if (tag) parts.push(tag);
  parts.push(`${input.decision} clip ${input.clipId}`);
  const note = input.note?.trim();
  if (note) parts.push(note);
  if (input.decision === "edited" && input.original && input.final) {
    parts.push(
      `was: ${input.original.slice(0, 160)} → now: ${input.final.slice(0, 160)}`,
    );
  }
  return parts.join(" — ");
}

/**
 * Capture only on a human decision. "The model liked it" is not a lesson;
 * an approval, an edit (the diff is the lesson) or a rejection with a
 * reason is. Returns false when the store was unavailable — the caller
 * ignores it, the log records it.
 */
export async function captureDecision(
  input: DecisionInput & { userId: string },
): Promise<boolean> {
  const raw = await scopedCall(input.userId, "mnemos_capture", {
    content: decisionText(input),
    context: "clip decision in the P&R review desk",
  }).catch(() => null);
  return raw !== null;
}

/** Replace a standing preference instead of stacking a contradiction on it. */
export async function correctPreference(input: {
  userId: string;
  pageId?: string;
  oldText: string;
  newText: string;
}): Promise<void> {
  const tag = pageTag(input.pageId);
  const prefix = tag ? `${tag} — ` : "";
  await scopedCall(input.userId, "mnemos_correct", {
    old_text: `${prefix}${input.oldText}`,
    new_text: `${prefix}${input.newText}`,
  }).catch(() => null);
}

/**
 * Where a worker left off, in plain words, so the next wake does not
 * replay a transcript to find out.
 */
export async function handoff(
  userId: string,
  pageId: string,
  note: string,
): Promise<void> {
  const tag = pageTag(pageId);
  await scopedCall(userId, "mnemos_handoff", {
    text: tag ? `${tag} — ${note}` : note,
  }).catch(() => null);
}

export interface MemoryHealth {
  /** Is MNEMOS_BRIDGE_TOKEN set on this deployment? */
  configured: boolean;
  /** The person scope this member's facts and clips both use. */
  person: string;
  /** Did a read actually reach the store, or did it fall back to null? */
  reachable: boolean;
  /** How many facts the export battery can see right now. */
  facts: number;
  checkedAt: string;
}

/**
 * "Is memory on?" as one call instead of a repo read and a guess.
 *
 * Until now a misconfigured bridge and a working one with nothing to say
 * were indistinguishable: both returned null and both looked fine. This
 * separates them — configured false is a deploy problem, configured true
 * with reachable false is an outage, and both together are silent.
 */
export async function memoryHealth(userId: string): Promise<MemoryHealth> {
  const person = mnemosPersonFor(requireId(userId, "userId"));
  const configured = mnemosConfigured();
  if (!configured) {
    return { configured, person, reachable: false, facts: 0, checkedAt: new Date().toISOString() };
  }
  const probe = await mnemosRecall(person, "memory").catch(() => null);
  const reachable = probe !== null;
  const facts = reachable ? (await mnemosExport(person).catch(() => [] as string[])).length : 0;
  return { configured, person, reachable, facts, checkedAt: new Date().toISOString() };
}
