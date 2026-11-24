import { NextRequest, NextResponse } from "next/server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { getBundle } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  return NextResponse.json(await getBundle(userId));
}
