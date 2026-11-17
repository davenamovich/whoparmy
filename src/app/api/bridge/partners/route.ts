import { NextResponse } from "next/server";
import { BRIDGE_PARTNERS } from "@/lib/bridge";

/**
 * PUBLIC — the bridge partner catalog (names, blurbs, house example
 * links) for the landing page and the not-connected bridge teaser.
 * No member state; the member's own links stay behind the session.
 */
export async function GET() {
  return NextResponse.json(
    { partners: BRIDGE_PARTNERS },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
