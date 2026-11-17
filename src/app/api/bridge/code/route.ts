import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { BridgeError, WEEK_BUDGET_CREDITS, getMemberEngineKey, mintBridgeCode } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * POST /api/bridge/code — the signed-in member generates the one-time
 * bridge code that goes inside the one command on /muse-week.
 * Generating a code also proves the member's P&R link works (their own
 * key is fetched bot-side) so a dead connection fails here, not inside
 * their Muse. The code is shown once; only its hash is stored.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    await getMemberEngineKey(user);
    const body = (await req.json().catch(() => ({}))) as { budgetCredits?: unknown };
    const budget = typeof body.budgetCredits === "number" ? body.budgetCredits : WEEK_BUDGET_CREDITS;
    const minted = await mintBridgeCode(user.id, budget);
    return NextResponse.json(
      { code: minted.code, expiresAt: minted.expiresAt, budgetCredits: minted.budgetCredits },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BridgeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate a bridge code" },
      { status: 500 },
    );
  }
}
