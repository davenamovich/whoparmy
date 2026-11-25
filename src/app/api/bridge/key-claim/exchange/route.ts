import { NextResponse } from "next/server";
import { exchangeBridgeKeyClaim } from "@/lib/muse-bridge";
import { markFoundationClaimed } from "@/lib/build-agent-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const body = await request.json() as { code?: unknown };
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const out = await exchangeBridgeKeyClaim(typeof body.code === "string" ? body.code : "", token);
    await markFoundationClaimed(out.userId);
    return NextResponse.json({ key: out.key, plan: out.plan, credits: out.credits, period: out.period }, { headers });
  } catch { return NextResponse.json({ error: "That key claim is not valid." }, { status: 401, headers }); }
}
