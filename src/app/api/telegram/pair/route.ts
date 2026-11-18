import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { mintTelegramPairCode } from "@/lib/telegram-pair";

export const runtime = "nodejs";

/**
 * POST /api/telegram/pair — the signed-in member mints a one-time
 * Telegram pairing code. The response carries the deep link that
 * opens @PlunderRiffleBot with the code attached; the plaintext code
 * is shown once (only its hash is stored). The anonymous fallback in
 * getWhopUser resolves to the operator account, which is Dave's own
 * test path — the Account card that calls this only renders inside
 * the signed-in app.
 */
export async function POST() {
  const user = await getWhopUser();
  const minted = await mintTelegramPairCode(user.id);
  return NextResponse.json(
    {
      code: minted.code,
      expiresAt: minted.expiresAt,
      botLink: `https://t.me/PlunderRiffleBot?start=whop_${minted.code}`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
