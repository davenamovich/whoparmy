import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { stackById } from "@/lib/stacks";
import { ensureBarryAgent } from "@/lib/barry-agent";
import { fillStackPrompt } from "@/lib/stack-prompt";
import { ownBalanceBudget } from "@/lib/experiment-scope";
import {
  BridgeError,
  MAX_BUDGET_CREDITS,
  assertExperimentEligible,
  getMemberEngineKey,
  mintBridgeCode,
} from "@/lib/muse-bridge";

export const runtime = "nodejs";

const STACK_ID = "btc-experiment";

/**
 * POST /api/bridge/agent — the member's own agent kit (Dave,
 * 2026-11-20: "they need their agent first before they go to bridge";
 * the saved DH Media link is what unlocks it, not the Whop plan).
 *
 * The member-facing twin of /api/admin/launch for the BTC Experiment
 * stack: the SIGNED-IN member's account, the "experiment" scope (any
 * plan, own balance, 24-hour code — lib/experiment-scope.ts), and the
 * same prompt builder (lib/stack-prompt.ts), so what /bridge hands
 * out, what an operator launches and what /connect/<code> shows an
 * agent are one text. Minting retires any unused code first
 * (mintBridgeCode), so calling again is how a member gets a fresh one.
 */
export async function POST() {
  try {
    const user = await getWhopUser();
    const stack = stackById(STACK_ID);
    if (!stack?.promptTemplate || stack.bridgeScope !== "experiment") {
      return NextResponse.json({ error: "The agent kit is not available right now." }, { status: 503 });
    }
    await assertExperimentEligible(user);
    const member = await getMemberEngineKey(user);
    const minted = await mintBridgeCode(user.id, ownBalanceBudget(member.credits, MAX_BUDGET_CREDITS), "experiment");
    // Barry's roster row (lib/barry-agent.ts) — best-effort, exactly as
    // the operator launcher does it: bookkeeping must never eat a code
    // that already minted.
    try {
      await ensureBarryAgent(user.id, user.plan);
    } catch (err) {
      console.error("[bridge/agent] ensureBarryAgent failed:", err);
    }
    const prompt = await fillStackPrompt(stack, user, minted.code);
    return NextResponse.json(
      {
        code: minted.code,
        expiresAt: minted.expiresAt,
        budgetCredits: minted.budgetCredits,
        connectUrl: `https://whop.plunderandriffle.com/connect/${minted.code}`,
        prompt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof BridgeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not make your agent kit" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
