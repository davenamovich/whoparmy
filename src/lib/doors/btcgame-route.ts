import { NextResponse } from "next/server";
import { BtcgameError } from "./btcgame";

const defaults = ["https://btc-or-no-btc.pages.dev", "https://www.plunderandriffle.com", "https://plunderandriffle.com", "http://localhost:8080", "http://localhost:3000", "http://127.0.0.1:8080"];

export function btcAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  const allowed = (process.env.BTCGAME_GAME_ORIGINS || defaults.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
}

export function btcJson(req: Request, body: unknown, status = 200): NextResponse {
  const origin = btcAllowedOrigin(req);
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return NextResponse.json(body, { status, headers });
}

export function btcOptions(req: Request): NextResponse {
  const origin = btcAllowedOrigin(req);
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

export function btcError(req: Request, err: unknown): NextResponse {
  if (err instanceof BtcgameError) return btcJson(req, { error: err.code }, err.status);
  console.error("[btcgame] request failed", err);
  return btcJson(req, { error: "btcgame_failed" }, 500);
}
