import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getBridgeState } from "@/lib/bridge";
import { recordLinkClick } from "@/lib/link-clicks";

/**
 * The Your Links "Sign up" button (Dave, 2026-11-19): each offer on
 * the Your Links page (/your-links, restored 2026-11-27) carries the
 * member's REFERRER's link for that offer (house link as fallback).
 * This route resolves that destination server-side from the member's
 * bridge state — never from a client-supplied URL — records the click
 * against the link's owner, and 302s to the offer. A partner with no
 * real sign-up URL bounces back to /your-links.
 */
export async function GET(req: NextRequest) {
  const partner = req.nextUrl.searchParams.get("partner") ?? "";
  try {
    const user = await getWhopUser();
    const state = await getBridgeState(user.id);
    const offer = state.partners.find((p) => p.key === partner);
    if (!offer?.signupUrl) {
      return NextResponse.redirect(new URL("/your-links", req.nextUrl.origin), 302);
    }
    await recordLinkClick({
      ownerUserId: offer.signupOwnerId,
      partner: offer.key,
      source: "signup",
      visitorUserId: user.id,
    });
    return NextResponse.redirect(offer.signupUrl, 302);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.redirect(new URL("/your-links", req.nextUrl.origin), 302);
    }
    return NextResponse.redirect(new URL("/your-links", req.nextUrl.origin), 302);
  }
}
