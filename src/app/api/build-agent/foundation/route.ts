import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { BridgeError, getMemberEngineKey } from "@/lib/muse-bridge";
import { getBuildFlow } from "@/lib/build-agent-server";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await getWhopUser();
    const flow = await getBuildFlow(user.id);
    try {
      const member = await getMemberEngineKey(user, { fresh: true });
      return NextResponse.json({ keyState: "issued", plan: member.plan, credits: member.credits, granted: member.granted, period: member.period, lane: flow?.foundation?.lane ?? "durable-pending-proof", foundationVerifiedAt: flow?.foundation?.mcpProvenAt ?? null }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = error instanceof BridgeError ? error.code : "UNREACHABLE";
      const keyState = code === "NO_WHOP_ID" || code === "NOT_LINKED" ? "no_whop_id" : code === "NOT_CONFIGURED" ? "not_configured" : code === "BLOCKED" ? "blocked" : "unreachable";
      return NextResponse.json({ keyState, plan: null, credits: null, granted: null, period: null, lane: flow?.foundation?.lane ?? "bridge-only", foundationVerifiedAt: flow?.foundation?.mcpProvenAt ?? null }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
}
