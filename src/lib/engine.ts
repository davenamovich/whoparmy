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
  timeoutMs?: number,
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
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
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

// ─── Video lane (Dave, 2026-11-17) ──────────────────────────────────
// The engine's video formats, wired next to the meme lane. COSTS WERE
// RECONCILED LIVE on the bridge key before this wiring (2026-11-17,
// get_account before/after every probe; the key is on the BYOK path,
// pricingPath "byok"): EVERY charged call costs exactly 1 credit
// regardless of the tool's list price — ridiculous/news/present/
// best_of 1 (list 1), funnel read 1 (list 10), funnel captions 1
// (list 25), memes 1 (list 35), stickfigures 1 (list 25), bestof 1
// (list 60), followup meme 1 (list 10), followup imessage 1 (list
// 20), before_pitch 1 (list 1). Scroll + infomercial previews cost 0.
// Failures refund (observed on the funnel read). request_mp4 stays
// behind the existing approval rules — this lane makes PREVIEWS only.

export type SitdownKind = "best_of" | "ridiculous" | "news" | "present";
export type EngineJobKind =
  | "sitdown"
  | "scroll"
  | "infomercial"
  | "funnel"
  | "demo_pack";

export interface EngineJobStatus {
  terminal: boolean;
  phase: string | null;
  status: string | null;
  pageUrl: string | null;
  shareUrl: string | null;
  error: string | null;
  raw: Record<string, unknown>;
}

function requireCfg(): { key: string; base: string } {
  const cfg = engineConfig();
  if (!cfg) {
    throw new Error(
      "PR_ENGINE_API_KEY is not set in the app environment — the operator sets it at deploy (Railway env) and the engine client picks it up.",
    );
  }
  return cfg;
}

/** Submit a /sitdown-family job. Costs 1 credit on the bridge key. */
export async function submitSitdown(
  kind: SitdownKind,
  args: Record<string, unknown>,
): Promise<{ jobId: string }> {
  const cfg = requireCfg();
  const tool =
    kind === "best_of"
      ? "create_best_of"
      : kind === "ridiculous"
        ? "create_ridiculous"
        : kind === "news"
          ? "create_news"
          : "create_present";
  const out = await callTool(cfg, tool, args, 120_000);
  const jobId = typeof out.jobId === "string" ? out.jobId : "";
  if (!jobId) throw new Error(`${tool} came back without a jobId`);
  return { jobId };
}

/** A /before pack (demo_pack job). Costs 1 credit. */
export async function submitBeforePack(args: Record<string, unknown>): Promise<{ jobId: string }> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "create_before_pitch", args, 120_000);
  const jobId = typeof out.jobId === "string" ? out.jobId : typeof out.job_id === "string" ? out.job_id : "";
  if (!jobId) throw new Error("create_before_pitch came back without a jobId");
  return { jobId };
}

/** Scroll video of a finished /before pack. Preview is FREE (0 credits). */
export async function submitBeforeScroll(args: {
  job_id: string;
  look?: string;
  mute?: boolean;
}): Promise<{ jobId: string }> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "create_before_scroll", { ...args }, 120_000);
  const jobId = typeof out.jobId === "string" ? out.jobId : "";
  if (!jobId) throw new Error("create_before_scroll came back without a jobId");
  return { jobId };
}

/** Retro infomercial of a finished /before pack. Preview is FREE. */
export async function submitInfomercial(args: {
  job_id: string;
  mute?: boolean;
}): Promise<{ jobId: string }> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "create_infomercial", { ...args }, 120_000);
  const jobId = typeof out.jobId === "string" ? out.jobId : "";
  if (!jobId) throw new Error("create_infomercial came back without a jobId");
  return { jobId };
}

/**
 * One funnel step: no format = read/analyze the offer link (1 credit);
 * with funnel_id + format = build that format (1 credit at ANY list
 * price). An unreadable page fails (refunded) — retry with
 * funnel_id + description.
 */
export async function submitFunnelStep(args: Record<string, unknown>): Promise<{
  funnelId: string;
  status: string | null;
}> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "create_funnel", args, 120_000);
  const funnelId =
    typeof out.funnelId === "string" ? out.funnelId : typeof out.funnel_id === "string" ? out.funnel_id : "";
  if (!funnelId) throw new Error("create_funnel came back without a funnelId");
  return { funnelId, status: typeof out.status === "string" ? out.status : null };
}

/**
 * A follow-up post rebuilt from a finished job's script. Synchronous —
 * returns the new preview page directly. Costs 1 credit (any format).
 */
export async function createFollowup(args: Record<string, unknown>): Promise<{ pageUrl: string }> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "create_followup", args, 180_000);
  const pageUrl = typeof out.pageUrl === "string" ? out.pageUrl : "";
  if (!pageUrl) throw new Error("create_followup came back without a pageUrl");
  return { pageUrl };
}

/** Poll any engine job. Free. */
export async function getEngineJobStatus(kind: EngineJobKind, jobId: string): Promise<EngineJobStatus> {
  const cfg = requireCfg();
  const out = await callTool(cfg, "get_job_status", { kind, jobId }, 60_000);
  const dayPack = (out.dayPack ?? null) as Record<string, unknown> | null;
  return {
    terminal: out.terminal === true,
    phase: typeof out.phase === "string" ? out.phase : null,
    status: typeof out.status === "string" ? out.status : null,
    pageUrl: typeof out.pageUrl === "string" ? out.pageUrl : null,
    shareUrl:
      typeof out.shareUrl === "string"
        ? out.shareUrl
        : dayPack && typeof dayPack.shareUrl === "string"
          ? dayPack.shareUrl
          : null,
    error: typeof out.error === "string" ? out.error : null,
    raw: out,
  };
}

// ─── Deep research bridge (slice 3) ─────────────────────────────────
// Members are not logged in to P&R and hold no key yet, so brand
// research runs from this server on the bridge house key.
// research_brand is a FREE engine call, but slow (~1–2 minutes).

export interface EngineResearch {
  brandName?: string;
  voice?: string;
  hashtag?: string;
  analysisSummary?: string;
  offer?: string;
  audience?: string;
  pains: string[];
  angles: string[];
  competitors: string[];
  sourceUrl?: string;
  researchedAt?: number;
  /** Plain-text digest of the research, fed to the profile builder. */
  digest: string;
}

type Leaf = { value?: unknown } | string | null | undefined;

function leafText(x: Leaf): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && typeof x.value === "string") return x.value.trim() || null;
  return null;
}

function leafList(x: unknown, cap: number): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((i) => leafText(i as Leaf)).filter((s): s is string => Boolean(s)).slice(0, cap);
}

function competitorNames(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        return leafText(o.name as Leaf) ?? leafText(o as Leaf);
      }
      return null;
    })
    .filter((s): s is string => Boolean(s))
    .slice(0, 5);
}

export async function researchBrand(input: { url: string; notes?: string }): Promise<EngineResearch> {
  const cfg = engineConfig();
  if (!cfg) {
    throw new Error(
      "PR_ENGINE_API_KEY is not set in the app environment — the operator sets it at deploy (Railway env) and the engine client picks it up.",
    );
  }
  const out = await callTool(
    cfg,
    "research_brand",
    { url: input.url, brief: true, ...(input.notes ? { notes: input.notes } : {}) },
    240_000,
  );
  const bp = (out.brandProfile ?? {}) as Record<string, unknown>;
  const campaign = (out.campaign ?? {}) as Record<string, unknown>;
  const offerObj = (campaign.offer ?? {}) as Record<string, unknown>;
  const audienceObj = (campaign.audience ?? {}) as Record<string, unknown>;

  const research: EngineResearch = {
    brandName: typeof bp.name === "string" ? bp.name : undefined,
    voice: typeof bp.voice === "string" ? bp.voice : undefined,
    hashtag: typeof bp.hashtag === "string" ? bp.hashtag : undefined,
    analysisSummary: typeof out.analysisSummary === "string" ? out.analysisSummary : undefined,
    offer: leafText(offerObj.whatItIs as Leaf) ?? undefined,
    audience: leafText(audienceObj.who as Leaf) ?? undefined,
    pains: leafList(campaign.painPoints, 5),
    angles: leafList(campaign.angles, 5),
    competitors: competitorNames(campaign.competitors),
    sourceUrl: typeof out.sourceUrl === "string" ? out.sourceUrl : undefined,
    researchedAt: typeof out.researchedAt === "number" ? out.researchedAt : undefined,
    digest: "",
  };

  const lines = [
    research.brandName ? `Brand: ${research.brandName}` : "",
    research.analysisSummary ? `What the business is: ${research.analysisSummary}` : "",
    research.offer ? `Offer: ${research.offer}` : "",
    research.audience ? `Audience: ${research.audience}` : "",
    research.pains.length ? `Customer pains: ${research.pains.join("; ")}` : "",
    research.angles.length ? `Marketing angles: ${research.angles.join("; ")}` : "",
    research.competitors.length ? `Competitors: ${research.competitors.join(", ")}` : "",
    research.voice ? `Brand voice: ${research.voice.slice(0, 600)}` : "",
  ].filter(Boolean);
  research.digest = lines.join("\n");
  return research;
}
