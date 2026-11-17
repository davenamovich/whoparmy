import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { runGenerationJob, recordUsage } from "@/lib/pr-engine";
import { FORMAT_MAP, isContentCategory } from "@/lib/formats";
import { isSupportedLanguage, languageLabel } from "@/lib/languages";
import { getPlan } from "@/lib/plans";
import type { ProfileDTO } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface GenerateBody {
  name?: string;
  sourceType?: "URL" | "DESCRIPTION" | "IDEA" | "BRAND";
  profile: ProfileDTO;
  objective: string;
  customObjective?: string;
  tone: string;
  customTone?: string;
  languages: string[];
  formats: { category: string; format: string }[];
  piecesPerFormat?: number;
  brandId?: string;
}

const MAX_PIECES = 4;

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as GenerateBody;

    // ── validation ──
    const profile = body.profile;
    if (!profile?.name || !profile?.description) {
      return NextResponse.json({ error: "A business profile is required before generating." }, { status: 400 });
    }
    if (!body.objective) {
      return NextResponse.json({ error: "Choose a campaign objective." }, { status: 400 });
    }
    if (!body.tone && !body.customTone) {
      return NextResponse.json({ error: "Choose a tone." }, { status: 400 });
    }

    const languages = [...new Set((body.languages ?? []).filter(isSupportedLanguage))];
    if (languages.length === 0) {
      return NextResponse.json({ error: "Select at least one language." }, { status: 400 });
    }

    const formats = (body.formats ?? []).filter((f) => FORMAT_MAP[f.format] && isContentCategory(f.category));
    if (formats.length === 0) {
      return NextResponse.json({ error: "Select at least one content format." }, { status: 400 });
    }

    const pieces = Math.min(Math.max(body.piecesPerFormat ?? 2, 1), MAX_PIECES);

    // ── plan entitlements ──
    const plan = getPlan(user.plan);
    if (formats.length > plan.maxFormatsPerCampaign) {
      return NextResponse.json(
        { error: `Your ${plan.name} plan allows up to ${plan.maxFormatsPerCampaign} formats per campaign. Upgrade for more.` },
        { status: 402 },
      );
    }
    if (languages.length > plan.maxLanguagesPerCampaign) {
      return NextResponse.json(
        { error: `Your ${plan.name} plan allows up to ${plan.maxLanguagesPerCampaign} languages per campaign.` },
        { status: 402 },
      );
    }

    // ── monthly usage check (failed generations are never charged) ──
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usage = await db.usageRecord.groupBy({
      by: ["kind"],
      where: { userId: user.id, createdAt: { gte: monthStart }, kind: { in: ["TEXT", "IMAGE"] } },
      _sum: { count: true },
    });
    const used = usage.reduce((n, u) => n + (u._sum.count ?? 0), 0);
    const requested = formats.length * languages.length * pieces;
    if (used + requested > plan.monthlyItems) {
      return NextResponse.json(
        {
          error: `Monthly limit reached on the ${plan.name} plan (${plan.monthlyItems} items). This campaign needs ~${requested} more. Upgrade your plan or reduce the selection.`,
        },
        { status: 402 },
      );
    }

    // ── de-dupe accidental double clicks: identical pending campaign in last 30s ──
    const recent = await db.campaign.findFirst({
      where: { userId: user.id, name: body.name?.trim() || `${profile.name} Campaign`, createdAt: { gte: new Date(Date.now() - 30_000) } },
      include: { jobs: true },
    });
    if (recent && recent.jobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING")) {
      return NextResponse.json({ jobId: recent.jobs[0].id, campaignId: recent.id, duplicate: true });
    }

    // ── create campaign ──
    const campaign = await db.campaign.create({
      data: {
        userId: user.id,
        name: body.name?.trim() || `${profile.name} Campaign`,
        businessName: profile.name,
        website: profile.website ?? null,
        sourceType: body.sourceType ?? "URL",
        profileJson: JSON.stringify(profile),
        objective: body.objective,
        customObjective: body.customObjective?.trim() || null,
        tone: body.tone || "custom",
        customTone: body.customTone?.trim() || null,
        languages: JSON.stringify(languages),
        formats: JSON.stringify(formats),
        piecesPerFormat: pieces,
        status: "GENERATING",
      },
    });

    // ── pre-create asset placeholders ──
    const assetData: {
      userId: string;
      campaignId: string;
      type: string;
      format: string;
      formatLabel: string;
      language: string;
      languageLabel: string;
      status: string;
    }[] = [];
    for (const f of formats) {
      const spec = FORMAT_MAP[f.format]!;
      for (const lang of languages) {
        for (let i = 0; i < pieces; i++) {
          assetData.push({
            userId: user.id,
            campaignId: campaign.id,
            type: spec.category,
            format: spec.key,
            formatLabel: spec.label,
            language: lang,
            languageLabel: languageLabel(lang),
            status: "PENDING",
          });
        }
      }
    }
    await db.asset.createMany({ data: assetData });

    // ── queue job ──
    const job = await db.generationJob.create({
      data: { userId: user.id, campaignId: campaign.id, status: "QUEUED", total: assetData.length },
    });

    // fire-and-forget: the dev server process keeps the promise alive
    void runGenerationJob(job.id).catch(() => {});

    return NextResponse.json({ jobId: job.id, campaignId: campaign.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start generation." },
      { status: 500 },
    );
  }
}
