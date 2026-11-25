import { NextResponse } from "next/server";
import { verifyUpdateToken } from "@/lib/muse-bridge";
import { confirmFoundation } from "@/lib/build-agent-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const verified = await verifyUpdateToken(token);
  if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const body = await request.json().catch(() => ({})) as { provenAt?: unknown };
  const state = await confirmFoundation(verified.userId, typeof body.provenAt === "string" ? body.provenAt : undefined);
  return NextResponse.json({ lane: state.foundation?.lane, mcpProvenAt: state.foundation?.mcpProvenAt }, { headers });
}
