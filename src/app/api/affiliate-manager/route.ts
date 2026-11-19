import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getAffiliateState } from "@/lib/bridge";

/**
 * The Affiliate Manager (member view): every offer, whether the
 * member signed up (saved their link), and the free rotator day
 * each signup earned. Reading it backfills placements for links
 * saved before placements existed.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json({ affiliate: await getAffiliateState(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your offers" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
