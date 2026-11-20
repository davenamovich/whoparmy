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
 *
 * The pure helpers (scope labels, page tags, decision text) live in
 * ./memory-core.ts so they unit-test without the store.
 */

import {
  bridgeCall,
  bridgeCallResult,
  type BridgeFailure,
  MemoryUnavailableError,
  mnemosConfigured,
  mnemosExport,
  mnemosPersonFor,
} from "@/lib/mnemos-bridge";
import { type DecisionInput, decisionText, pageTag, requireId } from "./memory-core";

export {
  armyScope,
  clipScope,
  type Decision,
  type DecisionInput,
  decisionText,
  MemoryScopeError,
  pageTag,
} from "./memory-core";

/**
 * The Memory tab reads the person scope with the global project, so page
 * identity rides in the captured TEXT (`page:<id>`) instead of a project
 * partition. Partitioning by page here would hide every page-tagged fact
 * from the tab again — the exact bug this rewrite exists to fix.
 */
const BRIDGE_PROJECT = "global";

/** Writes get a shorter leash than reads: they run after the member's
 *  action has already been saved, and must not hold the response long. */
const CAPTURE_TIMEOUT_MS = 8_000;

/** One call for one member. Null means the store was unavailable. */
async function scopedCall(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<string | null> {
  const person = mnemosPersonFor(requireId(userId, "userId"));
  return bridgeCall(person, name, args, { project: BRIDGE_PROJECT, timeoutMs });
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

/**
 * Capture only on a human decision. "The model liked it" is not a lesson;
 * an approval, an edit (the diff is the lesson) or a rejection with a
 * reason is. Returns false when the store was unavailable; the failure is
 * logged so a dead bridge shows up in the server log, not just as an
 * empty Memory tab. Never throws.
 */
export async function captureDecision(
  input: DecisionInput & { userId: string },
): Promise<boolean> {
  const raw = await scopedCall(
    input.userId,
    "mnemos_capture",
    {
      content: decisionText(input),
      context: "clip decision in the P&R review desk",
    },
    CAPTURE_TIMEOUT_MS,
  ).catch(() => null);
  if (raw === null) {
    console.warn("[memory] clip decision not captured", { clipId: input.clipId, decision: input.decision });
    return false;
  }
  return true;
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
  /** Did a read actually reach the store and get a valid answer? */
  reachable: boolean;
  /** Why it isn't reachable, when it isn't. */
  error?: BridgeFailure;
  /** How many facts the export battery can see right now; null when the
   *  count couldn't be taken (some recall in the battery failed). */
  facts: number | null;
  checkedAt: string;
}

/**
 * "Is memory on?" as one call instead of a repo read and a guess.
 *
 * Separates the states a member-facing read can't: configured false is a
 * deploy problem, `error: "unauthorized"` is a wrong token, any other
 * error is an outage, and reachable with facts 0 is a working, empty
 * store. An empty reply used to count as "unreachable", so a healthy
 * store with nothing in it reported as down.
 */
export async function memoryHealth(userId: string): Promise<MemoryHealth> {
  const person = mnemosPersonFor(requireId(userId, "userId"));
  const configured = mnemosConfigured();
  const checkedAt = () => new Date().toISOString();
  if (!configured) {
    return { configured, person, reachable: false, error: "unconfigured", facts: null, checkedAt: checkedAt() };
  }
  const probe = await bridgeCallResult(person, "mnemos_recall", { query: "memory" }, { project: BRIDGE_PROJECT });
  if (!probe.ok) {
    return { configured, person, reachable: false, error: probe.reason, facts: null, checkedAt: checkedAt() };
  }
  let facts: number | null = null;
  try {
    facts = (await mnemosExport(person)).length;
  } catch (err) {
    if (!(err instanceof MemoryUnavailableError)) throw err;
  }
  return { configured, person, reachable: true, facts, checkedAt: checkedAt() };
}
