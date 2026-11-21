import { NextRequest, NextResponse } from "next/server";
import { resolveMarketLaunch } from "@/lib/rotator-market-server";

export const runtime = "nodejs";

/**
 * PUBLIC — a marketplace launch (Whop Army 2.0, Slice 5).
 * GET /api/rotator/launch?partner=<key> records a counted click hop
 * in the RotatorHop ledger (surface ROTATOR_PAGE) and 302s to the
 * placement's real destination, resolved SERVER-SIDE from today's
 * rotator pool — a destination URL is never accepted from the query
 * string. The house partner ("the-btc-experiment") resolves to
 * https://www.thebtcexperiment.com. Unknown partner → /rotator.
 */
export async function GET(req: NextRequest) {
  const partner = req.nextUrl.searchParams.get("partner") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  const meta = { ip, ua: req.headers.get("user-agent"), referer: req.headers.get("referer") };
  try {
    const url = partner ? await resolveMarketLaunch(partner, meta) : null;
    if (url) return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[rotator-market] launch failed:", err);
  }
  return NextResponse.redirect(new URL("/rotator", req.nextUrl.origin), 302);
}
