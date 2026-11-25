import { NextRequest, NextResponse } from "next/server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";
import { getBundleKit, MarketplaceError } from "@/lib/marketplace-server";
export const runtime = "nodejs";
/**
 * First-purchase bundle kit download (2026-11-25): a bundle-granted
 * buyer's Muse fetches the real replicator + demo-recording skill
 * files here. Gated on the grant inside getBundleKit — a non-granted
 * member gets { error: "not_granted", bundle } and no files, the same
 * shape as the M3 kit route's not_purchased result.
 */
export async function GET(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  try { return NextResponse.json(await getBundleKit(userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace request failed." }, { status: error instanceof MarketplaceError ? error.status : 500 }); }
}
