import { NextRequest, NextResponse } from "next/server";
import { claimFreeDay } from "@/lib/free-day-server";
import { MarketplaceError } from "@/lib/marketplace-server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = bearer ? await verifyAnyBridgeToken(bearer) : null;
  if (!credential) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  const userId = credential.kind === "spend" ? credential.session.user.id : credential.userId;
  const raw = await req.text();
  let body: { date?: unknown } = {};
  if (raw.trim()) {
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.date !== undefined && (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)))) {
      return NextResponse.json({ error: "Expected a Free-Day date in YYYY-MM-DD format." }, { status: 400 });
    }
  }
  try {
    return NextResponse.json({ claim: await claimFreeDay(userId, typeof body.date === "string" ? body.date : undefined) });
  } catch (error) {
    if (error instanceof MarketplaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[free-day] Claim failed:", error);
    return NextResponse.json({ error: "Could not claim Free Day." }, { status: 500 });
  }
}
