import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { serializeCampaign } from "@/lib/serialize";

export const runtime = "nodejs";

/** Duplicate an existing campaign as a fresh template (assets are not copied). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const source = await db.campaign.findFirst({ where: { id, userId: user.id } });
    if (!source) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const copy = await db.campaign.create({
      data: {
        userId: user.id,
        name: `${source.name} (Copy)`,
        businessName: source.businessName,
        website: source.website,
        sourceType: source.sourceType,
        profileJson: source.profileJson,
        objective: source.objective,
        customObjective: source.customObjective,
        tone: source.tone,
        customTone: source.customTone,
        languages: source.languages,
        formats: source.formats,
        piecesPerFormat: source.piecesPerFormat,
        status: "COMPLETE", // duplicated campaigns start empty as reusable templates
      },
    });

    return NextResponse.json({ campaign: serializeCampaign(copy) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to duplicate campaign" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
