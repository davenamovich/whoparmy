import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * ─── STATIC-PAGE CLAIM BRIDGE ───────────────────────────────────────
 *
 * Dave's ask (2026-11-17): users win on static pages (the board, the
 * static doors game) where there is no account and no balance — how
 * do they claim? Answer: the win arrives as a signed token, and the
 * member claims it here, signed in, where the balance lives.
 *
 * Token format:  W1.<base64url(payload)>.<base64url(signature)>
 *   payload   = { v: 1, amt, nonce, exp, src }
 *   signature = HMAC-SHA256(payload segment, CLAIM_BRIDGE_SECRET)
 *
 * The secret is shared server-to-server (same pattern as the
 * /muse-week bridge key): whoever runs the game mints tokens with
 * it; Whoparmy only verifies. The static page itself never holds the
 * secret — its backend (or the operator mint route) hands the player
 * a finished token, usually as the /claim?code=… deep link.
 *
 * Single-use is enforced by the ClaimRedemption nonce unique index:
 * a token can pay exactly once, to exactly one member, ever. Wins
 * pay free generations — the same pool referral rewards use.
 * Spec for minters: docs/CLAIM-BRIDGE.md.
 */

export const CLAIM_MAX_AMOUNT = 100_000;
export const CLAIM_DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface ClaimPayload {
  v: 1;
  amt: number;
  nonce: string;
  exp: number; // unix seconds
  src: string;
}

export function claimSecret(): string | null {
  const s = process.env.CLAIM_BRIDGE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadSegment: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

/** Mint a win token. Server-side only — the caller holds the secret. */
export function mintClaimToken(opts: {
  amount: number;
  source: string;
  ttlSeconds?: number;
  secret?: string;
}): string {
  const secret = opts.secret ?? claimSecret();
  if (!secret) throw new Error("CLAIM_NOT_CONFIGURED");
  const amount = Math.floor(opts.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > CLAIM_MAX_AMOUNT) {
    throw new Error("BAD_AMOUNT");
  }
  const payload: ClaimPayload = {
    v: 1,
    amt: amount,
    nonce: randomBytes(12).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? CLAIM_DEFAULT_TTL_SECONDS),
    src: String(opts.source || "static").slice(0, 40),
  };
  const segment = b64url(JSON.stringify(payload));
  return `W1.${segment}.${sign(segment, secret)}`;
}

export type VerifyResult =
  | { ok: true; payload: ClaimPayload }
  | { ok: false; error: string };

/** Verify a token's signature, shape and expiry. Does NOT redeem it. */
export function verifyClaimToken(token: string, secret?: string): VerifyResult {
  const key = secret ?? claimSecret();
  if (!key) return { ok: false, error: "Claims are not configured on this deployment yet." };
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 3 || parts[0] !== "W1") {
    return { ok: false, error: "That claim code doesn't look right — paste the whole code." };
  }
  const [, segment, sig] = parts;
  const expected = sign(segment, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "That claim code isn't valid — it may have been copied incompletely." };
  }
  let payload: ClaimPayload;
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString()) as ClaimPayload;
  } catch {
    return { ok: false, error: "That claim code isn't valid." };
  }
  if (
    payload.v !== 1 ||
    !Number.isInteger(payload.amt) ||
    payload.amt < 1 ||
    payload.amt > CLAIM_MAX_AMOUNT ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 8 ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, error: "That claim code isn't valid." };
  }
  if (payload.exp * 1000 <= Date.now()) {
    return { ok: false, error: "That claim code has expired — wins must be claimed within 30 days." };
  }
  return { ok: true, payload };
}

export type RedeemResult =
  | { ok: true; amount: number; source: string; newBalance: number }
  | { ok: false; error: string };

/**
 * Redeem a win token for a signed-in member: record the redemption
 * (the nonce unique index is the single-use lock) and pay the free
 * generations in the same transaction.
 */
export async function redeemClaim(userId: string, token: string): Promise<RedeemResult> {
  const verified = verifyClaimToken(token);
  if (!verified.ok) return verified;
  const { payload } = verified;
  // Voided nonces: tokens are stateless, so an issued code is killed by
  // remembering its nonce on the ClaimVoidedNonce denylist (written by
  // the boot-time agent-game purge). A voided code never pays.
  const voided = await db.claimVoidedNonce.findUnique({
    where: { nonce: payload.nonce },
    select: { nonce: true },
  });
  if (voided) {
    return { ok: false, error: "That claim code has been voided and can no longer be claimed." };
  }
  try {
    const newBalance = await db.$transaction(async (tx) => {
      await tx.claimRedemption.create({
        data: { nonce: payload.nonce, userId, amount: payload.amt, source: payload.src },
      });
      const user = await tx.user.update({
        where: { id: userId },
        data: { freeGenBalance: { increment: payload.amt } },
        select: { freeGenBalance: true },
      });
      return user.freeGenBalance;
    });
    return { ok: true, amount: payload.amt, source: payload.src, newBalance };
  } catch (err) {
    // ONLY a unique-nonce conflict means "already claimed". The old
    // catch-all told a member whose redemption failed on a transient
    // database error that their win was gone — it was not.
    const code = (err as { code?: unknown })?.code;
    const message = err instanceof Error ? err.message : "";
    if (code === "P2002" || /unique constraint/i.test(message)) {
      return { ok: false, error: "This win has already been claimed." };
    }
    console.error("[claims] redemption failed", err instanceof Error ? err.message : err);
    throw new Error("The claim could not be completed — please try again.");
  }
}
