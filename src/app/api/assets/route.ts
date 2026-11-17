import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeAsset } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const sp = req.nextUrl.searchParams;
    const campaignId = sp.get("campaignId") ?? undefined;
    const type = sp.get("type") ?? undefined;
    const language = sp.get("language") ?? undefined;
    const q = sp.get("q")?.trim();
    const limit = Math.min(Number(sp.get("limit") ?? 200), 500);

    const assets = await db.asset.findMany({
      where: {
        userId: user.id,
        status: "DONE",
        ...(campaignId ? { campaignId } : {}),
        ...(type && type !== "ALL" ? { type } : {}),
        ...(language && language !== "ALL" ? { language } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ assets: assets.map(serializeAsset) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load assets" }, { status: 500 });
  }
}
