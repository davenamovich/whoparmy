import { NextRequest, NextResponse } from "next/server";
import { reconcilePaymentPayloads, reconcileWhopPayments } from "@/lib/whop-reconcile";
import type { PaymentPayload } from "@/lib/whop-payments";

export const runtime = "nodejs";

export async function handleReconcileRequest(
  req: Pick<NextRequest, "headers"> & { payments?: unknown },
  reconcile = reconcileWhopPayments,
  reconcilePayloads = reconcilePaymentPayloads,
) {
  const secret = process.env.RECONCILE_SECRET ?? "";
  if (!secret || req.headers.get("x-reconcile-secret") !== secret) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  try {
    const summary = Array.isArray(req.payments)
      ? await reconcilePayloads(req.payments as PaymentPayload[])
      : await reconcile();
    return NextResponse.json(summary);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Reconciliation failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { payments?: unknown } | null;
  return handleReconcileRequest({ headers: req.headers, payments: body?.payments });
}
