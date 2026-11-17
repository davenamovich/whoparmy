import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeMission } from "@/lib/serialize";

export const runtime = "nodejs";

const STATUSES = new Set(["DRAFT", "LIVE", "ENDED"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      status?: string;
      contentPack?: { kind: string; title: string; body: string }[];
      title?: string;
      description?: string;
    };

    const bot = await db.armyBot.findUnique({ where: { userId: user.id } });
    if (!bot) return NextResponse.json({ error: "No Meme Army found" }, { status: 404 });

    const mission = await db.mission.findFirst({ where: { id, botId: bot.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const goingLive = body.status === "LIVE" && mission.status !== "LIVE";
    const updated = await db.mission.update({
      where: { id },
      data: {
        ...(body.status && STATUSES.has(body.status) ? { status: body.status } : {}),
        ...(body.title?.trim() ? { title: body.title.trim().slice(0, 120) } : {}),
        ...(body.description?.trim() ? { description: body.description.trim().slice(0, 2000) } : {}),
        ...(Array.isArray(body.contentPack) ? { contentPackJson: JSON.stringify(body.contentPack.slice(0, 24)) } : {}),
        ...(goingLive ? { announcedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ mission: serializeMission(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update mission" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const bot = await db.armyBot.findUnique({ where: { userId: user.id } });
    if (!bot) return NextResponse.json({ error: "No Meme Army found" }, { status: 404 });

    const mission = await db.mission.findFirst({ where: { id, botId: bot.id } });
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    await db.mission.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete mission" }, { status: 500 });
  }
}
