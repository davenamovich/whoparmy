/**
 * ─── MNEMOS BRIDGE CLIENT (server-side only) ────────────────────────
 *
 * The shared memory store lives on Railway behind the Mnemos Bridge
 * (Dave's order, 2026-11-18: one shared memory for Muse + Agent37 +
 * member agents). Whoparmy talks to it over MCP JSON-RPC with a
 * bearer token; every member is segmented into their own person
 * scope (`member-<userId>`) so one member's memory can never surface
 * in another member's session.
 *
 * Env: MNEMOS_BRIDGE_URL (default: the production bridge),
 * MNEMOS_BRIDGE_TOKEN (set by the operator; when unset, every call
 * degrades to "no memory" — Ralph still works, he just doesn't
 * remember yet).
 */

const DEFAULT_URL = "https://mnemos-production-b0402c80.up.railway.app/mcp";

export function mnemosPersonFor(userId: string): string {
  return `member-${userId}`;
}

/**
 * Dave's house scope on the bridge — where Muse's captures for Dave
 * live. Member surfaces read it ONLY for designated-operator sessions
 * (Dave's order, 2026-11-18: operators see house memory, so Dave's
 * own memories show up in his Whoparmy view). Member captures never
 * write to it; it is a read-merge only.
 */
export const HOUSE_PERSON = "user";

function bridgeConfig(): { url: string; token: string } | null {
  const token = process.env.MNEMOS_BRIDGE_TOKEN?.trim();
  if (!token) return null;
  const url = process.env.MNEMOS_BRIDGE_URL?.trim() || DEFAULT_URL;
  return { url, token };
}

/** Is the bridge configured on this deployment at all? When the token is
 *  unset every call degrades to null — silence by design, which is why a
 *  broken deploy used to look identical to an empty store. The health
 *  route reads this to tell those two states apart. */
export function mnemosConfigured(): boolean {
  return bridgeConfig() !== null;
}

/**
 * Why a call did not return a payload. Kept distinct on purpose: every
 * one of these used to collapse into `null`, so a missing token, a
 * rejected token, an outage and an empty store all looked like "no
 * memory yet" — which is how a broken deploy stayed invisible.
 */
export type BridgeFailure =
  | "unconfigured" // MNEMOS_BRIDGE_TOKEN is not set on this deployment
  | "unauthorized" // the bridge rejected the token (401/403)
  | "http" // any other non-2xx, or a body that isn't a JSON-RPC result
  | "tool_error" // the bridge answered, the tool reported isError
  | "network"; // timeout, DNS, dropped connection

export type BridgeResult =
  | { ok: true; text: string } // text may be "" — an empty store is a success
  | { ok: false; reason: BridgeFailure; status?: number };

type BridgeFail = Extract<BridgeResult, { ok: false }>;

/** Thrown by reads that must not pass a failure off as an empty memory. */
export class MemoryUnavailableError extends Error {
  readonly reason: BridgeFailure;
  constructor(reason: BridgeFailure) {
    super(`Memory unavailable (${reason})`);
    this.name = "MemoryUnavailableError";
    this.reason = reason;
  }
}

/**
 * One tool call against the bridge for one person — the single door into
 * the store. Clips, the Memory tab and the export all come through here,
 * so what one writes the others can read. Nothing else may open its own
 * connection: that is how clip taste ended up in a scope the tab never
 * looked at.
 */
export async function bridgeCallResult(
  person: string,
  name: string,
  args: Record<string, unknown>,
  opts: { project?: string; timeoutMs?: number } = {},
): Promise<BridgeResult> {
  return callTool(person, name, args, opts.timeoutMs ?? 20_000, opts.project ?? "global");
}

/** Payload text ("" when the store had nothing), or null on any failure. */
export async function bridgeCall(
  person: string,
  name: string,
  args: Record<string, unknown>,
  opts: { project?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const r = await bridgeCallResult(person, name, args, opts);
  return r.ok ? r.text : null;
}

let rpcId = 0;

/** Only transient failures are worth a second try. A rejected token or a
 *  tool error fails the same way again — retrying them just doubles the
 *  wait on a misconfigured deploy. */
function retryable(r: BridgeResult): boolean {
  if (r.ok) return false;
  return r.reason === "network" || (r.reason === "http" && (r.status ?? 0) >= 500);
}

async function callTool(
  person: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 20_000,
  project = "global",
): Promise<BridgeResult> {
  const cfg = bridgeConfig();
  if (!cfg) return { ok: false, reason: "unconfigured" };
  // One retry: the bridge occasionally drops a connection mid-response
  // (observed 2026-11-18); a single retry masks it without hiding a
  // real outage.
  let out = await callToolOnce(cfg, person, name, args, timeoutMs, project);
  if (retryable(out)) {
    await new Promise((r) => setTimeout(r, 800));
    out = await callToolOnce(cfg, person, name, args, timeoutMs, project);
  }
  return out;
}

async function callToolOnce(
  cfg: { url: string; token: string },
  person: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  project: string,
): Promise<BridgeResult> {
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
        "X-Mnemos-Person": person,
        "X-Mnemos-Project": project,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "network" }; // memory is an enhancement, never a blocker
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized", status: res.status };
  if (!res.ok) return { ok: false, reason: "http", status: res.status };
  let data: { result?: { content?: { text?: string }[]; isError?: boolean }; error?: unknown };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, reason: "http", status: res.status };
  }
  if (data.error || !data.result) return { ok: false, reason: "http", status: res.status };
  if (data.result.isError) return { ok: false, reason: "tool_error" };
  const text = (data.result.content ?? []).map((c) => c.text ?? "").join("\n").trim();
  return { ok: true, text };
}

/** Recall what the store holds for this person. "" = the store answered
 *  with nothing; null = unavailable (use bridgeCallResult for why). */
export async function mnemosRecall(person: string, query: string): Promise<string | null> {
  const r = await callTool(person, "mnemos_recall", { query });
  return r.ok ? r.text : null;
}

/** Capture a durable fact into this person's scope. True only when the
 *  bridge confirmed the write — anything that tells a member "I'll
 *  remember" must check it. Never throws. */
export async function mnemosCapture(
  person: string,
  content: string,
  context: string,
  opts: { timeoutMs?: number } = {},
): Promise<boolean> {
  const r = await callTool(person, "mnemos_capture", { content, context }, opts.timeoutMs);
  return r.ok;
}

/**
 * A short "what do I know about this member" snapshot, built from
 * RECALL — never from mnemos_context. Context is the agent's private
 * "waking up" digest (reflection prompts, tool ids, onboarding
 * sections marked "never shown to the person"); showing it to a
 * member would leak agent internals, and filtering it proved
 * unreliable (a scope WITH memories still carries an ONBOARDING
 * section). Recall returns the clean durable-memories list instead.
 */
/** Parse one recall payload into cleaned fact lines (no "- " prefix).
 *  Member-facing polish: recall lines carry agent metadata
 *  ("- [words: a, b] Fact. id=engram_… kind=semantic confidence=…").
 *  Members get the facts, not the plumbing. */
export function parseRecallFacts(raw: string): string[] {
  const marker = "Durable memories:";
  const idx = raw.indexOf(marker);
  if (idx < 0) return [];
  let list = raw.slice(idx + marker.length).trim();
  const nextSection = list.indexOf("\n## ");
  if (nextSection > 0) list = list.slice(0, nextSection).trim();
  return list
    .split("\n")
    .map((line) =>
      line
        .replace(/^-\s*\[(?:words:[^\]]*|linked)\]\s*:?\s*/, "")
        .replace(/^\s*-\s*/, "")
        .replace(/\s+id=\S+\s+kind=\S+.*$/, "")
        .trim(),
    )
    .filter((line) => line.length > 3);
}

/**
 * Recall is keyword-only (no stemming: "services" does not match a
 * fact that says "service"), so a single narrow query silently
 * misses real facts — proven live 2026-11-18, when the old export
 * battery missed a plainly-worded fact 8 times out of 8. The
 * snapshot therefore runs a small battery of wide, stem-doubled
 * queries and merges, the same shape as the export below.
 */
const SNAPSHOT_QUERIES = [
  "business offer customers clients brand sell selling service services product products shop store owner",
  "website site online audience niche market local bookings appointments contact",
  "goals plans prices pricing team location hours lessons results revenue",
];

export type SnapshotResult =
  | { status: "ok"; text: string }
  | { status: "empty" }
  | { status: "unavailable"; reason: BridgeFailure };

/** The snapshot, with "nothing stored" kept apart from "couldn't read".
 *  Unavailable only when NO query reached the store; if some did, the
 *  facts they returned are real and are shown. */
export async function mnemosSnapshotResult(person: string, extraPersons: string[] = []): Promise<SnapshotResult> {
  const persons = [person, ...extraPersons.filter((p) => p !== person)];
  const results = await Promise.all(
    persons.flatMap((p) => SNAPSHOT_QUERIES.map((q) => callTool(p, "mnemos_recall", { query: q }))),
  );
  const okTexts = results.flatMap((r) => (r.ok ? [r.text] : []));
  if (okTexts.length === 0) {
    const firstFail = results.find((r): r is BridgeFail => !r.ok);
    return { status: "unavailable", reason: firstFail?.reason ?? "network" };
  }
  const facts = mergeFacts(okTexts);
  if (facts.length === 0) return { status: "empty" };
  return { status: "ok", text: facts.map((f) => `- ${f}`).join("\n").slice(0, 1800) };
}

/** The snapshot text, or null for empty OR unavailable. Prefer
 *  mnemosSnapshotResult anywhere the member is told what memory holds. */
export async function mnemosSnapshot(person: string, extraPersons: string[] = []): Promise<string | null> {
  const r = await mnemosSnapshotResult(person, extraPersons);
  return r.status === "ok" ? r.text : null;
}

function mergeFacts(raws: string[]): string[] {
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    for (const fact of parseRecallFacts(raw)) {
      const key = fact.toLowerCase().replace(/\s+/g, " ").slice(0, 140);
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push(fact);
    }
  }
  return facts;
}

/**
 * One-click export (Dave, 2026-11-18): everything the store holds
 * for this person, as cleaned fact lines. Mnemos has no list-all
 * tool — recall is the only read path — so the export unions
 * recalls over a battery of broad business queries and dedupes.
 * A fact phrased unusually enough to dodge every query can be
 * missed; the export file says so honestly.
 */
const EXPORT_QUERIES = [
  "business offer customers clients sell selling",
  "service services product products plans prices pricing",
  "brand website site links social online",
  "content memes campaigns posts videos",
  "audience niche market competitors local",
  "bookings appointments calls phone email contact",
  "goals decisions plans preferences strategy",
  "team staff location hours address",
  "lessons results performance reviews revenue money",
  "remember notes history background story",
];

/**
 * Throws MemoryUnavailableError if ANY query failed: a partial union
 * would be presented as the member's whole memory, and the export
 * promises never to do that. An empty array means the store answered
 * and holds nothing.
 */
export async function mnemosExport(person: string): Promise<string[]> {
  const results = await Promise.all(EXPORT_QUERIES.map((q) => callTool(person, "mnemos_recall", { query: q })));
  const failed = results.find((r): r is BridgeFail => !r.ok);
  if (failed) throw new MemoryUnavailableError(failed.reason);
  return mergeFacts(results.map((r) => (r.ok ? r.text : "")));
}
