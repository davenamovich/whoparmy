import { NextRequest, NextResponse } from "next/server";
import { getFreeDay } from "@/lib/free-day-server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  if (!bearer || !await verifyAnyBridgeToken(bearer)) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
  try {
    return NextResponse.json({ freeDay: await getFreeDay() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[free-day] Today lookup failed:", error);
    return NextResponse.json({ error: "Could not load Free Day." }, { status: 500 });
  }
}
