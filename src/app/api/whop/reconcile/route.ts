import { NextRequest, NextResponse } from "next/server";
import { reconcileWhopPayments } from "@/lib/whop-reconcile";

export const runtime = "nodejs";

export async function handleReconcileRequest(req: Pick<NextRequest, "headers">, reconcile = reconcileWhopPayments) {
  const secret = process.env.RECONCILE_SECRET ?? "";
  if (!secret || req.headers.get("x-reconcile-secret") !== secret) return NextResponse.json({ error: "Not authorised." }, { status: 403 });
  try { return NextResponse.json(await reconcile()); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Reconciliation failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) { return handleReconcileRequest(req); }
