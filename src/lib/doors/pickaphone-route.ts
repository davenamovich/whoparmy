import { NextResponse } from "next/server";
import { PickaphoneError } from "./pickaphone";

const defaults = ["https://muse-doors.pages.dev", "https://www.plunderandriffle.com", "https://plunderandriffle.com", "http://localhost:8080", "http://localhost:3000", "http://127.0.0.1:8080"];

export function papAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  const allowed = (process.env.PICKAPHONE_GAME_ORIGINS || defaults.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
}

export function papJson(req: Request, body: unknown, status = 200): NextResponse {
  const origin = papAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return NextResponse.json(body, { status, headers });
}

export function papOptions(req: Request): NextResponse {
  const origin = papAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  const response = new NextResponse(null, { status: 204, headers });
  if (origin) {
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

export function papError(req: Request, err: unknown): NextResponse {
  if (err instanceof PickaphoneError) return papJson(req, { error: err.code }, err.status);
  console.error("[pickaphone] request failed", err);
  return papJson(req, { error: "pickaphone_failed" }, 500);
}
