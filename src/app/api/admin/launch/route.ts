import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { stackById } from "@/lib/stacks";
import {
  BridgeError,
  MAX_BUDGET_CREDITS,
  assertBridgeEligible,
  assertClipsEligible,
  bridgeOffer,
  getMemberEngineKey,
  mintBridgeCode,
} from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * POST /api/admin/launch { stackId } — the prompt launcher.
 *
 * Mints a fresh bridge code in the stack's scope for the OPERATOR's
 * own account and returns the stack's prompt with {BRIDGE_CODE}
 * filled in — "hand Muse a prompt that starts it all", for the
 * operator to test or release. Mirrors /api/bridge/code exactly:
 * week scope goes through the week eligibility + the named offer's
 * server-side budget; clips scope snapshots the operator's own
 * credit balance. Designated-operator session only.
 */
export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { stackId?: unknown };
  const stack = typeof body.stackId === "string" ? stackById(body.stackId) : null;
  if (!stack) return NextResponse.json({ error: "Unknown stack" }, { status: 400 });
  if (!stack.promptTemplate || !stack.bridgeScope) {
    return NextResponse.json(
      { error: `${stack.name} has no ignition prompt — it does not launch from here.`, code: "NO_PROMPT" },
      { status: 400 },
    );
  }

  try {
    let minted: { code: string; expiresAt: Date; budgetCredits: number };
    if (stack.bridgeScope === "clips") {
      assertClipsEligible(operator);
      const member = await getMemberEngineKey(operator);
      const budget = member.credits < 0 ? MAX_BUDGET_CREDITS : member.credits;
      minted = await mintBridgeCode(operator.id, budget, "clips");
    } else {
      assertBridgeEligible(operator);
      await getMemberEngineKey(operator);
      const offer = bridgeOffer("week");
      minted = await mintBridgeCode(operator.id, offer.budgetCredits, "week");
    }
    const prompt = stack.promptTemplate.replaceAll("{BRIDGE_CODE}", minted.code);
    return NextResponse.json(
      {
        stackId: stack.id,
        scope: stack.bridgeScope,
        code: minted.code,
        expiresAt: minted.expiresAt,
        budgetCredits: minted.budgetCredits,
        prompt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BridgeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not mint a bridge code" },
      { status: 500 },
    );
  }
}
