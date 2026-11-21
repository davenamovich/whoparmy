import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, getBatchCsv } from "@/lib/btc-payouts";

export const runtime = "nodejs";

/**
 * GET /api/admin/btc/batches/[id]/csv — the wallet-ready export of
 * an APPROVED batch: address, amount_btc, amount_sats, member.
 * Dave pays from his own wallet; the app never sends BTC.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id } = await params;
    const csv = await getBatchCsv(id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="btc-payout-${id}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not export the batch" }, { status: 500 });
  }
}
