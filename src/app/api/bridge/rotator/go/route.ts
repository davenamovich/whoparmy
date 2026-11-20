import { NextResponse } from "next/server";
import { getRotatorDestination } from "@/lib/rotator";
import { recordLinkClick } from "@/lib/link-clicks";

/**
 * PUBLIC — the rotator itself. Every "no sign up link" CTA points
 * here; it 302s to today's destination: the confirmed auction
 * winner's saved link, or the day's deterministic house offer.
 * Each served redirect is recorded as a click for the member whose
 * link was featured (house destinations credit nobody).
 */
export async function GET() {
  const destination = await getRotatorDestination();
  await recordLinkClick({
    ownerUserId: destination.pickUserId,
    partner: destination.partner,
    source: "rotator",
  });
  return NextResponse.redirect(destination.url, 302);
}
