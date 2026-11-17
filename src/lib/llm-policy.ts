import "server-only";
import { db } from "@/lib/db";
import { MODEL_TIERS } from "@/lib/game";

/**
 * ─── LLM ROUTING POLICY — one policy, every consumer ────────────────
 *
 * The tier → model assignments live in code by default (MODEL_TIERS,
 * the routing proven in the 2026-11-16 Bifrost proof run). The
 * operator can override any tier's primary model from the LLM Control
 * console; overrides persist as RoutingPolicy rows and are read fresh
 * by the agent runner on every job — no redeploy, no restart.
 *
 * A tier's ladder is [override, ...defaults below it], de-duplicated:
 * the override is tried first, then the proven defaults catch it.
 * Cost reconciliation only reprices models whose coefficient is known
 * (MODEL_TIERS); an unknown model's job keeps its order-time estimate.
 */

export const DEFAULT_LADDERS: Record<string, string[]> = {
  volume: ["deepseek-v4.1-flash-1017"],
  mid: ["gpt-6-luna", "deepseek-v4.1-flash-1017"],
  final: ["gpt-6-sol", "gpt-6-luna", "deepseek-v4.1-flash-1017"],
  quality: ["claude-sonnet-5", "gpt-6-sol", "gpt-6-luna", "deepseek-v4.1-flash-1017"],
};

export function tierKeys(): string[] {
  return MODEL_TIERS.map((t) => t.key);
}

export async function getPolicyOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await db.routingPolicy.findMany();
    return Object.fromEntries(rows.map((r) => [r.tier, r.model]));
  } catch {
    return {}; // policy table unreadable — defaults still route fine
  }
}

export interface EffectiveTier {
  key: string;
  label: string;
  model: string;
  defaultModel: string;
  overridden: boolean;
  coefficient: number;
  typicalWeightedTokens: number;
  fuel: string;
  blurb: string;
}

export async function getEffectiveTiers(): Promise<EffectiveTier[]> {
  const overrides = await getPolicyOverrides();
  return MODEL_TIERS.map((t) => ({
    key: t.key,
    label: t.label,
    model: overrides[t.key] ?? t.model,
    defaultModel: t.model,
    overridden: !!overrides[t.key],
    coefficient: t.coefficient,
    typicalWeightedTokens: t.typicalWeightedTokens,
    fuel: t.fuel,
    blurb: t.blurb,
  }));
}

/** The ladder a job on this tier attempts, policy override first. */
export async function getLadder(tierKey: string): Promise<string[]> {
  const defaults = DEFAULT_LADDERS[tierKey] ?? DEFAULT_LADDERS.mid;
  const overrides = await getPolicyOverrides();
  const primary = overrides[tierKey];
  if (!primary) return defaults;
  return [primary, ...defaults.filter((m) => m !== primary)];
}

// ─── Starimg (AI STAR) access — shared by the runner and console ────

export function starimgConfig(): { key: string; base: string } | null {
  const key = process.env.STARIMG_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.STARIMG_BASE_URL?.trim() || "https://ai.starimg.ru/v1").replace(/\/$/, "");
  return { key, base };
}

export interface StarimgCatalog {
  ok: boolean;
  models: string[];
  error?: string;
}

/** Live model catalog from Starimg. The catalog churns — never cache
 *  it for long, and never treat a fetch failure as an empty catalog. */
export async function fetchStarimgCatalog(): Promise<StarimgCatalog> {
  const cfg = starimgConfig();
  if (!cfg) return { ok: false, models: [], error: "STARIMG_API_KEY is not set in the app environment." };
  try {
    const res = await fetch(`${cfg.base}/models`, {
      headers: { Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, models: [], error: `Starimg /models returned HTTP ${res.status}` };
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data.data ?? []).map((m) => m.id).filter((x): x is string => !!x).sort();
    return models.length > 0 ? { ok: true, models } : { ok: false, models: [], error: "Starimg returned an empty catalog." };
  } catch (err) {
    return { ok: false, models: [], error: err instanceof Error ? err.message : "Catalog fetch failed" };
  }
}

// ─── Bifrost gateway probe ───────────────────────────────────────────

export interface BifrostStatus {
  url: string;
  reachable: boolean;
  version?: string;
  note: string;
}

/** Bifrost runs locally on Muse's VM (localhost:8080) — from the
 *  deployed app it is normally unreachable, and the console says so
 *  plainly instead of pretending. BIFROST_URL can point at a real
 *  deployment when one exists. */
export async function probeBifrost(): Promise<BifrostStatus> {
  const url = (process.env.BIFROST_URL?.trim() || "http://localhost:8080").replace(/\/$/, "");
  try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2_500) });
    if (!health.ok) return { url, reachable: false, note: `Gateway answered HTTP ${health.status} on /health.` };
    let version: string | undefined;
    try {
      const v = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(2_500) });
      if (v.ok) version = String(await v.json());
    } catch {
      // version is a bonus; health already proved reachability
    }
    return { url, reachable: true, version, note: "Gateway is up. Provider wiring inside Bifrost still needs STARIMG_API_KEY in the gateway's own environment at launch." };
  } catch {
    return {
      url,
      reachable: false,
      note: "Not reachable from this server. Bifrost runs locally on Muse's VM (localhost:8080) as plumbing; it is not deployed. Routing policy above is what the production runner uses today.",
    };
  }
}
