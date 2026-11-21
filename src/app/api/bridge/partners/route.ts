import { NextResponse } from "next/server";
import { getOfferCatalog } from "@/lib/offer-catalog-server";

/**
 * PUBLIC — the partner catalog for the landing page and the
 * not-connected bridge teaser. Served from the P&R MCP
 * (list_my_offers, house key) via lib/offer-catalog-server — key =
 * the MCP `step`, name/blurb/example from the P&R record, plus the
 * local Muse extra. No member state; the member's own links stay
 * behind the session.
 */
export async function GET() {
  const partners = await getOfferCatalog();
  return NextResponse.json(
    { partners },
    { headers: { "Cache-Control": "public, max-age=900" } },
  );
}
