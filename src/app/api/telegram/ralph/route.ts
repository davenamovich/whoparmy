import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { createPairCode, ensureRalphWebhook, ralphBotConfig } from "@/lib/ralph-telegram";

export const runtime = "nodejs";

/**
 * Member-facing Ralph-on-Telegram state.
 * GET  → is the bot configured, and is this member linked?
 * POST → mint a one-time pair code + deep link (and lazily make sure
 *        the webhook points at us). DELETE → unlink.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const cfg = ralphBotConfig();
    const link = cfg ? await db.telegramLink.findUnique({ where: { userId: user.id } }) : null;
    return NextResponse.json({
      configured: !!cfg,
      username: cfg?.username ?? null,
      linked: !!link,
      linkedUsername: link?.username ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load Telegram state" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const pair = await createPairCode(user.id);
    if (!pair) {
      return NextResponse.json({ error: "The Ralph Telegram bot isn't configured on this deployment yet." }, { status: 503 });
    }
    await ensureRalphWebhook(req.nextUrl.origin);
    return NextResponse.json(pair);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create pair code" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getWhopUser();
    await db.telegramLink.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ linked: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to unlink" }, { status: 500 });
  }
}
