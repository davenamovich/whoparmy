import { NextResponse } from "next/server";
import { loadMarketToday } from "@/lib/rotator-market-server";

export const runtime = "nodejs";

/**
 * PUBLIC — the rotator marketplace for today (Whop Army 2.0, Slice 5).
 * Today's ACTIVE placements from the EXISTING daily rotator (auction
 * winner first, then free placements), the derived inventory state
 * for today + the next two days, the next 23:50 ET bidding close, and
 * today's counted impressions/launches from the RotatorHop ledger.
 * On a day with no live placement the single house entry is The BTC
 * Experiment (Dave, 2026-11-21) — see lib/rotator-market-server.ts.
 * Public-safe serialization only: partner, display name, host —
 * never user ids, emails, or full destination URLs.
 */
export async function GET() {
  try {
    const { view } = await loadMarketToday();
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rotator marketplace unavailable" },
      { status: 500 },
    );
  }
}
