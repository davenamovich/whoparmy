import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeMission } from "@/lib/serialize";
import { isSupportedLanguage } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

interface MissionBody {
  title: string;
  product?: string;
  description: string;
  targetUrl?: string;
  audience?: string;
  languages?: string[];
  durationDays?: number;
  dailyRequirement?: string;
  rewardBudget?: string;
  rules?: string;
  contentPack?: { kind: string; title: string; body: string }[];
  launch?: boolean;
}

export async function GET() {
  try {
    const user = await getWhopUser();
    const bot = await db.armyBot.findUnique({ where: { userId: user.id } });
    if (!bot) return NextResponse.json({ missions: [] });
    const missions = await db.mission.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ missions: missions.map(serializeMission) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load missions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as MissionBody;

    const bot = await db.armyBot.findUnique({ where: { userId: user.id } });
    if (!bot) return NextResponse.json({ error: "Deploy your Meme Army bot first." }, { status: 400 });

    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: "Mission title and description are required." }, { status: 400 });
    }

    const launch = Boolean(body.launch) && bot.status === "LIVE";
    const mission = await db.mission.create({
      data: {
        botId: bot.id,
        title: body.title.trim().slice(0, 120),
        product: body.product?.trim().slice(0, 200) || null,
        description: body.description.trim().slice(0, 2000),
        targetUrl: body.targetUrl?.trim().slice(0, 500) || null,
        audience: body.audience?.trim().slice(0, 300) || null,
        languages: JSON.stringify((body.languages ?? [JSON.parse(bot.languages)[0] ?? "en"]).filter(isSupportedLanguage)),
        durationDays: Math.min(Math.max(body.durationDays ?? 7, 1), 90),
        dailyRequirement: body.dailyRequirement?.trim().slice(0, 300) || null,
        rewardBudget: body.rewardBudget?.trim().slice(0, 120) || null,
        rules: body.rules?.trim().slice(0, 1000) || null,
        contentPackJson: JSON.stringify((body.contentPack ?? []).slice(0, 24)),
        status: launch ? "LIVE" : "DRAFT",
        announcedAt: launch ? new Date() : null,
      },
    });

    return NextResponse.json({ mission: serializeMission(mission) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create mission" }, { status: 500 });
  }
}
