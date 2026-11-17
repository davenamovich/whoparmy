import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUserWithMode } from "@/lib/auth";
import { getWhopConfig, whopCheckAccess } from "@/lib/whop";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * POST /api/whop/sync-entitlements — pull the signed-in user's live access
 * from Whop and set the plan tier accordingly.
 *
 * Uses the documented access check:
 *   GET {API_BASE}/api/v1/users/{id}/access/{resource_id}
 *     → { has_access, access_level: customer | admin | no_access }
 *
 * Checks each configured product (prod_xxx) from the highest tier down and
 * stops at the first tier with access (AGENCY > PRO > CREATOR), defaulting
 * to FREE. This is the authoritative fallback when webhooks are missed.
 */
export async function POST(_req: NextRequest) {
  try {
    const { user, mode } = await getWhopUserWithMode();
    const cfg = getWhopConfig();

    if (!cfg.apiKey) {
      return NextResponse.json(
        {
          error: "Entitlement sync requires WHOP_API_KEY (server-side Whop API key from the Developer Dashboard).",
          configured: false,
        },
        { status: 503 },
      );
    }
    if (mode !== "whop" || !user.whopId || user.whopId.startsWith("demo-")) {
      return NextResponse.json(
        { error: "Sign in with Whop first — entitlement sync runs against your verified Whop user id." },
        { status: 400 },
      );
    }

    const tiers: { tier: string; resourceId: string | null }[] = [
      { tier: "AGENCY", resourceId: cfg.productIds.AGENCY },
      { tier: "PRO", resourceId: cfg.productIds.PRO },
      { tier: "CREATOR", resourceId: cfg.productIds.CREATOR },
    ];

    const checks: { tier: string; resourceId: string; has_access: boolean; access_level: string; error?: string }[] = [];
    let resolvedTier: string | null = null;

    for (const t of tiers) {
      if (!t.resourceId) continue;
      try {
        const access = await whopCheckAccess(user.whopId, t.resourceId);
        checks.push({ tier: t.tier, resourceId: t.resourceId, has_access: access.has_access, access_level: access.access_level });
        if (access.has_access && !resolvedTier) resolvedTier = t.tier;
      } catch (err) {
        checks.push({ tier: t.tier, resourceId: t.resourceId, has_access: false, access_level: "error", error: err instanceof Error ? err.message : "check failed" });
      }
    }

    const plan = resolvedTier ?? "FREE";
    await db.user.update({
      where: { id: user.id },
      data: { plan, planSource: "whop_access", planUpdatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      plan,
      planName: getPlan(plan).name,
      planSource: "whop_access",
      checks,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Entitlement sync failed" },
      { status: 500 },
    );
  }
}
