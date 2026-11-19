import "server-only";
import { db } from "@/lib/db";
import { internalBotBudget } from "@/lib/agents";

/**
 * ─── REFERRAL BOT GRANT — a bot with action behind it ───────────────
 *
 * Dave's direction (2026-11-17): members who refer must be
 * incentivised — the referrer gets a bot for 24 hours — "but need to
 * put action behind the bot." The grant fires on the same verified
 * first link save that pays the referrer's +25 free generations
 * (lib/bridge.ts): the bot and the generations that fuel its jobs
 * arrive together.
 *
 * The bot is a real Meme Smith hire (source = "REFERRAL"): it takes
 * real jobs through the normal Agents job route and the agent runner
 * executes them like any rental. It is NOT a plan seat — it never
 * counts against any plan limit, never fires the first-rental conversion,
 * and its internal fuel is not part of the member's wallet ledger.
 * At expiresAt the bot stops: lazily flipped to PAUSED on read, and
 * the job route refuses it with a specific message. Referring
 * another member whose recruit saves their links grants another
 * 24 hours (the window extends; an expired grant restarts fresh,
 * refuelled).
 */

export const REFERRAL_BOT_HOURS = 24;
export const REFERRAL_BOT_TEMPLATE = "meme-smith";
export const REFERRAL_BOT_NAME = "Meme Smith — referral bot";

type HireLike = { source?: string | null; expiresAt?: Date | string | null };

/** True when a REFERRAL hire's 24-hour window has closed. */
export function isGrantExpired(hire: HireLike, now = new Date()): boolean {
  if (hire.source !== "REFERRAL" || !hire.expiresAt) return false;
  return new Date(hire.expiresAt).getTime() <= now.getTime();
}

/** Lazily park any of the member's referral bots whose window closed. */
export async function expireReferralBots(userId: string): Promise<void> {
  await db.hiredAgent.updateMany({
    where: {
      userId,
      source: "REFERRAL",
      status: "ACTIVE",
      expiresAt: { lte: new Date() },
    },
    data: { status: "PAUSED" },
  });
}

/**
 * Grant (or extend) the member's 24-hour referral bot. Idempotent per
 * call site: bridge.ts calls it exactly once per referred recruit's
 * first link save, so each qualifying referral adds 24 hours.
 * Returns the hire, or null if the member doesn't exist.
 */
export async function grantReferralBot(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, plan: true } });
  if (!user) return null;
  const now = new Date();
  const budget = internalBotBudget(user.plan);
  const existing = await db.hiredAgent.findFirst({
    where: { userId, source: "REFERRAL" },
    orderBy: { createdAt: "asc" },
  });
  if (!existing) {
    return db.hiredAgent.create({
      data: {
        userId,
        templateKey: REFERRAL_BOT_TEMPLATE,
        name: REFERRAL_BOT_NAME,
        tokenBudget: budget,
        tokensUsed: 0,
        status: "ACTIVE",
        source: "REFERRAL",
        expiresAt: new Date(now.getTime() + REFERRAL_BOT_HOURS * 60 * 60 * 1000),
      },
    });
  }
  const wasExpired = isGrantExpired(existing, now);
  const base = wasExpired ? now : (existing.expiresAt ?? now);
  return db.hiredAgent.update({
    where: { id: existing.id },
    data: {
      status: "ACTIVE",
      expiresAt: new Date(base.getTime() + REFERRAL_BOT_HOURS * 60 * 60 * 1000),
      // A restarted grant is a fresh bot: refuel it. A live extension
      // keeps its spend and tops the budget up by one grant's worth.
      tokenBudget: wasExpired ? budget : existing.tokenBudget + budget,
      tokensUsed: wasExpired ? 0 : existing.tokensUsed,
    },
  });
}
