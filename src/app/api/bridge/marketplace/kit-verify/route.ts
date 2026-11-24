import { NextRequest, NextResponse } from "next/server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { verifyKitIntent } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  try { const body = await req.json(); if (typeof body.intentId !== "string" || typeof body.txHash !== "string") return NextResponse.json({ error: "intentId and txHash are required." }, { status: 400 }); const result = await verifyKitIntent(userId, body.intentId, body.txHash); return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.reason }, { status: 400 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace request failed." }, { status: 500 }); }
}
