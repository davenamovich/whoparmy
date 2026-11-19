import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";
import type { WhopUserInfo } from "@/lib/whop";

/**
 * Thrown when a request has no signed session and the anonymous operator
 * fallback is not explicitly enabled. Route catches map it to 401 via
 * statusForAuthError(); before 2026-11-18 the fallback resolved ANY
 * anonymous request to the shared operator account (Codex whole-repo
 * review, verified live) — that is the hole this closes.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Sign in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The anonymous operator fallback is a dev/sandbox convenience ONLY.
 *  It is on solely when ALLOW_OPERATOR_FALLBACK=1 is set explicitly —
 *  the same flag the LLM console guard already used. Production never
 *  sets it, so a missing/invalid session is simply signed out. */
export function operatorFallbackAllowed(): boolean {
  return process.env.ALLOW_OPERATOR_FALLBACK === "1";
}

/** Map a caught error to an HTTP status: auth failures are 401, the
 *  route's own default (usually 500) stands for everything else. */
export function statusForAuthError(err: unknown, fallbackStatus = 500): number {
  return err instanceof UnauthorizedError ? 401 : fallbackStatus;
}

/**
 * ─── Whop user anchor — the single authorization point of this app ───
 *
 * Resolution order:
 *   1. Signed session cookie (issued only by our own OAuth callback after
 *      a verified Whop token exchange — client-supplied IDs are never
 *      trusted for authorization).
 *   2. Fallback (dev/sandbox only, ALLOW_OPERATOR_FALLBACK=1): the stable
 *      operator account so the full product remains exercisable before
 *      Whop credentials exist. With the flag off — production — an
 *      anonymous request throws UnauthorizedError instead.
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
  if (operatorFallbackAllowed()) return getOperatorUser();
  throw new UnauthorizedError();
}

/** Same as getWhopUser, but reports which branch resolved the identity. */
/** Designated operators: real Whop accounts that get operator mode.
 *  Set OPERATOR_WHOP_IDS (Whop user ids) and/or OPERATOR_WHOP_USERNAMES
 *  in the app env — this is how the owner keeps operator surfaces
 *  (LLM console) with a real Whop login once the anonymous fallback
 *  is locked down in production. */
export function isDesignatedOperator(user: { whopId: string | null; whopUsername: string | null }): boolean {
  const ids = (process.env.OPERATOR_WHOP_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const names = (process.env.OPERATOR_WHOP_USERNAMES ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (user.whopId && ids.includes(user.whopId)) return true;
  if (user.whopUsername && names.includes(user.whopUsername.toLowerCase())) return true;
  return false;
}

export async function getWhopUserWithMode(): Promise<{ user: User; mode: "whop" | "operator"; viaFallback: boolean }> {
  const sessionUserId = await getSessionUserId();
  if (sessionUserId) {
    const user = await db.user.findUnique({ where: { id: sessionUserId } });
    if (user) return { user, mode: isDesignatedOperator(user) ? "operator" : "whop", viaFallback: false };
  }
  if (operatorFallbackAllowed()) {
    return { user: await getOperatorUser(), mode: "operator", viaFallback: true };
  }
  throw new UnauthorizedError();
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
