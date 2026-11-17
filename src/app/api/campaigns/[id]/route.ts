import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeCampaign, serializeAsset, campaignAssetCounts } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const campaign = await db.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const assets = await db.asset.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({
      campaign: serializeCampaign(campaign, await campaignAssetCounts(id)),
      assets: assets.map(serializeAsset),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load campaign" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const campaign = await db.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    await db.campaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete campaign" }, { status: 500 });
  }
}
