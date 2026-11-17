import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUserWithMode } from "@/lib/auth";
import { getWhopConfig, whopCheckAccess, whopListMemberships } from "@/lib/whop";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * POST /api/whop/sync-entitlements — pull the signed-in user's live access
 * from Whop and set the plan tier accordingly.
 *
 * Tier resolution, in order:
 *   1. Plan level — the tiers live on PLANS of one product, and Whop's
 *      access check cannot address a plan (verified 2026-11-17: resource
 *      must be biz_/prod_/exp_). So the user's active memberships are
 *      matched against WHOP_PLAN_ID_* (the same env the webhook's
 *      resolveTier uses), highest tier first.
 *   2. Product level — the documented access check:
 *      GET {API_BASE}/api/v1/users/{id}/access/{resource_id}
 *        → { has_access, access_level: customer | admin | no_access }
 *      over each configured product (prod_xxx), highest tier first.
 * Defaults to FREE. This is the authoritative fallback when webhooks
 * are missed.
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

    const checks: { tier: string; resourceId: string; has_access: boolean; access_level: string; error?: string }[] = [];
    let resolvedTier: string | null = null;

    // 1) Plan level via memberships.
    const planTiers: { tier: string; planId: string | null }[] = [
      { tier: "AGENCY", planId: process.env.WHOP_PLAN_ID_AGENCY?.trim() || null },
      { tier: "PRO", planId: process.env.WHOP_PLAN_ID_PRO?.trim() || null },
      { tier: "CREATOR", planId: process.env.WHOP_PLAN_ID_CREATOR?.trim() || null },
    ];
    if (planTiers.some((p) => p.planId)) {
      try {
        const ACTIVE = new Set(["trialing", "active", "past_due", "completed"]);
        const mine = (await whopListMemberships()).filter(
          (m) => m.userId === user.whopId && ACTIVE.has(m.status),
        );
        for (const p of planTiers) {
          if (!p.planId) continue;
          const hit = mine.some((m) => m.planId === p.planId);
          checks.push({ tier: p.tier, resourceId: p.planId, has_access: hit, access_level: hit ? "customer" : "no_access" });
          if (hit && !resolvedTier) resolvedTier = p.tier;
        }
      } catch (err) {
        checks.push({
          tier: "PLAN_LOOKUP",
          resourceId: "memberships",
          has_access: false,
          access_level: "error",
          error: err instanceof Error ? err.message : "membership lookup failed",
        });
      }
    }

    // 2) Product level via access checks (fallback; skipped once a
    // plan-level tier resolved).
    const tiers: { tier: string; resourceId: string | null }[] = [
      { tier: "AGENCY", resourceId: cfg.productIds.AGENCY },
      { tier: "PRO", resourceId: cfg.productIds.PRO },
      { tier: "CREATOR", resourceId: cfg.productIds.CREATOR },
    ];

    for (const t of tiers) {
      if (resolvedTier) break;
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
