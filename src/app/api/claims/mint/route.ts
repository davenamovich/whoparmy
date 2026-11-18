import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { CLAIM_MAX_AMOUNT, claimSecret, mintClaimToken } from "@/lib/claims";

export const runtime = "nodejs";

/**
 * Operator-only win-token minter (see lib/claims.ts and
 * docs/CLAIM-BRIDGE.md). The game backends mint with the shared
 * secret on their own side; this route exists so the operator can
 * issue a win by hand — a prize owed, a test token, a make-good —
 * without touching a database. Same operator rule as LLM Control:
 * a designated Whop login only; the anonymous fallback never mints.
 */
export async function POST(req: NextRequest) {
  try {
    const { mode, viaFallback } = await getWhopUserWithMode();
    if (mode !== "operator" || (viaFallback && process.env.ALLOW_OPERATOR_FALLBACK !== "1")) {
      return NextResponse.json({ error: "Minting claim tokens is operator-only." }, { status: 403 });
    }
    if (!claimSecret()) {
      return NextResponse.json({ error: "Claims are not configured on this deployment yet (CLAIM_BRIDGE_SECRET missing)." }, { status: 503 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      amount?: unknown;
      source?: unknown;
      ttlSeconds?: unknown;
    };
    const amount = Math.floor(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > CLAIM_MAX_AMOUNT) {
      return NextResponse.json({ error: `Amount must be 1–${CLAIM_MAX_AMOUNT} free generations.` }, { status: 400 });
    }
    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 40) : "operator";
    const ttlSeconds =
      typeof body.ttlSeconds === "number" && body.ttlSeconds > 0 ? Math.floor(body.ttlSeconds) : undefined;
    const token = mintClaimToken({ amount, source, ttlSeconds });
    const claimUrl = `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://whop.plunderandriffle.com").replace(/\/$/, "")}/claim?code=${encodeURIComponent(token)}`;
    return NextResponse.json({ token, claimUrl, amount, source }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Mint failed" }, { status: 500 });
  }
}
