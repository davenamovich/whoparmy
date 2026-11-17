import { NextRequest, NextResponse } from "next/server";
import { BRIDGE_TOKEN_TTL_MS, BridgeError, exchangeBridgeCode } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * POST /api/bridge/exchange { code } — the member's Muse trades the
 * one-time bridge code for the 7-day bridge token. This is the ONLY
 * response in the app that carries a bridge token, and it carries it
 * once, to the agent the member pasted the code to. The token is not a
 * P&R key: it spends nothing outside /api/bridge/mcp's allowlist and
 * budget, and the member can revoke it from /muse-week at any time.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const out = await exchangeBridgeCode(typeof body.code === "string" ? body.code : "");
    return NextResponse.json(
      {
        bridge_token: out.token,
        token_type: "Bearer",
        expires_in: Math.floor(BRIDGE_TOKEN_TTL_MS / 1000),
        expires_at: out.expiresAt,
        budget_credits: out.budgetCredits,
        scope: "connected",
        mcp_url: "https://whop.plunderandriffle.com/api/bridge/mcp",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BridgeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: "Exchange failed" }, { status: 500 });
  }
}
