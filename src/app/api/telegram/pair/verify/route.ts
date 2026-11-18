import { NextRequest, NextResponse } from "next/server";
import {
  consumeTelegramPairCode,
  telegramPairConfigured,
  telegramPairSecretOk,
} from "@/lib/telegram-pair";

export const runtime = "nodejs";

/**
 * POST /api/telegram/pair/verify — server-to-server, called by the
 * meme-loop-engine bot when a user arrives with /start whop_<code>.
 * Guarded by TELEGRAM_PAIR_SECRET (header x-pair-secret); unarmed
 * (503) until Dave sets it on both services. Success consumes the
 * code and returns the member's userId — the bot then binds that
 * Telegram account to the member's shared memory scope.
 */
export async function POST(req: NextRequest) {
  if (!telegramPairConfigured()) {
    return NextResponse.json({ error: "pairing not configured" }, { status: 503 });
  }
  if (!telegramPairSecretOk(req.headers.get("x-pair-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  const userId = await consumeTelegramPairCode(code);
  if (!userId) {
    return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
  }
  return NextResponse.json({ userId }, { headers: { "Cache-Control": "no-store" } });
}
