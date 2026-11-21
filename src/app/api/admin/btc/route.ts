import { NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, getAdminOverview } from "@/lib/btc-payouts";

export const runtime = "nodejs";

/**
 * GET /api/admin/btc — the whole Real BTC section in one read:
 * ledger + balance, funding entries, the collection toggle state,
 * the address roster, and every payout batch with its lines.
 * Designated-operator session only; everyone else gets a 404.
 */
export async function GET() {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const overview = await getAdminOverview();
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not load the Real BTC section" }, { status: 500 });
  }
}
