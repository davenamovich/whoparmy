import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { BtcAdminError, getBatchDetail, transitionBatch } from "@/lib/btc-payouts";

export const runtime = "nodejs";

/**
 * GET  /api/admin/btc/batches/[id] — one batch with member-labelled lines.
 * PATCH /api/admin/btc/batches/[id] { action: "approve" | "cancel" | "paid", txid? }
 * The state machine lives in lib/btc-payouts(-logic): no DRAFT→PAID,
 * PAID requires a txid, double-approve is refused.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id } = await params;
    const batch = await getBatchDetail(id);
    return NextResponse.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not load the batch" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; txid?: unknown };
    if (typeof body.action !== "string") {
      return NextResponse.json({ error: "Body must be { action: 'approve' | 'cancel' | 'paid', txid? }" }, { status: 400 });
    }
    await transitionBatch(id, body.action, body.txid);
    const batch = await getBatchDetail(id);
    return NextResponse.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BtcAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not update the batch" }, { status: 500 });
  }
}
