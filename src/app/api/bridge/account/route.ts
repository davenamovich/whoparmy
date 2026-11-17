import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getBridgeAccountView } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * GET /api/bridge/account — the signed-in member's bridge state: their
 * P&R credit balance (on their own key, read through the bot bridge),
 * this cycle's grant, and their bridge tokens. This is the member's
 * credit access at whop.plunderandriffle.com. No key or token value is
 * ever in this response — token rows carry budgets and spend only.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    return NextResponse.json(
      { account: await getBridgeAccountView(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your bridge account" },
      { status: 500 },
    );
  }
}
