import { NextResponse } from "next/server";
import { exchangeBridgeKeyClaim } from "@/lib/muse-bridge";
import { markFoundationClaimed } from "@/lib/build-agent-server";
import { KeyClaimError, KEY_CLAIM_REFUSAL, logKeyClaimFailure } from "@/lib/key-claim-core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      logKeyClaimFailure("request_invalid");
      return NextResponse.json({ error: KEY_CLAIM_REFUSAL }, { status: 401, headers });
    }
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const out = await exchangeBridgeKeyClaim(typeof body.code === "string" ? body.code : "", token);
    await markFoundationClaimed(out.userId).catch(() => logKeyClaimFailure("foundation_write_failed"));
    return NextResponse.json({ key: out.key, plan: out.plan, credits: out.credits, period: out.period }, { headers });
  } catch (error) {
    if (error instanceof KeyClaimError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    logKeyClaimFailure("unexpected_error");
    return NextResponse.json({ error: "Could not exchange the durable key claim. Try again later." }, { status: 500, headers });
  }
}
