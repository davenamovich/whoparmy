import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator } from "@/lib/site-gate";
import { stackById } from "@/lib/stacks";
import { BRIDGE_PARTNERS } from "@/lib/bridge";
import { getSavedDhMediaLink } from "@/lib/btc-addresses";
import { ensureBarryAgent } from "@/lib/barry-agent";
import { getMemberLanguage } from "@/lib/member-language";
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

  // BTC Experiment gate (Flow v2, 2026-11-19): the agent build
  // unlocks only once the member's DH Media link is saved on /bridge.
  // The save is the gate, and access follows the CURRENT saved link —
  // the prompt below is filled from the link saved right now, never
  // from a cached copy. No code is minted for a gated launch.
  let dhMediaLink: string | null = null;
  if (stack.id === "btc-experiment") {
    dhMediaLink = await getSavedDhMediaLink(operator.id);
    if (!dhMediaLink) {
      return NextResponse.json(
        {
          error:
            "The BTC Experiment unlocks when your DH Media link is saved. Save your link on the bridge page first — the agent build follows your current saved link.",
          code: "NEEDS_DH_MEDIA_LINK",
        },
        { status: 400 },
      );
    }
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
    // BTC Barry's agent record (Dave, 2026-11-19): a successful
    // launch is what puts Barry on the member's roster — one
    // HiredAgent row per member, so he holds a Traffic Pool v1
    // allotment like every other agent and shows on their agents
    // view. Only AFTER the gate above passed and the code minted;
    // no other stack creates a record here. Best-effort by design:
    // the record is roster/pool bookkeeping, and a failure must
    // never eat a launch that already minted its bridge code.
    if (stack.id === "btc-experiment") {
      try {
        await ensureBarryAgent(operator.id, operator.plan);
      } catch (err) {
        console.error("[launch] ensureBarryAgent failed:", err);
      }
    }
    let prompt = stack.promptTemplate.replaceAll("{BRIDGE_CODE}", minted.code);
    if (prompt.includes("{MEMBER_NAME}")) {
      prompt = prompt.replaceAll(
        "{MEMBER_NAME}",
        operator.name ?? operator.whopUsername ?? "a Whop Army member",
      );
    }
    if (prompt.includes("{DH_MEDIA_LINK}")) {
      // The gate above guarantees a saved link for the BTC stack; the
      // fallback is Dave's own link (the /bridge placeholder example)
      // for any future template that carries the slot ungated.
      const fallback =
        BRIDGE_PARTNERS.find((p) => p.key === "dh-media")?.example ??
        "https://dh.media/?affid=Vesselprotocol";
      prompt = prompt.replaceAll("{DH_MEDIA_LINK}", dhMediaLink ?? fallback);
    }
    if (prompt.includes("{LANGUAGE}")) {
      // Phase 0 plumbing (Dave, 2026-11-19): the launching member's
      // stored language fills the slot — Barry works in it from the
      // first message.
      const memberLanguage = await getMemberLanguage(operator.id).catch(() => null);
      prompt = prompt.replaceAll("{LANGUAGE}", memberLanguage?.label ?? "English");
    }
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
