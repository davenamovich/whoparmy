import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { submitPaidTx } from "@/lib/paid-slots-server";

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = await req.json() as { intentId?: unknown; txHash?: unknown };
    if (typeof body.intentId !== "string" || typeof body.txHash !== "string") return NextResponse.json({ ok: false, reason: "intentId and txHash are required" }, { status: 400 });
    const result = await submitPaidTx(user.id, body.intentId, body.txHash);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) { return NextResponse.json({ ok: false, reason: err instanceof Error ? err.message : "Could not submit payment" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
