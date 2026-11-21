import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { previewRun } from "@/lib/btc-payouts";
import { DEFAULT_PAYOUT_BPS } from "@/lib/btc-payouts-logic";

export const runtime = "nodejs";

/**
 * GET /api/admin/btc/batches/preview?payoutBps=5000
 * The algo's numbers against the live pool, with NO writes: pool
 * balance, eligible member count, distributable, per-member sats,
 * and the undistributed remainder. The create-run form previews
 * with this before anything is created; an ineligible pool comes
 * back as { ok: false, error } with the refusal reason.
 */
export async function GET(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = req.nextUrl.searchParams.get("payoutBps");
  const payoutBps = raw === null ? DEFAULT_PAYOUT_BPS : Number(raw);
  const result = await previewRun(payoutBps);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
