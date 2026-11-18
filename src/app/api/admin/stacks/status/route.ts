import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { setStackStatus, type StackStatus } from "@/lib/stacks";

export const runtime = "nodejs";

/**
 * POST /api/admin/stacks/status { id, status } — move a stack's
 * release label (draft → building → live). Designated-operator
 * session only. This writes the AppSetting override the dashboard
 * reads; it does not change what members can reach (see lib/stacks.ts).
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  const status = body.status;
  if (typeof body.id !== "string" || (status !== "live" && status !== "building" && status !== "draft")) {
    return NextResponse.json({ error: "Body must be { id: string, status: live|building|draft }" }, { status: 400 });
  }
  try {
    await setStackStatus(body.id, status as StackStatus);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown stack" }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
