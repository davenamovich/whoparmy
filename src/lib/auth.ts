import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";
import type { WhopUserInfo } from "@/lib/whop";

/**
 * ─── Whop user anchor — the single authorization point of this app ───
 *
 * Resolution order:
 *   1. Signed session cookie (issued only by our own OAuth callback after
 *      a verified Whop token exchange — client-supplied IDs are never
 *      trusted for authorization).
 *   2. Fallback: the stable operator account so the full product remains
 *      exercisable in sandbox/dev mode before Whop credentials exist.
 *
 * Every query in the app filters by the ID returned here, so tenant
 * isolation holds regardless of which branch resolved the user.
 */
export async function getWhopUser(): Promise<User> {
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) {
    const user = await db.user.findUnique({ where: { id: sessionUserId } });
    if (user) return user;
  }
  return getOperatorUser();
}

/** Same as getWhopUser, but reports which branch resolved the identity. */
export async function getWhopUserWithMode(): Promise<{ user: User; mode: "whop" | "operator" }> {
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) {
    const user = await db.user.findUnique({ where: { id: sessionUserId } });
    if (user) return { user, mode: "whop" };
  }
  return { user: await getOperatorUser(), mode: "operator" };
}

/** Stable operator account (dev/sandbox mode before Whop credentials exist). */
async function getOperatorUser(): Promise<User> {
  const email = "whop-operator@plunderriffle.app";

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;

  return db.user.create({
    data: {
      email,
      name: "Whop Operator",
      whopId: "demo-whop-user",
      plan: "CREATOR",
      planSource: "default",
    },
  });
}

/**
 * Upsert the signed-in Whop identity (called ONLY from the OAuth callback
 * after the code exchange + userinfo round trip succeeded on the server).
 *
 * - Existing user with this whopId → refresh profile fields.
 * - Existing local user with the same verified email → link the Whop ID.
 * - Otherwise create a fresh account on the FREE plan; real entitlements
 *   arrive via Whop webhooks / entitlement sync (never hardcoded).
 */
export async function upsertWhopUser(info: WhopUserInfo): Promise<User> {
  const name = info.name?.trim() || info.preferred_username?.trim() || "Whop User";
  const username = info.preferred_username?.trim() || null;
  const email =
    info.email?.trim() ||
    `${info.sub}@users.whop.identity`; // deterministic anchor when the email scope is not granted

  const existingByWhopId = await db.user.findUnique({ where: { whopId: info.sub } });
  if (existingByWhopId) {
    return db.user.update({
      where: { id: existingByWhopId.id },
      data: { name, whopUsername: username, whopAvatarUrl: info.picture ?? null, whopId: info.sub },
    });
  }

  const existingByEmail = await db.user.findUnique({ where: { email } });
  if (existingByEmail) {
    return db.user.update({
      where: { id: existingByEmail.id },
      data: { name, whopId: info.sub, whopUsername: username, whopAvatarUrl: info.picture ?? null },
    });
  }

  return db.user.create({
    data: {
      email,
      name,
      whopId: info.sub,
      whopUsername: username,
      whopAvatarUrl: info.picture ?? null,
      plan: "FREE",
      planSource: "default",
    },
  });
}
