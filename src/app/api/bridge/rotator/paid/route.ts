import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { createIntent, getMyPaidSlotData } from "@/lib/paid-slots-server";

export async function GET() {
  try { const user = await getWhopUser(); return NextResponse.json(await getMyPaidSlotData(user.id)); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load paid slots" }, { status: err instanceof UnauthorizedError ? 401 : 500 }); }
}
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = await req.json() as { date?: unknown; partner?: unknown };
    return NextResponse.json({ intent: await createIntent(user.id, { date: body.date, partner: body.partner }) });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create purchase intent" }, { status: err instanceof UnauthorizedError ? 401 : 400 }); }
}
