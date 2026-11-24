import { NextRequest, NextResponse } from "next/server";
import { drainBattery } from "@/lib/marketplace-server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const secret = process.env.MARKETPLACE_BATTERY_SECRET ?? "";
  if (!secret || req.headers.get("x-battery-secret") !== secret) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  try { return NextResponse.json(await drainBattery(20)); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Battery drain failed." }, { status: 500 }); }
}
