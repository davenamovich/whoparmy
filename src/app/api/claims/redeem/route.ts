import { NextRequest, NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { claimSecret, redeemClaim } from "@/lib/claims";

export const runtime = "nodejs";

/**
 * Claim a static-page win (see lib/claims.ts). The win pays into a
 * real member's balance, so the anonymous fallback session — a
 * shared placeholder account — cannot claim: a real Whop sign-in
 * (or a designated operator) is required.
 */
export async function POST(req: NextRequest) {
  try {
    if (!claimSecret()) {
      return NextResponse.json({ error: "Claims are not configured on this deployment yet." }, { status: 503 });
    }
    const { user, viaFallback } = await getWhopUserWithMode();
    if (viaFallback) {
      return NextResponse.json(
        { error: "Sign in with Whop first — a win can only be paid into your own account.", needsSignIn: true },
        { status: 401 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    if (typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json({ error: "Paste your claim code." }, { status: 400 });
    }
    const result = await redeemClaim(user.id, body.token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Claim failed" }, { status: 500 });
  }
}
