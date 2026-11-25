import { NextRequest, NextResponse } from "next/server";
import { getRotatorDestination } from "@/lib/rotator";
import { recordLinkClick } from "@/lib/link-clicks";
import { recordRotatorHop } from "@/lib/rotator-v2";
import { appendRefToGameUrl, validRefCode } from "@/lib/rotator-house";

/**
 * PUBLIC — the rotator itself. Every "no sign up link" CTA points
 * here; it 302s to today's destination: the confirmed auction
 * winner's saved link, or the day's deterministic house offer.
 * Each served redirect is recorded as a click for the member whose
 * link was featured (house destinations credit nobody).
 */
export async function GET(req: NextRequest) {
  const destination = await getRotatorDestination();
  await recordLinkClick({
    ownerUserId: destination.pickUserId,
    partner: destination.partner,
    source: "rotator",
  });
  if (destination.agentId && destination.agentRotatorLinkId) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
    await recordRotatorHop({
      surface: "ALLOCATOR",
      rotatorId: destination.agentRotatorId ?? null,
      agentId: destination.agentId,
      userId: destination.pickUserId,
      linkId: destination.agentRotatorLinkId,
      code: "allocator",
      meta: { ip, ua: req.headers.get("user-agent"), referer: req.headers.get("referer") },
    });
  }
  // Referrer carry-through (Dave, 2026-11-24): a ?ref= on this door
  // rides into the BTC Experiment game destination only, so the
  // visitor's game session attributes to their referrer until they
  // get their own links in Muse. Offer URLs pass through untouched.
  const ref = validRefCode(req.nextUrl.searchParams.get("ref"));
  return NextResponse.redirect(appendRefToGameUrl(destination.url, ref), 302);
}
