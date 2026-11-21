import { NextRequest, NextResponse } from "next/server";
import {
  consumeTelegramPairCode,
  peekTelegramPairCode,
  telegramPairConfigured,
  telegramPairSecretOk,
} from "@/lib/telegram-pair";
import {
  bindTelegramIdentityAndClaim,
  telegramIdentityBoundToOther,
} from "@/lib/identity-server";
import { normalizeIdentityValue } from "@/lib/identity";

export const runtime = "nodejs";

/**
 * POST /api/telegram/pair/verify — server-to-server, called by the
 * meme-loop-engine bot when a user arrives with /start whop_<code>.
 * Guarded by TELEGRAM_PAIR_SECRET (header x-pair-secret); unarmed
 * (503) until Dave sets it on both services. Success consumes the
 * code and returns the member's userId — the bot then binds that
 * Telegram account to the member's shared memory scope.
 *
 * Spine A (2026-11-21): when the bot also sends `telegramId` (the
 * Telegram user id of the account that arrived with the code),
 * pairing additionally binds that id as an IdentityLink for the
 * member and claims any pending referral captured from a
 * Telegram-first arrival. Requests WITHOUT telegramId behave exactly
 * as before. An alias already bound to a different member is refused
 * with the same generic 401 as a bad code — checked BEFORE the
 * single-use code is consumed, and never naming the other member.
 */
export async function POST(req: NextRequest) {
  if (!telegramPairConfigured()) {
    return NextResponse.json({ error: "pairing not configured" }, { status: 503 });
  }
  if (!telegramPairSecretOk(req.headers.get("x-pair-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    code?: unknown;
    telegramId?: unknown;
  };
  const code = typeof body.code === "string" ? body.code : "";
  const telegramId =
    body.telegramId === undefined || body.telegramId === null
      ? ""
      : normalizeIdentityValue("telegram", body.telegramId);

  if (telegramId) {
    // Refuse an alias conflict before spending the single-use code.
    const peeked = await peekTelegramPairCode(code);
    if (!peeked) {
      return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
    }
    if (await telegramIdentityBoundToOther(telegramId, peeked)) {
      return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
    }
    const userId = await consumeTelegramPairCode(code);
    if (!userId) {
      return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
    }
    const bound = await bindTelegramIdentityAndClaim(userId, telegramId);
    if (!bound.ok) {
      // Lost a bind race after consumption (another pairing for the
      // same Telegram id landed first). Same generic shape as a bad
      // code; the member can mint a fresh code and retry.
      return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
    }
    return NextResponse.json({ userId }, { headers: { "Cache-Control": "no-store" } });
  }

  const userId = await consumeTelegramPairCode(code);
  if (!userId) {
    return NextResponse.json({ error: "invalid or expired code" }, { status: 401 });
  }
  return NextResponse.json({ userId }, { headers: { "Cache-Control": "no-store" } });
}
