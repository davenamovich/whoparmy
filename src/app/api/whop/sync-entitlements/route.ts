import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { getWhopConfig, getWhopTierIds, resolveTierFromMemberships, whopListMemberships } from "@/lib/whop";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

/**
 * POST /api/whop/sync-entitlements — pull the signed-in user's live access
 * from Whop and set the plan tier accordingly.
 *
 * Uses the same membership-to-tier rules as webhook reconciliation.
 * Only a complete membership list can establish that access has ended.
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

    const ids = getWhopTierIds();
    if (![...Object.values(ids.planIds), ...Object.values(ids.productIds)].some(Boolean)) {
      return NextResponse.json({ error: "No Whop tier mappings are configured" }, { status: 503 });
    }

    let plan: string;
    try {
      const memberships = await whopListMemberships();
      plan = resolveTierFromMemberships(memberships.filter((row) => row.userId === user.whopId), ids) ?? "FREE";
    } catch (err) {
      const reason = err instanceof Error ? err.message : "membership lookup failed";
      return NextResponse.json(
        {
          error: `Entitlement sync couldn't verify your access: ${reason}. Your current plan was left unchanged.`,
          incomplete: true,
          plan: user.plan,
          planName: getPlan(user.plan).name,
          planSource: user.planSource,
        },
        { status: 502 },
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { plan, planSource: "whop_access", planUpdatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      plan,
      planName: getPlan(plan).name,
      planSource: "whop_access",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Entitlement sync failed" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
