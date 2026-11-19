import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { serializeAsset } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const job = await db.generationJob.findFirst({
      where: { id, userId: user.id },
      include: { campaign: { select: { id: true, name: true, status: true } } },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const assets = await db.asset.findMany({
      where: { campaignId: job.campaignId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      job: {
        id: job.id,
        campaignId: job.campaignId,
        status: job.status,
        total: job.total,
        done: job.done,
        failed: job.failed,
        currentStep: job.currentStep,
        error: job.error,
      },
      campaign: { id: job.campaign.id, name: job.campaign.name, status: job.campaign.status },
      assets: assets.map(serializeAsset),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load job" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
