/**
 * mnemos: the taste layer — spoken to Dave's mnemos-bridge, not to a local store.
 *
 * The bridge (davenamovich/mnemos-bridge) is ONE shared store fronted by HTTP.
 * It segments callers by two headers, and **both default to Dave**:
 *
 *     X-Mnemos-Person   default "user"     (Dave)
 *     X-Mnemos-Project  default "global"
 *
 * So a request that omits them does not fail — it quietly writes member taste
 * into Dave's memory. Every call below therefore sets both headers explicitly,
 * and `scopeHeaders()` is the only place that decides them.
 *
 *
 * The database is the record — states, approvals, allowances, money. This
 * file carries the part that has no columns: why the page exists, what
 * the member rejected and in whose words, which corrections stuck.
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

// The repo carries no @types/node, so `process` is read through a typed
// shim rather than adding a dependency to the whole app for two env vars.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const MNEMOS_URL = env.MNEMOS_URL ?? "";
const MNEMOS_KEY = env.MNEMOS_KEY ?? "";
const TIMEOUT_MS = 1500;

export class MemoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryScopeError";
  }
}

function requireId(value: unknown, field: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new MemoryScopeError(`${field} is required in a memory scope.`);
  return id;
}

/** One page's taste. `clip:user_123:page_page_a` — never a bare scope. */
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

/**
 * Scope → the bridge's two headers. This is the function that keeps a member's
 * memory out of Dave's store, so it is written to be impossible to call without
 * a userId and tested for exactly that.
 *
 *   person  = "member-<id>" — one member, never "user"
 *   project = "whoparmy" or "whoparmy:page:<pageId>"
 */
export function scopeHeaders(scope: string): { person: string; project: string } {
  const parts = scope.split(":");
  const kind = parts[0];
  const userId = parts[1];

  if (!kind || !userId) throw new MemoryScopeError("A memory scope needs a kind and a member id.");

  if (kind === "clip") {
    const pageIdx = parts.indexOf("page");
    const pageId = pageIdx >= 0 ? parts[pageIdx + 1] : undefined;
    return {
      person: `member-${userId}`,
      project: pageId ? `whoparmy:page:${pageId}` : "whoparmy",
    };
  }
  if (kind === "army") {
    const botIdx = parts.indexOf("bot");
    const botId = botIdx >= 0 ? parts[botIdx + 1] : undefined;
    return {
      person: `member-${userId}`,
      project: botId ? `whoparmy:army:${botId}` : "whoparmy:army",
    };
  }
  throw new MemoryScopeError(`Unknown memory scope kind: ${kind}`);
}

function configured(): boolean {
  return Boolean(MNEMOS_URL);
}

async function mcpTool(
  name: string,
  args: Record<string, unknown>,
  scope: string,
): Promise<unknown | null> {
  if (!configured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { person, project } = scopeHeaders(scope);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(MNEMOS_KEY ? { authorization: `Bearer ${MNEMOS_KEY}` } : {}),
      // Never omit these two: the bridge defaults both to Dave's own memory.
      "x-mnemos-person": person,
      "x-mnemos-project": project,
    };
    const res = await fetch(MNEMOS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
    const text = data.result?.content?.[0]?.text;
    return text ?? null;
  } catch {
    // Timeout, DNS, 500 — the clip does not care. No hints this time.
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  const scope = clipScope(userId, pageId);
  const raw = await mcpTool("mnemos_recall", { query: question, max_results: 5 }, scope);
  if (!raw || typeof raw !== "string") return [];
  const lines = raw
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter((l) => l.length > 0 && !/^\d+$/.test(l));
  return lines.slice(0, 5);
}

export type Decision = "approved" | "edited" | "rejected";

/**
 * Capture only on a human decision. "The model liked it" is not a lesson;
 * an approval, an edit (the diff is the lesson) or a rejection with a
 * reason is.
 */
export async function captureDecision(input: {
  userId: string;
  pageId: string;
  clipId: string;
  decision: Decision;
  /** The member's own words. Required for a rejection worth remembering. */
  note?: string;
  original?: string;
  final?: string;
}): Promise<void> {
  const scope = clipScope(input.userId, input.pageId);
  const parts = [`${input.decision} clip ${input.clipId}`];
  if (input.note?.trim()) parts.push(input.note.trim());
  if (input.decision === "edited" && input.original && input.final) {
    parts.push(`was: ${input.original.slice(0, 160)} → now: ${input.final.slice(0, 160)}`);
  }
  await mcpTool("mnemos_capture", { content: parts.join(" — ") }, scope);
}

/** Replace a standing preference instead of stacking a contradiction on it. */
export async function correctPreference(input: {
  userId: string;
  pageId?: string;
  oldText: string;
  newText: string;
}): Promise<void> {
  const scope = input.pageId ? clipScope(input.userId, input.pageId) : clipScope(input.userId);
  await mcpTool("mnemos_correct", { old_text: input.oldText, new_text: input.newText }, scope);
}

/**
 * Where a worker left off, in plain words, so the next wake does not
 * replay a transcript to find out.
 */
export async function handoff(userId: string, pageId: string, note: string): Promise<void> {
  const scope = clipScope(userId, pageId);
  await mcpTool("mnemos_handoff", { text: note }, scope);
}
