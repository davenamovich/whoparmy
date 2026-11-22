import { NextResponse } from "next/server";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { getRotatorSummary } from "@/lib/rotator-market-server";

export const runtime = "nodejs";

/**
 * OPERATOR ONLY — the rotator marketplace summary (Whop Army 2.0,
 * Slice 5): today + the last 7 days of derived inventory states, bid
 * volume in Bid Points, confirmed winners and stakes taken,
 * counted marketplace impressions/launches, and today's active free
 * placements. The financials block is explicitly SIMULATED: paid
 * placements are not live and no money moves in this slice —
 * settlement is Slice 6, separately gated.
 */
export async function GET() {
  try {
    const { mode } = await getWhopUserWithMode();
    if (mode !== "operator") {
      return NextResponse.json({ error: "Operator only" }, { status: 403 });
    }
    return NextResponse.json(await getRotatorSummary());
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load rotator summary" },
      { status: 500 },
    );
  }
}
