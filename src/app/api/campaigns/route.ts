import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeCampaign, campaignAssetCounts } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 100);

    const campaigns = await db.campaign.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const withCounts = await Promise.all(
      campaigns.map(async (c) => serializeCampaign(c, await campaignAssetCounts(c.id))),
    );
    return NextResponse.json({ campaigns: withCounts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load campaigns" }, { status: 500 });
  }
}
