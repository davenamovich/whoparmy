import { NextRequest, NextResponse } from "next/server";
import { resolveMarketLaunch } from "@/lib/rotator-market-server";
import { FREE_DAY_BILLBOARD } from "@/lib/free-day-core";
import { getFreeDay } from "@/lib/free-day-server";
import { validRefCode } from "@/lib/rotator-house";

export const runtime = "nodejs";

/**
 * PUBLIC — a marketplace launch (Whop Army 2.0, Slice 5).
 * GET /api/rotator/launch?partner=<key> records a counted click hop
 * in the RotatorHop ledger (surface ROTATOR_PAGE) and 302s to the
 * placement's real destination, resolved SERVER-SIDE from today's
 * rotator pool — a destination URL is never accepted from the query
 * string. The house partner ("the-btc-experiment") resolves to the
 * on-site game at /play (Dave, 2026-11-24). Unknown partner → /rotator.
 * A ?ref= from the visitor's referrer (e.g. the agent page they came
 * through) rides into the game redirect only — offer destinations
 * carry their owner's affiliate id already (Dave, 2026-11-24).
 */
export async function GET(req: NextRequest) {
  const partner = req.nextUrl.searchParams.get("partner") ?? "";
  const ref = validRefCode(req.nextUrl.searchParams.get("ref"));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  const meta = { ip, ua: req.headers.get("user-agent"), referer: req.headers.get("referer") };
  try {
    if (partner === FREE_DAY_BILLBOARD) {
      const day = await getFreeDay();
      return NextResponse.redirect(new URL(day?.spaceUrl ?? "/spaces", req.nextUrl.origin), 302);
    }
    const url = partner ? await resolveMarketLaunch(partner, meta, ref) : null;
    if (url) return NextResponse.redirect(url, 302);
  } catch (err) {
    console.error("[rotator-market] launch failed:", err);
  }
  return NextResponse.redirect(new URL("/rotator", req.nextUrl.origin), 302);
}
