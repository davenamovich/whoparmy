import { NextRequest, NextResponse } from "next/server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { listMySubmissions } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  try { return NextResponse.json({ submissions: await listMySubmissions(userId) }); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load submissions." }, { status: 500 }); }
}
