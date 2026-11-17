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
    const { user, mode, viaFallback } = await getWhopUserWithMode();
    // "admin" is the REAL operator lock: a designated Whop login
    // (OPERATOR_WHOP_IDS / OPERATOR_WHOP_USERNAMES), not the anonymous
    // fallback session the rest of the app runs on. The client gates
    // operator surfaces (LLM Control) on this — the APIs enforce the
    // same rule server-side regardless.
    const admin = mode === "operator" && (!viaFallback || process.env.ALLOW_OPERATOR_FALLBACK === "1");
    const plan = getPlan(user.plan);
    return NextResponse.json({
      mode,
      admin, // "whop" = signed in via Whop OAuth | "operator" = sandbox/dev fallback
      // The Whop-connection gate (Dave, 2026-11-17): a REAL session
      // resolved — Whop member or designated operator — as opposed to
      // the anonymous operator fallback. Public surfaces (the landing
      // page, the bridge) show their working parts only when this is
      // true; everyone else gets the teaser + Connect with Whop.
      connected: !viaFallback,
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
