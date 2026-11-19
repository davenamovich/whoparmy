import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { canCreateArmyBot } from "@/lib/plans";
import { serializeBot, serializeMission, serializeMember } from "@/lib/serialize";
import { tgGetMe, tgDeleteWebhook } from "@/lib/telegram";
import type { ArmyResponseDTO } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Full Meme Army state for the owner control panel. */
export async function GET() {
  try {
    const { user, mode } = await getWhopUserWithMode();

    const bot = await db.armyBot.findUnique({
      where: { userId: user.id },
      include: {
        missions: { orderBy: { createdAt: "desc" } },
        members: { orderBy: [{ points: "desc" }, { joinedAt: "asc" }] },
      },
    });

    if (!bot) {
      const empty: ArmyResponseDTO = {
        bot: null,
        missions: [],
        members: [],
        stats: { participants: 0, shares: 0, referrals: 0, verifiedClicks: 0, contentGenerated: 0 },
        canCreateBot: mode === "operator" || canCreateArmyBot(user),
      };
      return NextResponse.json(empty);
    }

    const submissions = await db.submission.findMany({ where: { botId: bot.id }, select: { clicks: true } });

    const response: ArmyResponseDTO = {
      bot: serializeBot(bot),
      missions: bot.missions.map(serializeMission),
      members: bot.members.map(serializeMember),
      stats: {
        participants: bot.members.length,
        shares: bot.members.reduce((n, m) => n + m.shares, 0) + submissions.length,
        referrals: bot.members.reduce((n, m) => n + m.referrals, 0),
        verifiedClicks: bot.members.reduce((n, m) => n + m.verifiedClicks, 0) + submissions.reduce((n, s) => n + s.clicks, 0),
        contentGenerated: bot.missions.reduce((n, m) => n + serializeMission(m).contentPack.length, 0),
      },
    };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load Meme Army" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}

interface ArmyActionBody {
  action: "update" | "launch" | "pause" | "resume" | "rewards" | "disconnect" | "reconnect";
  armyName?: string;
  logoDataUrl?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  website?: string;
  welcomeMessage?: string;
  languages?: string[];
  rewards?: { name: string; type: string; cost: string; description: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as ArmyActionBody;

    const bot = await db.armyBot.findUnique({ where: { userId: user.id } });
    if (!bot) return NextResponse.json({ error: "No Meme Army found — complete onboarding first." }, { status: 404 });

    if (body.action === "disconnect") {
      if (bot.botToken) await tgDeleteWebhook(bot.botToken);
      await db.armyBot.delete({ where: { id: bot.id } });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "launch" || body.action === "resume") {
      // LIVE status requires a verified Telegram connection
      if (!bot.botUsername) {
        return NextResponse.json({ error: "Connect a Telegram bot token before going live." }, { status: 400 });
      }
      if (!bot.demoSeeded) await seedDemoCommunity(bot.id);
      const updated = await db.armyBot.update({
        where: { id: bot.id },
        data: { status: "LIVE", demoSeeded: true },
      });
      return NextResponse.json({ bot: serializeBot(updated) });
    }

    if (body.action === "pause") {
      const updated = await db.armyBot.update({ where: { id: bot.id }, data: { status: "PAUSED" } });
      return NextResponse.json({ bot: serializeBot(updated) });
    }

    // update branding / rewards / preferences
    const updated = await db.armyBot.update({
      where: { id: bot.id },
      data: {
        ...(body.armyName?.trim() ? { armyName: body.armyName.trim().slice(0, 60) } : {}),
        ...(body.logoDataUrl !== undefined ? { logoUrl: clampDataUrl(body.logoDataUrl) } : {}),
        ...(body.colorPrimary ? { colorPrimary: body.colorPrimary.slice(0, 9) } : {}),
        ...(body.colorSecondary ? { colorSecondary: body.colorSecondary.slice(0, 9) } : {}),
        ...(body.website !== undefined ? { website: body.website?.trim().slice(0, 300) || null } : {}),
        ...(body.welcomeMessage !== undefined ? { welcomeMessage: body.welcomeMessage?.trim().slice(0, 800) || null } : {}),
        ...(body.languages?.length ? { languages: JSON.stringify(body.languages) } : {}),
        ...(body.rewards !== undefined ? { rewardsJson: JSON.stringify(body.rewards.slice(0, 12)) } : {}),
      },
    });

    // optional: re-verify the Telegram token on demand
    if (body.action === "reconnect" && bot.botToken) {
      const me = await tgGetMe(bot.botToken);
      if (me.ok && me.result) {
        await db.armyBot.update({
          where: { id: bot.id },
          data: { botUsername: me.result.username, telegramBotId: String(me.result.id) },
        });
        const refreshed = await db.armyBot.findUnique({ where: { id: bot.id } });
        return NextResponse.json({ bot: refreshed ? serializeBot(refreshed) : serializeBot(updated) });
      }
      return NextResponse.json({ error: `Telegram verification failed: ${me.description ?? "unknown error"}` }, { status: 400 });
    }

    return NextResponse.json({ bot: serializeBot(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update Meme Army" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}

function clampDataUrl(dataUrl?: string): string | null {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  // keep logos small (<= 400KB base64) to stay inside SQLite comfort zone
  return dataUrl.length <= 550_000 ? dataUrl : null;
}

/** Sample community so the owner panel is explorable before live Telegram
 *  activity arrives. Members are clearly flagged isDemo everywhere in the UI. */
async function seedDemoCommunity(botId: string) {
  const names = [
    "Alex " + "R." , "Mia T.", "Jordan K.", "Sam P.", "Riley M.", "Chen W.", "Lucía G.", "Omar H.",
    "Priya S.", "Tomasz N.", "Yuki O.", "Fatima Z.", "Diego R.", "Nina L.", "Marcus B.", "Aisha D.",
    "Ivan V.", "Sofia C.", "Ethan J.", "Lena F.", "Kwame A.", "Hana M.", "Pablo E.", "Tara Q.",
  ];
  const langs = ["en", "es", "pt-BR", "fr", "de", "hi", "id", "ja", "tl", "ar"];
  const badgePool = ["TOP SHARER", "DAY-ONE ARMY", "MEME LORD", "REFERRAL MACHINE", "STREAK x7"];

  await db.$transaction(
    names.map((name, i) => {
      const points = Math.max(10, Math.round(980 - i * 37 + Math.random() * 25));
      const shares = Math.round(points / 4.2 + Math.random() * 3);
      const referrals = Math.round(Math.random() * 6);
      const clicks = shares * (6 + Math.floor(Math.random() * 9));
      return db.armyMember.create({
        data: {
          botId,
          telegramId: `demo_${i}_${Date.now()}`,
          displayName: name,
          username: name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 12) || `member${i}`,
          language: langs[i % langs.length],
          points,
          shares,
          referrals,
          clicks,
          verifiedClicks: Math.round(clicks * 0.62),
          badges: JSON.stringify(i < 5 ? [badgePool[i % badgePool.length]] : i % 4 === 0 ? [badgePool[2]] : []),
          isDemo: true,
          refCode: `REF${1000 + i}`,
        },
      });
    }),
  );
}
