import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getGameState } from "@/lib/game";

export const runtime = "nodejs";

/** War Room state for the signed-in member: rank, XP, streak, Energy
 *  (plan allowance vs real usage), missions, badges, model tiers. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const state = await getGameState(user.id, user.plan);
    return NextResponse.json({ game: state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load War Room" },
      { status: 500 },
    );
  }
}
