import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { setCollectBtcAddresses } from "@/lib/btc-payouts";

export const runtime = "nodejs";

/**
 * POST /api/admin/btc/toggle { on: boolean } — flip BTC payout
 * address collection. ON: /bridge presents the address block as
 * payout collection (required, with a missing-address nudge).
 * OFF: the current optional presentation. Default is OFF.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { on?: unknown };
  if (typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Body must be { on: boolean }" }, { status: 400 });
  }
  const collectOn = await setCollectBtcAddresses(body.on);
  return NextResponse.json({ collectOn }, { headers: { "Cache-Control": "no-store" } });
}
