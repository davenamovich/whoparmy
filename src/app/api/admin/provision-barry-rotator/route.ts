import { NextResponse } from "next/server";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { ensureBarryRotatorForOperator } from "@/lib/barry-agent";

export const runtime = "nodejs";

/**
 * OPERATOR ONLY — provision BTC Barry's rotator (Dave, 2026-11-21).
 *
 * POST runs ensureBarryRotator for the REQUESTING operator: first
 * pull their links from their P&R record (the MCP offers catalog —
 * create-only, lib/operator-catalog-seed.ts), then find-or-create
 * the AgentRotator on their own btc-barry record (the shared
 * creation path, lib/rotator-v2.ts ensureAgentRotatorRow) and add-
 * only sync its destinations from their saved EngineLinks. Returns
 * the plain summary the /admin card prints. Idempotent — Dave taps
 * it once; after that the launch + agent-kit wiring keeps Barry's
 * rotator provisioned on its own. Members get 403: their agents
 * provision through the owner rotator API, never here.
 */
async function requireOperator() {
  const { user, mode } = await getWhopUserWithMode();
  if (mode !== "operator") return { error: "Operator only" as const, status: 403 as const };
  return { user };
}

export async function POST() {
  try {
    const gate = await requireOperator();
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const summary = await ensureBarryRotatorForOperator(gate.user.id);
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not provision Barry's rotator" },
      { status: 500 },
    );
  }
}
