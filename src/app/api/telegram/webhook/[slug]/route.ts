import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatCompletion, parseJsonSafe } from "@/lib/pr-engine";
import { tgSendMessage, tgAnswerCallbackQuery, inlineKeyboard, escapeHtml, type TgUpdate } from "@/lib/telegram";
import { LANGUAGES, languageLabel } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Meme Army Telegram webhook — one URL per bot, addressed by a secret slug.
 *
 * Safety rules enforced here:
 * - Members exist ONLY after they opt in by messaging the bot (/start).
 * - No unsolicited bulk messaging of any kind — the bot only ever replies.
 * - Duplicate Telegram updates are dropped; per-chat rate limiting applies.
 * - The bot token never leaves the server.
 */

// per-instance de-duplication + rate limiting
const seenUpdates = new Set<number>();
const chatHits = new Map<string, number[]>();
const RATE_LIMIT = 20; // messages per minute per chat

function rateLimited(chatId: string): boolean {
  const now = Date.now();
  const window = (chatHits.get(chatId) ?? []).filter((t) => now - t < 60_000);
  window.push(now);
  chatHits.set(chatId, window);
  if (chatHits.size > 5000) chatHits.clear(); // simple memory guard
  return window.length > RATE_LIMIT;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const bot = await db.armyBot.findUnique({ where: { slug } });
  if (!bot) return NextResponse.json({ ok: true }); // don't leak existence

  // verify Telegram's secret token header when configured
  if (bot.secretToken) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== bot.secretToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  if (seenUpdates.has(update.update_id)) return NextResponse.json({ ok: true });
  seenUpdates.add(update.update_id);
  if (seenUpdates.size > 10000) {
    const it = seenUpdates.values().next();
    if (it.value !== undefined) seenUpdates.delete(it.value);
  }

  try {
    if (update.message?.text) {
      await handleMessage(bot, update);
    } else if (update.callback_query) {
      await handleCallback(bot, update);
    }
  } catch (err) {
    console.error("[meme-army webhook]", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}

// ─── member resolution ──────────────────────────────────────────────
async function upsertMember(botId: string, telegramId: string, username?: string, displayName?: string, refCode?: string) {
  const existing = await db.armyMember.findUnique({ where: { botId_telegramId: { botId, telegramId } } });
  if (existing) return { member: existing, isNew: false };

  const member = await db.armyMember.create({
    data: {
      botId,
      telegramId,
      username: username?.slice(0, 60) || null,
      displayName: (displayName || `Member ${telegramId.slice(-4)}`).slice(0, 80),
      refCode: `REF${telegramId.slice(-6)}`,
    },
  });

  // referral attribution: the NEW member arrived via someone's /refer link
  if (refCode) {
    const referrer = await db.armyMember.findFirst({ where: { botId, refCode } });
    if (referrer && referrer.id !== member.id) {
      await db.armyMember.update({
        where: { id: referrer.id },
        data: { referrals: { increment: 1 }, points: { increment: 25 } },
      });
    }
  }

  return { member, isNew: true };
}

function parseCommand(text: string): { cmd: string; args: string } {
  const match = text.trim().match(/^\/([a-zA-Z_]+)(?:@\w+)?\s*([\s\S]*)$/);
  if (!match) return { cmd: "", args: "" };
  return { cmd: match[1].toLowerCase(), args: (match[2] ?? "").trim() };
}

// ─── message handler ────────────────────────────────────────────────
async function handleMessage(
  bot: {
    id: string;
    armyName: string;
    botToken: string;
    botUsername: string | null;
    status: string;
    colorPrimary: string;
    welcomeMessage: string | null;
    languages: string;
    rewardsJson: string;
  },
  update: TgUpdate,
) {
  const message = update.message!;
  const chatId = message.chat.id;
  const text = message.text ?? "";
  const { cmd, args } = parseCommand(text);
  const chatKey = String(chatId);

  if (rateLimited(chatKey)) return; // silently drop floods

  const enabled = JSON.parse(bot.languages) as string[];

  // every command that identifies the user registers them (opt-in only)
  const tgUser = message.from;
  let memberId: string | null = null;

  if (cmd === "start" || !cmd) {
    const refCode = args?.startsWith("ref_") ? args.slice(4).toUpperCase() : undefined;
    if (tgUser) {
      const { member, isNew } = await upsertMember(bot.id, String(tgUser.id), tgUser.username, tgUser.first_name, refCode);
      memberId = member.id;
      const welcome =
        bot.welcomeMessage?.trim() ||
        `Welcome to <b>${escapeHtml(bot.armyName)}</b>.\n\nYou just joined the distribution network. Here's what you can do:\n\n/missions — see today's missions\n/memes — get fresh campaign memes\n/content — grab ready-to-share content\n/language — choose your language\n/refer — get your referral link\n/leaderboard — see the top members\n/rewards — what you can earn\n\n<b>Your mission:</b> share. earn points. climb the board.`;
      await tgSendMessage(bot.botToken, chatId, welcome);
      if (isNew) {
        await tgSendMessage(bot.botToken, chatId, "You're enrolled. Type /missions to get your first assignment.");
      }
      return;
    }
    await tgSendMessage(bot.botToken, chatId, "Send /start to enlist in the army.");
    return;
  }

  if (!tgUser) return;
  const { member } = await upsertMember(bot.id, String(tgUser.id), tgUser.username, tgUser.first_name);
  memberId = member.id;

  switch (cmd) {
    case "help":
      await tgSendMessage(
        bot.botToken,
        chatId,
        `<b>${escapeHtml(bot.armyName)} — command center</b>\n\n/memes — generate campaign memes\n/missions — view promotional missions\n/content — ready-to-share content\n/language — choose your language\n/campaigns — active promotions\n/leaderboard — participation rankings\n/refer — your personal referral link\n/rewards — rewards & eligibility\n/submit &lt;link&gt; — submit your post for credit\n\nMembers opt in by messaging this bot. We never DM first.`,
      );
      break;

    case "missions": {
      const missions = await db.mission.findMany({ where: { botId: bot.id, status: "LIVE" }, orderBy: { createdAt: "desc" }, take: 3 });
      if (missions.length === 0) {
        await tgSendMessage(bot.botToken, chatId, "No live missions right now. Stand by — the next drop is coming.");
        break;
      }
      for (const m of missions) {
        const pack = parseJsonSafe<{ kind: string; title: string; body: string }[]>(m.contentPackJson) ?? [];
        const announcement = pack.find((p) => p.kind === "ANNOUNCEMENT");
        const lines = [
          `<b>🚀 ${escapeHtml(m.title)}</b>`,
          m.product ? `Offer: <b>${escapeHtml(m.product)}</b>` : "",
          "",
          escapeHtml(announcement?.body ?? m.description),
          m.targetUrl ? `\nLink: ${m.targetUrl}` : "",
          m.rewardBudget ? `Rewards pool: ${escapeHtml(m.rewardBudget)}` : "",
          "",
          "Grab content with /content — fresh memes with /memes — submit proof with /submit <your link>",
        ].filter(Boolean);
        await tgSendMessage(bot.botToken, chatId, lines.join("\n"));
      }
      break;
    }

    case "memes": {
      const live = await db.mission.findFirst({ where: { botId: bot.id, status: "LIVE" }, orderBy: { createdAt: "desc" } });
      if (!live) {
        await tgSendMessage(bot.botToken, chatId, "No live campaign to meme about yet. Check /missions.");
        break;
      }
      const lang = member?.language ?? enabled[0] ?? "en";
      await tgSendMessage(bot.botToken, chatId, "Firing up the meme engine…");
      try {
        const raw = await chatCompletion(
          `You are the meme engine for "${bot.armyName}". Create ONE meme about the campaign below, written natively in ${languageLabel(lang)} (code: ${lang}). Culturally adapt the humor. Respond STRICT JSON: {"topText":string (max 60 chars),"bottomText":string (max 60 chars)}`,
          `Campaign: ${live.title}\nProduct: ${live.product ?? ""}\nDescription: ${live.description}`,
        );
        const parsed = parseJsonSafe<{ topText?: string; bottomText?: string }>(raw);
        if (parsed?.topText && parsed?.bottomText) {
          await tgSendMessage(
            bot.botToken,
            chatId,
            `<b>Fresh meme for you:</b>\n\n<b>TOP:</b> ${escapeHtml(parsed.topText)}\n<b>BOTTOM:</b> ${escapeHtml(parsed.bottomText)}\n\nPair it with today's content pack (/content), personalize it, post it, then claim credit: /submit &lt;your link&gt;`,
          );
          if (memberId) {
            await db.armyMember.update({ where: { id: memberId }, data: { points: { increment: 2 } } });
          }
        } else {
          await tgSendMessage(bot.botToken, chatId, "The meme engine hiccuped. Try again in a moment.");
        }
      } catch {
        await tgSendMessage(bot.botToken, chatId, "The meme engine is busy. Try again in a moment.");
      }
      break;
    }

    case "content": {
      const live = await db.mission.findFirst({ where: { botId: bot.id, status: "LIVE" }, orderBy: { createdAt: "desc" } });
      if (!live) {
        await tgSendMessage(bot.botToken, chatId, "No live campaign content yet. Check /missions.");
        break;
      }
      const pack = parseJsonSafe<{ kind: string; title: string; body: string }[]>(live.contentPackJson) ?? [];
      const shareable = pack.filter((p) => p.kind !== "ANNOUNCEMENT").slice(0, 3);
      if (shareable.length === 0) {
        await tgSendMessage(bot.botToken, chatId, "The content pack for this mission is still being approved. Check back shortly.");
        break;
      }
      const body = shareable.map((p) => `<b>[${p.kind}]</b> ${escapeHtml(p.title)}\n${escapeHtml(p.body)}`).join("\n\n");
      await tgSendMessage(
        bot.botToken,
        chatId,
        `<b>Today's content pack — ${escapeHtml(live.title)}</b>\n\n${body}\n\nPersonalize it if you want, then share and claim credit: /submit &lt;link&gt;`,
      );
      break;
    }

    case "language": {
      const rows = [enabled.map((code) => ({ text: languageLabel(code), callback_data: `lang:${code}` }))];
      const otherRows = LANGUAGES.filter((l) => enabled.includes(l.code));
      if (otherRows.length > 8) {
        rows.length = 0;
        for (let i = 0; i < otherRows.length; i += 3) {
          rows.push(otherRows.slice(i, i + 3).map((l) => ({ text: l.label, callback_data: `lang:${l.code}` })));
        }
      }
      await tgSendMessage(bot.botToken, chatId, "Choose your language — content and missions will be delivered in it:", inlineKeyboard(rows));
      break;
    }

    case "campaigns": {
      const missions = await db.mission.findMany({ where: { botId: bot.id, status: "LIVE" }, orderBy: { createdAt: "desc" } });
      if (missions.length === 0) {
        await tgSendMessage(bot.botToken, chatId, "No active promotions right now.");
        break;
      }
      const list = missions
        .map((m) => `• <b>${escapeHtml(m.title)}</b>${m.product ? ` — ${escapeHtml(m.product)}` : ""}${m.targetUrl ? `\n  ${m.targetUrl}` : ""}`)
        .join("\n\n");
      await tgSendMessage(bot.botToken, chatId, `<b>Active campaigns:</b>\n\n${list}`);
      break;
    }

    case "leaderboard": {
      const top = await db.armyMember.findMany({ where: { botId: bot.id }, orderBy: { points: "desc" }, take: 10 });
      if (top.length === 0) {
        await tgSendMessage(bot.botToken, chatId, "The leaderboard is waiting for its first legend. That could be you.");
        break;
      }
      const medals = ["1.", "2.", "3."];
      const list = top
        .map((m, i) => `${medals[i] ?? `${i + 1}.`} <b>${escapeHtml(m.displayName)}</b> — ${m.points} pts`)
        .join("\n");
      await tgSendMessage(bot.botToken, chatId, `<b>🏆 ${escapeHtml(bot.armyName)} — Top 10</b>\n\n${list}\n\nShare more to climb. /refer to recruit.`);
      break;
    }

    case "refer": {
      if (!member) break;
      const code = member.refCode ?? `REF${member.telegramId.slice(-6)}`;
      const link = bot.botUsername
        ? `https://t.me/${bot.botUsername}?start=ref_${code}`
        : "Add @BotFather username to this bot first (owner action).";
      await tgSendMessage(
        bot.botToken,
        chatId,
        `<b>Your referral link:</b>\n${escapeHtml(link)}\n\nEvery recruit who joins through it earns you <b>+25 points</b>. Your total: <b>${member.referrals}</b> recruits.`,
      );
      break;
    }

    case "rewards": {
      const rewards = parseJsonSafe<{ name: string; type: string; cost: string; description: string }[]>(bot.rewardsJson) ?? [];
      const me = member ? await db.armyMember.findUnique({ where: { id: member.id } }) : null;
      const list = rewards.length
        ? rewards.map((r) => `• <b>${escapeHtml(r.name)}</b> (${escapeHtml(r.type)}) — ${escapeHtml(r.cost)}\n  ${escapeHtml(r.description)}`).join("\n\n")
        : "No reward tiers configured yet — points are still accumulating.";
      await tgSendMessage(
        bot.botToken,
        chatId,
        `<b>Rewards</b>\n\n${list}\n\nYour balance: <b>${me?.points ?? 0} points</b>.\nRewards are granted by the campaign owner when eligible. Nothing here is a guaranteed payout.`,
      );
      break;
    }

    case "submit": {
      if (!member) break;
      const link = args?.trim();
      if (!link || link.length < 6) {
        await tgSendMessage(bot.botToken, chatId, "Send it like this:\n/submit https://your-post-or-campaign-link");
        break;
      }
      const live = await db.mission.findFirst({ where: { botId: bot.id, status: "LIVE" }, orderBy: { createdAt: "desc" } });
      await db.submission.create({
        data: { botId: bot.id, missionId: live?.id ?? null, memberId: member.id, kind: "LINK", payload: link.slice(0, 500) },
      });
      await db.armyMember.update({ where: { id: member.id }, data: { shares: { increment: 1 }, points: { increment: 5 } } });
      await tgSendMessage(
        bot.botToken,
        chatId,
        "Submission received. The owner reviews shares before they count as verified traffic — you just earned +5 points.",
      );
      break;
    }

    default:
      await tgSendMessage(bot.botToken, chatId, "Unknown command. Type /help to see everything this bot can do.");
  }
}

// ─── callback handler (language selection etc.) ─────────────────────
async function handleCallback(
  bot: { id: string; botToken: string; languages: string },
  update: TgUpdate,
) {
  const cb = update.callback_query!;
  if (!cb.data) return;

  if (cb.data.startsWith("lang:")) {
    const code = cb.data.slice(5);
    const enabled = safeLangs(bot.languages);
    if (!enabled.includes(code)) return; // only bot-enabled languages
    await db.armyMember.updateMany({
      where: { botId: bot.id, telegramId: String(cb.from.id) },
      data: { language: code },
    });
    await tgAnswerCallbackQuery(bot.botToken, cb.id, `Language set: ${languageLabel(code)}`);
    if (cb.message) {
      await tgSendMessage(bot.botToken, cb.message.chat.id, `Language updated: <b>${languageLabel(code)}</b>. Missions and memes will now arrive in it.`);
    }
  }
}

function safeLangs(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : ["en"];
  } catch {
    return ["en"];
  }
}
