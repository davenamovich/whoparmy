/**
 * The pure half of lib/clips/memory.ts — scope labels, page tags and the
 * one-line decision text. No store, no `@/` imports, so `node --test`
 * can load it directly (the same split as agent-architect-core.ts).
 * lib/clips/memory.ts re-exports everything here.
 */

export class MemoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryScopeError";
  }
}

export function requireId(value: unknown, field: string): string {
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
