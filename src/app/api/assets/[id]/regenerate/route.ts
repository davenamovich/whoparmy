import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { regenerateAsset } from "@/lib/pr-engine";
import { serializeAsset } from "@/lib/serialize";
import { assertMonthlyAllowance } from "@/lib/usage-server";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_VARIATIONS = new Set([
  "funnier",
  "shorter",
  "persuasive",
  "controversial",
  "stronger_cta",
  "natural",
  "new_audience",
]);

/** Regenerate a single asset (optionally with a variation directive or new language). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { variation?: string; language?: string };

    const asset = await db.asset.findFirst({ where: { id, userId: user.id } });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    if (body.variation && !VALID_VARIATIONS.has(body.variation)) {
      return NextResponse.json({ error: "Unknown variation" }, { status: 400 });
    }

    // A regeneration costs one item from the monthly allowance, same as a
    // fresh campaign asset — check before spending engine credits.
    const allowance = await assertMonthlyAllowance(user.id, user.plan, 1);
    if (!allowance.ok) {
      return NextResponse.json(
        { error: allowance.error, code: "limit_reached", plan: allowance.plan.key, used: allowance.used, limit: allowance.limit },
        { status: 402 },
      );
    }

    await regenerateAsset(id, body.variation, body.language);

    // keep campaign status truthful: if nothing is failed/pending anymore,
    // a PARTIAL campaign returns to COMPLETE
    if (asset.campaignId) {
      const remaining = await db.asset.findMany({
        where: { campaignId: asset.campaignId, status: { in: ["FAILED", "PENDING", "GENERATING"] } },
        select: { id: true },
      });
      if (remaining.length === 0) {
        await db.campaign.updateMany({
          where: { id: asset.campaignId, userId: user.id, status: { not: "GENERATING" } },
          data: { status: "COMPLETE" },
        });
      }
    }

    const updated = await db.asset.findUnique({ where: { id } });
    return NextResponse.json({ asset: updated ? serializeAsset(updated) : null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Regeneration failed — you were not charged." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
