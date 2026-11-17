/**
 * P&R engine client — slice 2 of the rewire (REWIRE-DESIGN.md).
 *
 * Talks to the bot's MCP endpoint (JSON-RPC tools/call) with the bridge
 * house key from PR_ENGINE_API_KEY. The key is read from env at call
 * time, never logged, never returned to the browser, and never stored
 * on an asset. Until the BYOK lane lands, every engine call runs on the
 * bridge key and is accounted in UsageRecord by the caller.
 */

const DEFAULT_BASE = "https://bot.plunderandriffle.com";

export interface EngineMemeResult {
  ok: true;
  pageUrl: string;
  pageId: string;
  imageUrl: string;
  creditCost: number;
  creditsRemaining: number | null;
}

export interface EngineFailure {
  ok: false;
  error: string;
}

function engineConfig(): { key: string; base: string } | null {
  const key = process.env.PR_ENGINE_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.PR_ENGINE_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  return { key, base };
}

export function isEngineConfigured(): boolean {
  return engineConfig() !== null;
}

/** The meme backend flag: "engine" only when explicitly enabled AND configured. */
export function memeBackend(): "engine" | "legacy" {
  return process.env.PR_MEME_BACKEND?.trim() === "engine" && isEngineConfigured() ? "engine" : "legacy";
}

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function callTool(
  cfg: { key: string; base: string },
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${cfg.base}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: ["Bearer", cfg.key].join(" "),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`Engine answered HTTP ${res.status}`);
  const payload = (await res.json()) as {
    result?: McpToolResult;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? "Engine error");
  const result = payload.result;
  if (!result) throw new Error("Engine returned no result");
  if (result.isError) {
    const text = result.content?.find((c) => c.type === "text")?.text;
    throw new Error(text?.slice(0, 200) || "Engine tool failed");
  }
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Engine returned an empty result");
  return JSON.parse(text) as Record<string, unknown>;
}

function pageIdFromUrl(pageUrl: string): string {
  const m = /\/m\/([A-Za-z0-9_-]+)/.exec(pageUrl);
  return m?.[1] ?? "";
}

/**
 * One meme from the engine, generated natively in `languageName`.
 * Costs 1 credit on the bridge key per call. Throws on failure so the
 * caller can mark the asset FAILED and record no charge, per contract.
 */
export async function generateEngineMeme(input: {
  brief: string;
  languageName: string;
  offer?: string;
}): Promise<EngineMemeResult> {
  const cfg = engineConfig();
  if (!cfg) {
    throw new Error(
      "PR_ENGINE_API_KEY is not set in the app environment — the operator sets it at deploy (Railway env) and the engine client picks it up.",
    );
  }
  const out = await callTool(cfg, "generate_ad_creative", {
    brief: input.brief,
    language: input.languageName,
    format: "image",
    ...(input.offer ? { offer: input.offer } : {}),
  });
  const pageUrl = typeof out.pageUrl === "string" ? out.pageUrl : "";
  const imageUrl = typeof out.imageUrl === "string" ? out.imageUrl : typeof out.media_url === "string" ? out.media_url : "";
  if (!pageUrl || !imageUrl) throw new Error("Engine meme came back without a page or image URL");
  return {
    ok: true,
    pageUrl,
    pageId: pageIdFromUrl(pageUrl),
    imageUrl,
    creditCost: typeof out.creditCost === "number" ? out.creditCost : 1,
    creditsRemaining: typeof out.creditsRemaining === "number" ? out.creditsRemaining : null,
  };
}
