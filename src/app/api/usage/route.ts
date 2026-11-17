import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { getWhopConfig } from "@/lib/whop";
import { getPlan } from "@/lib/plans";
import type { UsageSummaryDTO } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const user = await getWhopUser();
    const plan = getPlan(user.plan);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [byKind, totals, recent] = await Promise.all([
      db.usageRecord.groupBy({
        by: ["kind"],
        where: { userId: user.id, createdAt: { gte: monthStart } },
        _sum: { count: true },
      }),
      db.usageRecord.groupBy({
        by: ["kind"],
        where: { userId: user.id },
        _sum: { count: true },
      }),
      db.usageRecord.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);

    const sum = (rows: { kind: string; _sum: { count: number | null } }[], kind: string) =>
      rows.filter((r) => r.kind === kind).reduce((n, r) => n + (r._sum.count ?? 0), 0);

    const [campaignCount, assetCount] = await Promise.all([
      db.campaign.count({ where: { userId: user.id } }),
      db.asset.count({ where: { userId: user.id, status: "DONE" } }),
    ]);

    const languagesUsed = await db.asset.findMany({
      where: { userId: user.id, status: "DONE" },
      select: { language: true },
      distinct: ["language"],
    });

    const usedThisMonth = sum(byKind, "TEXT") + sum(byKind, "IMAGE");
    const payload: UsageSummaryDTO = {
      plan: plan.key,
      planName: plan.name,
      used: usedThisMonth,
      limit: plan.monthlyItems,
      remaining: Math.max(plan.monthlyItems - usedThisMonth, 0),
      totals: {
        text: sum(totals, "TEXT"),
        image: sum(totals, "IMAGE"),
        failed: sum(totals, "FAILED"),
        campaigns: campaignCount,
        assets: assetCount,
        languagesUsed: languagesUsed.length,
      },
      recent: recent.map((r) => ({ kind: r.kind, count: r.count, createdAt: r.createdAt.toISOString() })),
    };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load usage" }, { status: 500 });
  }
}

/** Dev preview only — once Whop billing is live, plans come from Whop exclusively. */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { plan?: string };
    const valid = ["FREE", "CREATOR", "PRO", "AGENCY"];
    if (!body.plan || !valid.includes(body.plan)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    // With a Whop OAuth app + API key on this deployment, entitlements are
    // owned by Whop (signed webhooks + the API v1 access check). Letting the
    // client pick any plan here would be a billing bypass, so it is refused.
    const cfg = getWhopConfig();
    if (cfg.appId && cfg.apiKey) {
      return NextResponse.json(
        {
          error:
            "Plans are managed by your Whop subscription on this deployment. Use 'Sync entitlements' in the account menu or complete checkout on Whop.",
          code: "whop_managed_plans",
        },
        { status: 403 },
      );
    }

    // Sandbox/dev fallback (no Whop credentials yet): honest manual preview.
    // planSource "manual" marks it in the UI as a preview, not a purchase.
    await db.user.update({
      where: { id: user.id },
      data: { plan: body.plan, planSource: "manual", planUpdatedAt: new Date() },
    });
    return NextResponse.json({ ok: true, plan: body.plan, planSource: "manual" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to set plan" }, { status: 500 });
  }
}
