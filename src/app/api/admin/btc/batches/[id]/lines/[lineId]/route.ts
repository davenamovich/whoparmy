import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, editLine, getBatchDetail, removeLine } from "@/lib/btc-payouts";

export const runtime = "nodejs";

/**
 * PATCH  /api/admin/btc/batches/[id]/lines/[lineId] { amountSats }
 * DELETE /api/admin/btc/batches/[id]/lines/[lineId]
 * DRAFT batches only. Line amounts are edited in integer sats (the
 * unit lines are stored and displayed in — no decimal conversion,
 * no floats). Edits validate the prospective batch total against
 * the current ledger balance before anything is persisted.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id, lineId } = await params;
    const body = (await req.json().catch(() => ({}))) as { amountSats?: unknown };
    if (typeof body.amountSats !== "number" || !Number.isSafeInteger(body.amountSats) || body.amountSats < 0) {
      return NextResponse.json({ error: "Body must be { amountSats: integer >= 0 }" }, { status: 400 });
    }
    await editLine(id, lineId, body.amountSats);
    const batch = await getBatchDetail(id);
    return NextResponse.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not edit the line" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id, lineId } = await params;
    await removeLine(id, lineId);
    const batch = await getBatchDetail(id);
    return NextResponse.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not remove the line" }, { status: 500 });
  }
}
