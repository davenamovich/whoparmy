import { NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { whopPublicStatus } from "@/lib/whop";

export const runtime = "nodejs";

/**
 * GET /api/auth/session — current auth state for the UI.
 * Never exposes secrets: only identity display fields + public config booleans.
 */
export async function GET() {
  try {
    const { user, mode } = await getWhopUserWithMode();
    const plan = getPlan(user.plan);
    return NextResponse.json({
      mode, // "whop" = signed in via Whop OAuth | "operator" = sandbox/dev fallback
      user: {
        id: user.id,
        name: user.name,
        email: mode === "whop" ? user.email : null, // operator placeholder email is not meaningful in UI
        whopUsername: user.whopUsername,
        whopAvatarUrl: user.whopAvatarUrl,
        whopId: mode === "whop" ? user.whopId : null,
        plan: plan.key,
        planName: plan.name,
        planSource: user.planSource,
      },
      whop: whopPublicStatus(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve session" },
      { status: 500 },
    );
  }
}
