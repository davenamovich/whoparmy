import { NextRequest, NextResponse } from "next/server";
import { handleRalphUpdate, ralphBotConfig } from "@/lib/ralph-telegram";
import type { TgUpdate } from "@/lib/telegram";

export const runtime = "nodejs";

/**
 * Ralph bot webhook. Telegram authenticates with the secret-token
 * header set at setWebhook time; anything else is dropped. Always
 * 200 — Telegram retries non-200s and Ralph would rather lose one
 * update than loop on it.
 */
export async function POST(req: NextRequest) {
  const cfg = ralphBotConfig();
  if (!cfg) return NextResponse.json({ ok: true });
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (header !== cfg.secret) return NextResponse.json({ ok: true });
  try {
    const update = (await req.json()) as TgUpdate;
    await handleRalphUpdate(update);
  } catch {
    // swallowed by design — see header comment
  }
  return NextResponse.json({ ok: true });
}
