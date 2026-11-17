import { NextResponse } from "next/server";
import { getRotatorDestination } from "@/lib/rotator";

/**
 * PUBLIC — the rotator itself. Every "no sign up link" CTA points
 * here; it 302s to today's destination: the confirmed auction
 * winner's saved link, or the day's deterministic house offer.
 */
export async function GET() {
  const destination = await getRotatorDestination();
  return NextResponse.redirect(destination.url, 302);
}
