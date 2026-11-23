import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import {
  BridgeError,
  MAX_BUDGET_CREDITS,
  WEEK_BUDGET_CREDITS,
  assertBridgeEligible,
  assertClipsEligible,
  bridgeOffer,
  getMemberEngineKey,
  mintBridgeCode,
} from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * POST /api/bridge/code — the signed-in member generates the one-time
 * bridge code that goes inside the prompt they paste to their Muse.
 * Generating a code also proves the member's P&R link works (their own
 * key is fetched bot-side) so a dead connection fails here, not inside
 * their Muse. The code is shown once; only its hash is stored.
 *
 * Two scopes, two products:
 * - default ("week"): every signed-in member, budget from their
 *   current engine credit balance snapshot.
 * - { scope: "clips" }: the Clip Factory — ANY member with a linked
 *   credit account, any plan (assertClipsEligible). The code's budget
 *   snapshots the member's own current credit balance: their credits
 *   are the real limit, so no offer table prices a clips connection.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json().catch(() => ({}))) as { budgetCredits?: unknown; offer?: unknown; scope?: unknown };

    if (body.scope === "clips") {
      assertClipsEligible(user);
      const member = await getMemberEngineKey(user);
      // Snapshot the member's own balance as this connection's budget
      // (an unlimited key, credits = -1, gets the standing max clamp).
      const budget = member.credits < 0 ? MAX_BUDGET_CREDITS : member.credits;
      const minted = await mintBridgeCode(user.id, budget, "clips");
      return NextResponse.json(
        { code: minted.code, expiresAt: minted.expiresAt, budgetCredits: minted.budgetCredits, offer: null, scope: "clips" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const member = await getMemberEngineKey(user);
    // The current engine balance is the full budget; legacy offer
    // request fields are ignored so clients cannot inflate it.
    const offer = null;
    const budget = member.credits < 0 ? MAX_BUDGET_CREDITS : member.credits;
    const minted = await mintBridgeCode(user.id, budget);
    return NextResponse.json(
      { code: minted.code, expiresAt: minted.expiresAt, budgetCredits: minted.budgetCredits, offer: null, scope: "week" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BridgeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate a bridge code" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
