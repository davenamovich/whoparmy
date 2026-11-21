import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, createBatch } from "@/lib/btc-payouts";
import { DEFAULT_PAYOUT_BPS } from "@/lib/btc-payouts-logic";

export const runtime = "nodejs";

/**
 * POST /api/admin/btc/batches { payoutBps?, note? }
 * Create a payout run (DRAFT) FROM THE POOL: the total is computed
 * by the algo — floor(balance × payoutBps / 10000), split equally
 * across members with a saved payout address — never typed as an
 * absolute amount. payoutBps defaults to 5000 (50%). The response
 * carries the full plan (distributable, per-member, remainder) so
 * the admin sees exactly what the algo did.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { payoutBps?: unknown; note?: unknown };
    const payoutBps = body.payoutBps === undefined ? DEFAULT_PAYOUT_BPS : body.payoutBps;
    if (typeof payoutBps !== "number") {
      return NextResponse.json({ error: "Body must be { payoutBps?: number, note? }" }, { status: 400 });
    }
    const result = await createBatch({
      payoutBps,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json(
      { batch: result.batch, plan: result.plan },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not create the payout run" }, { status: 500 });
  }
}
