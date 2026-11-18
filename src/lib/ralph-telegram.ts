import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  escapeHtml,
  inlineKeyboard,
  tgAnswerCallbackQuery,
  tgSendMessage,
  tgSetWebhook,
  type TgUpdate,
} from "@/lib/telegram";
import { RALPH_MENU, ralphAction, ralphActions, ralphFreeText, ralphGreeting, type RalphActionId, type RalphReply } from "@/lib/ralph";

/**
 * ─── RALPH ON TELEGRAM (Dave, 2026-11-18) ───────────────────────────
 * One house bot; members pair their chat to their account with a
 * one-time deep-link code, then Ralph serves them on Telegram with
 * the SAME brain and the SAME memory scope as the web chat
 * (src/lib/ralph.ts). Telegram's inline keyboards are the one-click
 * buttons. Ralph routes and summarizes only — publishing, sending
 * and spending stay behind the web approval UI, here too.
 *
 * Env (operator-set): TELEGRAM_RALPH_BOT_TOKEN,
 * TELEGRAM_RALPH_WEBHOOK_SECRET, TELEGRAM_RALPH_BOT_USERNAME.
 */

const APP_URL = "https://whop.plunderandriffle.com";
const PAIR_TTL_MS = 15 * 60_000;

export function ralphBotConfig(): { token: string; secret: string; username: string } | null {
  const token = process.env.TELEGRAM_RALPH_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_RALPH_WEBHOOK_SECRET?.trim();
  const username = process.env.TELEGRAM_RALPH_BOT_USERNAME?.trim().replace(/^@/, "");
  if (!token || !secret || !username) return null;
  return { token, secret, username };
}

export async function createPairCode(userId: string): Promise<{ code: string; deepLink: string } | null> {
  const cfg = ralphBotConfig();
  if (!cfg) return null;
  const code = randomBytes(8).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase();
  await db.telegramPairCode.deleteMany({ where: { userId, usedAt: null } });
  await db.telegramPairCode.create({
    data: { userId, code, expiresAt: new Date(Date.now() + PAIR_TTL_MS) },
  });
  return { code, deepLink: `https://t.me/${cfg.username}?start=${code}` };
}

let webhookEnsured = false;

/** Best-effort, idempotent: point Telegram at our webhook. */
export async function ensureRalphWebhook(origin: string): Promise<void> {
  const cfg = ralphBotConfig();
  if (!cfg || webhookEnsured) return;
  try {
    const out = await tgSetWebhook(cfg.token, `${origin}/api/telegram/ralph/webhook`, cfg.secret);
    if (out.ok) webhookEnsured = true;
  } catch {
    // retried on the next pair request
  }
}

function clampLocale(raw?: string): string {
  const base = (raw ?? "en").slice(0, 2).toLowerCase();
  return ["en", "es", "ja", "ru"].includes(base) ? base : "en";
}

// Last trending topics per chat — topic taps resolve against this.
const topicCache = new Map<string, string[]>();

function keyboardFor(locale: string, reply: RalphReply): Record<string, unknown> {
  const labels = new Map(ralphActions(locale).map((a) => [a.id, a.label]));
  const rows: { text: string; callback_data?: string; url?: string }[][] = [];
  for (const id of reply.actions.slice(0, 4)) {
    rows.push([{ text: labels.get(id) ?? id, callback_data: `a:${id}` }]);
  }
  if (reply.nav) {
    rows.push([{ text: "Open in Whoparmy ↗", url: APP_URL }]);
  }
  return inlineKeyboard(rows);
}

async function sendReply(token: string, chatId: string, locale: string, reply: RalphReply): Promise<void> {
  if (reply.topics?.length) topicCache.set(chatId, reply.topics);
  await tgSendMessage(token, chatId, escapeHtml(reply.text), keyboardFor(locale, reply));
  if (reply.topics?.length) {
    const rows = reply.topics.slice(0, 5).map((t, i) => [{ text: t.slice(0, 60), callback_data: `t:${i}` }]);
    await tgSendMessage(token, chatId, "Pick a topic and it's loaded for you in Create:", inlineKeyboard(rows));
  }
}

const PAIR_FIRST =
  "This chat isn't linked to a Whoparmy account yet.\n\nOpen Whoparmy → Account → Connect Telegram, tap the link there, and I'll know it's you. One tap — no passwords, ever.";

export async function handleRalphUpdate(update: TgUpdate): Promise<void> {
  const cfg = ralphBotConfig();
  if (!cfg) return;
  const token = cfg.token;

  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = String(cb.message?.chat.id ?? cb.from.id);
    const locale = clampLocale((cb.from as { language_code?: string }).language_code);
    await tgAnswerCallbackQuery(token, cb.id);
    const link = await db.telegramLink.findUnique({ where: { chatId } });
    if (!link) {
      await tgSendMessage(token, chatId, escapeHtml(PAIR_FIRST));
      return;
    }
    const data = cb.data ?? "";
    if (data.startsWith("a:")) {
      const id = data.slice(2) as RalphActionId;
      if ((RALPH_MENU as string[]).includes(id)) {
        const reply = await ralphAction(link.userId, locale, id);
        await sendReply(token, chatId, locale, reply);
      }
      return;
    }
    if (data.startsWith("t:")) {
      const idx = Number(data.slice(2));
      const topic = topicCache.get(chatId)?.[idx];
      if (topic) {
        await tgSendMessage(
          token,
          chatId,
          escapeHtml(`Good pick — "${topic}" is today's board. Open Create in Whoparmy and it lands in the Meme Studio, ready to generate.`),
          inlineKeyboard([[{ text: "Open Whoparmy ↗", url: APP_URL }]]),
        );
      }
      return;
    }
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const locale = clampLocale((msg.from as { language_code?: string } | undefined)?.language_code);
  const text = msg.text.trim();

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.trim().toUpperCase();
    if (code) {
      const row = await db.telegramPairCode.findUnique({ where: { code } });
      if (row && !row.usedAt && row.expiresAt.getTime() > Date.now()) {
        await db.telegramPairCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
        await db.telegramLink.deleteMany({ where: { OR: [{ userId: row.userId }, { chatId }] } });
        await db.telegramLink.create({
          data: { userId: row.userId, chatId, username: msg.from?.username ?? null },
        });
        const greeting = await ralphGreeting(row.userId, locale);
        await tgSendMessage(token, chatId, escapeHtml("Linked. This chat is your Whoparmy account now — same memory, same bots."));
        await sendReply(token, chatId, locale, greeting);
        return;
      }
      await tgSendMessage(token, chatId, escapeHtml("That link code expired or was already used. Grab a fresh one: Whoparmy → Account → Connect Telegram."));
      return;
    }
    const link = await db.telegramLink.findUnique({ where: { chatId } });
    if (link) {
      await sendReply(token, chatId, locale, await ralphGreeting(link.userId, locale));
    } else {
      await tgSendMessage(token, chatId, escapeHtml(PAIR_FIRST));
    }
    return;
  }

  if (text.startsWith("/stop")) {
    await db.telegramLink.deleteMany({ where: { chatId } });
    await tgSendMessage(token, chatId, escapeHtml("Unlinked. I won't message this chat again. Your Whoparmy account and memory are untouched."));
    return;
  }

  const link = await db.telegramLink.findUnique({ where: { chatId } });
  if (!link) {
    await tgSendMessage(token, chatId, escapeHtml(PAIR_FIRST));
    return;
  }
  if (text.startsWith("/menu") || text.startsWith("/help")) {
    await sendReply(token, chatId, locale, { text: "Everything I can route for you — one tap:", actions: RALPH_MENU.slice(0, 4) });
    return;
  }
  const reply = await ralphFreeText(link.userId, locale, text.slice(0, 2000), []);
  await sendReply(token, chatId, locale, reply);
}
