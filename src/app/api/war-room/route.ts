import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getGameState } from "@/lib/game";
import { getEffectiveTiers } from "@/lib/llm-policy";

export const runtime = "nodejs";

/** War Room state for the signed-in member: rank, XP, streak, Energy
 *  (plan allowance vs real usage), missions, badges, model tiers. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const state = await getGameState(user.id, user.plan);
    // The tier board shows the EFFECTIVE routing policy (operator
    // overrides included), not just the code defaults.
    const effective = await getEffectiveTiers().catch(() => null);
    if (effective) {
      const byKey = new Map(effective.map((t) => [t.key, t.model]));
      const patched = { ...state, tiers: state.tiers.map((t) => ({ ...t, model: byKey.get(t.key) ?? t.model })) };
      return NextResponse.json({ game: patched });
    }
    return NextResponse.json({ game: state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load War Room" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
