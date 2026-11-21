import "server-only";
import { db } from "@/lib/db";
import {
  bindIdentityLink,
  claimPendingReferral,
  resolveIdentityLink,
  type IdentityDb,
} from "@/lib/identity";
import { awardXp } from "@/lib/game";

/**
 * ─── ATTRIBUTION SPINE A — server wrappers (2026-11-21) ─────────────
 * Thin adapters from lib/identity.ts's pure core onto the real db.
 * The cast is deliberate: the pure core declares the minimal
 * prisma-like surface it needs so it can be unit-tested with a fake.
 */
const idb = db as unknown as IdentityDb;

/** True when the telegram alias is already bound to a DIFFERENT user. */
export async function telegramIdentityBoundToOther(
  telegramId: string,
  userId: string,
): Promise<boolean> {
  const owner = await resolveIdentityLink(idb, "telegram", telegramId);
  return owner !== null && owner !== userId;
}

/**
 * Pairing completion (Spine A): bind the member's Telegram id as an
 * IdentityLink, then claim any pending referral captured from a
 * Telegram-first arrival. A claimed referral mirrors the web claim
 * flow exactly (set-once referredById + the referrer's join XP); no
 * ReferralEarning is created — that still fires on conversion.
 * Returns ok:false only on an alias conflict (bound to another user).
 */
export async function bindTelegramIdentityAndClaim(
  userId: string,
  telegramId: string,
): Promise<{ ok: boolean; bindStatus?: string; claimStatus?: string }> {
  const bind = await bindIdentityLink(idb, {
    userId,
    kind: "telegram",
    value: telegramId,
    verifiedAt: new Date(),
  });
  if (bind.status === "conflict" || bind.status === "invalid") {
    return { ok: false, bindStatus: bind.status };
  }
  const claim = await claimPendingReferral(idb, {
    userId,
    kind: "telegram",
    value: telegramId,
  });
  if (claim.status === "claimed") {
    await awardXp(claim.referrerId, "REFERRAL_JOINED", "telegram").catch(() => {});
  }
  return { ok: true, bindStatus: bind.status, claimStatus: claim.status };
}
