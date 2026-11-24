import { NextRequest, NextResponse } from "next/server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { createFeeIntent, MarketplaceError } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  try { const body = await req.json(); if (typeof body.slug !== "string") throw new MarketplaceError("slug is required."); return NextResponse.json(await createFeeIntent(userId, body.slug)); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create fee intent." }, { status: err instanceof MarketplaceError ? err.status : 500 }); }
}
