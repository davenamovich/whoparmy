/**
 * ─── ATTRIBUTION SPINE A — identity binding (pure core) ─────────────
 *
 * One person = one Whop Army User (the root identity). Every other
 * identifier is an alias bound to that root in IdentityLink. This
 * module is the pure logic over a prisma-like client (unit-tested
 * with an in-memory fake; the server wrappers in
 * lib/identity-server.ts pass the real db).
 *
 * Invariants (Dave, 2026-11-21 — set-once, everywhere):
 *  - An alias (kind, value) belongs to exactly one user, ever.
 *    Binding it to the SAME user again is an idempotent no-op;
 *    binding it to a DIFFERENT user is a typed conflict — never a
 *    silent rebind.
 *  - A PendingReferral is first-referrer-wins: recorded once, never
 *    overwritten.
 *  - The claim moves a pending referrer onto User.referredById only
 *    when the user has no referrer yet, never for a self-referral,
 *    and consumes the pending row. No ReferralEarning is created
 *    here — earnings still fire from the existing conversion path
 *    (lib/referrals.ts recordConversion) once the recruit converts.
 *
 * Kinds written this slice: "telegram" (value = Telegram user id as
 * a string). Reserved by the design doc, not written here:
 * "telegram_bot_ref", "agent_game", "wallet_evm", "wallet_btc".
 */

export interface IdentityLinkRow {
  id: string;
  userId: string;
  kind: string;
  value: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingReferralRow {
  id: string;
  kind: string;
  value: string;
  referrerId: string;
  createdAt: Date;
}

/** The slice of the prisma client this module needs. */
export interface IdentityDb {
  identityLink: {
    findUnique(args: {
      where: { kind_value: { kind: string; value: string } };
    }): Promise<IdentityLinkRow | null>;
    findMany(args: {
      where: { userId: string };
      orderBy?: { createdAt: "asc" | "desc" };
    }): Promise<IdentityLinkRow[]>;
    create(args: {
      data: { userId: string; kind: string; value: string; verifiedAt?: Date | null };
    }): Promise<IdentityLinkRow>;
  };
  pendingReferral: {
    findUnique(args: {
      where: { kind_value: { kind: string; value: string } };
    }): Promise<PendingReferralRow | null>;
    create(args: {
      data: { kind: string; value: string; referrerId: string };
    }): Promise<PendingReferralRow>;
    delete(args: { where: { id: string } }): Promise<PendingReferralRow>;
  };
  user: {
    findUnique(args: {
      where: { id: string };
      select: { referredById: true };
    }): Promise<{ referredById: string | null } | null>;
    updateMany(args: {
      where: { id: string; referredById: null };
      data: { referredById: string };
    }): Promise<{ count: number }>;
  };
}

export function normalizeIdentityKind(kind: unknown): string {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

export function normalizeIdentityValue(kind: string, value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") return "";
  const v = value.trim();
  // Telegram user ids are bare numerics; a stray leading "+" from a
  // hand-built payload is the same id.
  if (kind === "telegram") return v.replace(/^\+/, "");
  return v;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

export type BindResult =
  | { status: "bound"; link: IdentityLinkRow }
  | { status: "existing"; link: IdentityLinkRow }
  | { status: "conflict" }
  | { status: "invalid" };

/**
 * Bind an alias to a user. Idempotent for the same user+alias; a
 * different user claiming an already-bound alias gets "conflict"
 * and the existing binding is left untouched.
 */
export async function bindIdentityLink(
  db: IdentityDb,
  input: { userId: string; kind: string; value: unknown; verifiedAt?: Date | null },
): Promise<BindResult> {
  const kind = normalizeIdentityKind(input.kind);
  const value = normalizeIdentityValue(kind, input.value);
  if (!input.userId || !kind || !value) return { status: "invalid" };
  const existing = await db.identityLink.findUnique({
    where: { kind_value: { kind, value } },
  });
  if (existing) {
    return existing.userId === input.userId
      ? { status: "existing", link: existing }
      : { status: "conflict" };
  }
  try {
    const link = await db.identityLink.create({
      data: { userId: input.userId, kind, value, verifiedAt: input.verifiedAt ?? null },
    });
    return { status: "bound", link };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost a race: re-read and judge the winner.
    const winner = await db.identityLink.findUnique({
      where: { kind_value: { kind, value } },
    });
    if (winner && winner.userId === input.userId) return { status: "existing", link: winner };
    return { status: "conflict" };
  }
}

/** Resolve an alias to its owning userId, or null when unbound. */
export async function resolveIdentityLink(
  db: IdentityDb,
  kind: string,
  value: unknown,
): Promise<string | null> {
  const k = normalizeIdentityKind(kind);
  const v = normalizeIdentityValue(k, value);
  if (!k || !v) return null;
  const link = await db.identityLink.findUnique({
    where: { kind_value: { kind: k, value: v } },
  });
  return link?.userId ?? null;
}

/** All aliases bound to a user, oldest first. */
export async function aliasesForUser(
  db: IdentityDb,
  userId: string,
): Promise<IdentityLinkRow[]> {
  if (!userId) return [];
  return db.identityLink.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export type RecordPendingResult =
  | { status: "created"; pending: PendingReferralRow }
  | { status: "existing"; pending: PendingReferralRow }
  | { status: "invalid" };

/**
 * Record a referral for an alias whose owner has no Whop account
 * yet. First referrer wins: an existing row is returned as-is and
 * NEVER overwritten.
 */
export async function recordPendingReferral(
  db: IdentityDb,
  input: { kind: string; value: unknown; referrerId: string },
): Promise<RecordPendingResult> {
  const kind = normalizeIdentityKind(input.kind);
  const value = normalizeIdentityValue(kind, input.value);
  if (!kind || !value || !input.referrerId) return { status: "invalid" };
  const existing = await db.pendingReferral.findUnique({
    where: { kind_value: { kind, value } },
  });
  if (existing) return { status: "existing", pending: existing };
  try {
    const pending = await db.pendingReferral.create({
      data: { kind, value, referrerId: input.referrerId },
    });
    return { status: "created", pending };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.pendingReferral.findUnique({
      where: { kind_value: { kind, value } },
    });
    if (winner) return { status: "existing", pending: winner };
    throw err;
  }
}

export type ClaimResult =
  | { status: "claimed"; referrerId: string }
  | { status: "none" }
  | { status: "no-user" }
  | { status: "self"; referrerId: string }
  | { status: "already-attributed"; referrerId: string };

/**
 * Claim a pending referral for a user who just bound the alias
 * (pairing). Set-once: applies only when User.referredById is still
 * null, via the same conditional-update claim pattern as
 * lib/referrals.ts attributeReferral. The pending row is consumed
 * in every terminal state where this user owns the alias — claimed,
 * self (a self-referral can never fire), and already-attributed
 * (their referrer is fixed forever, so the pending row is dead).
 */
export async function claimPendingReferral(
  db: IdentityDb,
  input: { userId: string; kind: string; value: unknown },
): Promise<ClaimResult> {
  const kind = normalizeIdentityKind(input.kind);
  const value = normalizeIdentityValue(kind, input.value);
  if (!input.userId || !kind || !value) return { status: "none" };
  const pending = await db.pendingReferral.findUnique({
    where: { kind_value: { kind, value } },
  });
  if (!pending) return { status: "none" };
  if (pending.referrerId === input.userId) {
    await db.pendingReferral.delete({ where: { id: pending.id } });
    return { status: "self", referrerId: pending.referrerId };
  }
  const me = await db.user.findUnique({
    where: { id: input.userId },
    select: { referredById: true },
  });
  if (!me) return { status: "no-user" };
  if (me.referredById) {
    await db.pendingReferral.delete({ where: { id: pending.id } });
    return { status: "already-attributed", referrerId: me.referredById };
  }
  const claimed = await db.user.updateMany({
    where: { id: input.userId, referredById: null },
    data: { referredById: pending.referrerId },
  });
  if (claimed.count !== 1) {
    // A concurrent attribution won; the pending row is dead either way.
    await db.pendingReferral.delete({ where: { id: pending.id } });
    const now = await db.user.findUnique({
      where: { id: input.userId },
      select: { referredById: true },
    });
    return { status: "already-attributed", referrerId: now?.referredById ?? pending.referrerId };
  }
  await db.pendingReferral.delete({ where: { id: pending.id } });
  return { status: "claimed", referrerId: pending.referrerId };
}

/** Display-safe alias value: only the last 4 characters survive. */
export function maskIdentityValue(kind: string, value: string): string {
  const v = normalizeIdentityValue(normalizeIdentityKind(kind), value);
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}
