import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUserWithMode, UnauthorizedError } from "@/lib/auth";
import { canCreateArmyBot } from "@/lib/plans";
import { serializeBot } from "@/lib/serialize";
import { tgGetMe, tgSetWebhook } from "@/lib/telegram";
import { isSupportedLanguage } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OnboardBody {
  armyName: string;
  logoDataUrl?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  website?: string;
  botToken: string;
  groupTitle?: string;
  groupId?: string;
  languages?: string[];
  welcomeMessage?: string;
  goLive?: boolean;
}

/**
 * Meme Army onboarding:
 * 1. Validate the BotFather token against the REAL Telegram API (getMe).
 * 2. Persist the token server-side only (never returned to any client).
 * 3. Attempt webhook registration using the current public host.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, mode } = await getWhopUserWithMode();
    const body = (await req.json()) as OnboardBody;

    const armyName = body.armyName?.trim();
    const suppliedToken = body.botToken?.trim();
    if (!armyName) return NextResponse.json({ error: "Give your Meme Army a name." }, { status: 400 });
    if (suppliedToken && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(suppliedToken)) {
      return NextResponse.json(
        { error: "That doesn't look like a BotFather token. It should look like 1234567890:AAEhBOweik6ad9r_QXMENQjcrGbqCr4K-4c." },
        { status: 400 },
      );
    }

    const existing = await db.armyBot.findUnique({ where: { userId: user.id } });

    // Bot creation gate (Dave, 2026-11-17): creating a NEW bot
    // requires a paid plan or a Meme Army upsell — Trial members use
    // the factory, they don't deploy bots. Updates by existing owners
    // are never gated. The operator account (Dave's backstage
    // identity) bypasses.
    if (!existing && mode !== "operator" && !canCreateArmyBot(user)) {
      return NextResponse.json(
        {
          error: "Deploying your own Telegram bot is a paid unlock. Upgrade to a paid plan or add a Meme Army plan, then come back and launch it.",
          code: "bot_gate",
        },
        { status: 403 },
      );
    }

    // update mode: a blank token field means "keep the stored token" —
    // the stored token is never exposed to the client, so it can never
    // be re-submitted. New bots must supply a fresh token.
    const botToken = suppliedToken || existing?.botToken;
    if (!botToken) {
      return NextResponse.json(
        { error: "Paste the BotFather token for your new bot." },
        { status: 400 },
      );
    }

    // ── real Telegram verification (never fabricated) ──
    const me = await tgGetMe(botToken);
    if (!me.ok || !me.result || !me.result.username) {
      return NextResponse.json(
        { error: `Telegram rejected this token: ${me.description ?? "invalid token"}. Create the bot with @BotFather and paste the exact token.` },
        { status: 400 },
      );
    }

    // ── webhook registration (best effort; status reported honestly) ──
    const slug = existing?.slug ?? `army-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const secretToken = existing?.secretToken ?? `wh_${crypto.randomUUID().replace(/-/g, "")}`;
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    let webhookUrl: string | null = null;
    let webhookStatus = "PENDING";

    if (host && !host.startsWith("localhost") && !host.startsWith("127.") && proto === "https") {
      webhookUrl = `${proto}://${host}/api/telegram/webhook/${slug}`;
      const hook = await tgSetWebhook(botToken, webhookUrl, secretToken);
      webhookStatus = hook.ok ? "ACTIVE" : "FAILED";
    }

    const languages = (body.languages ?? ["en"]).filter(isSupportedLanguage);

    const data = {
      userId: user.id,
      slug,
      armyName: armyName.slice(0, 60),
      logoUrl: body.logoDataUrl?.startsWith("data:image/") && body.logoDataUrl.length <= 550_000 ? body.logoDataUrl : existing?.logoUrl ?? null,
      colorPrimary: body.colorPrimary?.slice(0, 9) || existing?.colorPrimary || "#FF5C1A",
      colorSecondary: body.colorSecondary?.slice(0, 9) || existing?.colorSecondary || "#111111",
      website: body.website?.trim().slice(0, 300) || null,
      botToken,
      botUsername: me.result.username,
      telegramBotId: String(me.result.id),
      webhookUrl,
      webhookStatus,
      secretToken,
      groupTitle: body.groupTitle?.trim().slice(0, 120) || existing?.groupTitle || null,
      groupId: body.groupId?.trim().slice(0, 60) || existing?.groupId || null,
      languages: JSON.stringify(languages.length ? languages : ["en"]),
      welcomeMessage: body.welcomeMessage?.trim().slice(0, 800) || existing?.welcomeMessage || null,
    };

    const bot = existing
      ? await db.armyBot.update({ where: { id: existing.id }, data })
      : await db.armyBot.create({ data });

    return NextResponse.json({
      bot: serializeBot(bot),
      verified: { username: me.result.username },
      webhook: { url: webhookUrl, status: webhookStatus },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Onboarding failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
