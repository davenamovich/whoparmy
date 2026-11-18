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

function bridgeConfig(): { url: string; token: string } | null {
  const token = process.env.MNEMOS_BRIDGE_TOKEN?.trim();
  if (!token) return null;
  const url = process.env.MNEMOS_BRIDGE_URL?.trim() || DEFAULT_URL;
  return { url, token };
}

let rpcId = 0;

async function callTool(
  person: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<string | null> {
  const cfg = bridgeConfig();
  if (!cfg) return null;
  // One retry: the bridge occasionally drops a connection mid-response
  // (observed 2026-11-18); a single retry masks it without hiding a
  // real outage.
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await callToolOnce(cfg, person, name, args, timeoutMs);
    if (out !== null) return out;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

async function callToolOnce(
  cfg: { url: string; token: string },
  person: string,
  name: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
        "X-Mnemos-Person": person,
        "X-Mnemos-Project": "global",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { content?: { text?: string }[]; isError?: boolean };
    };
    if (data.result?.isError) return null;
    const text = data.result?.content?.map((c) => c.text ?? "").join("\n").trim();
    return text || null;
  } catch {
    return null; // memory is an enhancement, never a blocker
  }
}

/** Recall what the store holds for this person. Null = unavailable. */
export async function mnemosRecall(person: string, query: string): Promise<string | null> {
  return callTool(person, "mnemos_recall", { query });
}

/** Capture a durable fact into this person's scope. Fire-and-forget safe. */
export async function mnemosCapture(person: string, content: string, context: string): Promise<boolean> {
  const out = await callTool(person, "mnemos_capture", { content, context });
  return out !== null;
}

/** A short "what do I know about this member" snapshot for greetings.
 *  A fresh scope answers with Mnemos' first-session ONBOARDING text —
 *  that is boilerplate, not memory, so it reads as "nothing yet". */
export async function mnemosSnapshot(person: string): Promise<string | null> {
  const text = await callTool(person, "mnemos_context", {});
  if (!text) return null;
  if (text.includes("ONBOARDING") || text.includes("first session with a fresh memory")) return null;
  return text;
}
