import { NextResponse } from "next/server";
import { getWhopUserWithMode } from "@/lib/auth";
import { getAssessmentsProduct, checkAssessmentAccess, isWhopApiConfigured } from "@/lib/whop";

export const runtime = "nodejs";

/**
 * GET /api/whop/assessments — the AI Assessments product check.
 *
 * Always returns the product/plan/checkout identifiers for the $999 AI
 * Assessments Whop product (prod_375J8KgxlSmT1 / plan_s98ZsXPvBxNpO,
 * created 2026-11-18). When the viewer is signed in with a real Whop
 * account, it also runs the live product access check against Whop
 * (GET /api/v1/users/{id}/access/{productId}) so the UI can show
 * owned / not-owned for THIS user. Signed-out and operator-fallback
 * viewers get hasAccess: null — no check is run for them.
 */
export async function GET() {
  const product = getAssessmentsProduct();
  const base = {
    ...product,
    price: { amount: 999, currency: "usd", type: "one_time" },
    apiConfigured: isWhopApiConfigured(),
  };

  try {
    const { user, mode, viaFallback } = await getWhopUserWithMode();
    const realWhopUser =
      mode === "whop" && !viaFallback && Boolean(user.whopId) && !String(user.whopId).startsWith("demo-");
    if (!realWhopUser) {
      return NextResponse.json({
        ...base,
        viewer: { signedIn: false, hasAccess: null, accessLevel: null },
      });
    }
    if (!base.apiConfigured) {
      return NextResponse.json({
        ...base,
        viewer: { signedIn: true, hasAccess: null, accessLevel: null, error: "WHOP_API_KEY is not configured" },
      });
    }
    const access = await checkAssessmentAccess(String(user.whopId));
    return NextResponse.json({
      ...base,
      viewer: { signedIn: true, hasAccess: access.has_access, accessLevel: access.access_level },
    });
  } catch (err) {
    return NextResponse.json(
      { ...base, viewer: { signedIn: null, hasAccess: null, accessLevel: null, error: String(err instanceof Error ? err.message : err).slice(0, 200) } },
      { status: 200 },
    );
  }
}
