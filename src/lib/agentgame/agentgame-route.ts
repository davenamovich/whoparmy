import { NextResponse } from "next/server";
import { AgentgameError } from "./agentgame";

const defaults = [
  "https://thebtcexperiment.com",
  "https://www.thebtcexperiment.com",
  "https://thebtcexperiment.pages.dev",
  "https://btc-or-no-btc.pages.dev",
  "https://www.plunderandriffle.com",
  "https://plunderandriffle.com",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://127.0.0.1:8080",
];

export function agAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  const allowed = (process.env.AGENTGAME_ORIGINS || defaults.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
}

export function agJson(req: Request, body: unknown, status = 200): NextResponse {
  const origin = agAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return NextResponse.json(body, { status, headers });
}

export function agOptions(req: Request): NextResponse {
  const origin = agAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  const response = new NextResponse(null, { status: 204, headers });
  if (origin) {
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

export function agError(req: Request, err: unknown): NextResponse {
  if (err instanceof AgentgameError) return agJson(req, { error: err.code }, err.status);
  console.error("[agentgame] request failed", err);
  return agJson(req, { error: "agentgame_failed" }, 500);
}

/** Tiny process-local rate limit (same pattern as btcgame session route):
 *  returns true when the caller is over the limit. The reward caps in the
 *  game logic are where value is actually controlled. */
const buckets = new Map<string, number[]>();
export function agRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

export function agClientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
