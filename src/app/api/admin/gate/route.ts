import { NextRequest, NextResponse } from "next/server";
import { getGateState, getSessionOperator, setGate } from "@/lib/site-gate";

export const runtime = "nodejs";

/**
 * POST /api/admin/gate { on: boolean } — flip the site gate.
 * Designated-operator session only. Refused when SITE_GATE env is set:
 * the env override wins over the DB, so a DB write would be a lie.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = await getGateState();
  if (current.source === "env") {
    return NextResponse.json(
      { error: "The gate is locked by the SITE_GATE environment variable on this deployment.", code: "ENV_LOCKED" },
      { status: 409 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { on?: unknown };
  if (typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Body must be { on: boolean }" }, { status: 400 });
  }
  const state = await setGate(body.on);
  return NextResponse.json({ gate: state }, { headers: { "Cache-Control": "no-store" } });
}
