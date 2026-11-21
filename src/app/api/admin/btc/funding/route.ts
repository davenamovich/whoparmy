import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, addFundingEntry, getLedgerState } from "@/lib/btc-payouts";
import { btcToSats } from "@/lib/btc-payouts-logic";

export const runtime = "nodejs";

/**
 * POST /api/admin/btc/funding { amountBtc, txid?, note? }
 * Record real BTC Dave has added. The amount arrives as a BTC
 * decimal and is converted to integer sats server-side with strict
 * validation (lib/btc-payouts-logic) — no float ever touches money.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as {
      amountBtc?: unknown;
      txid?: unknown;
      note?: unknown;
    };
    const parsed = btcToSats(body.amountBtc);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const entry = await addFundingEntry({
      amountSats: parsed.sats,
      txid: typeof body.txid === "string" ? body.txid : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    const ledger = await getLedgerState();
    return NextResponse.json({ entry, ledger }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not add the funding entry" }, { status: 500 });
  }
}
