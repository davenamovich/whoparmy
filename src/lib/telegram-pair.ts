import { createHash, randomInt, timingSafeEqual } from "crypto";
import { db as prisma } from "@/lib/db";

/**
 * Telegram pairing codes (Dave, 2026-11-18) — the Whoparmy half of
 * wire 3 in BOT-TELEGRAM-UPGRADE-SPEC.md. A signed-in member mints a
 * one-time code, opens @PlunderWelcomeBot with it
 * (t.me/PlunderWelcomeBot?start=whop_<code>), and the bot trades the
 * code back here server-to-server for the member's userId. From then
 * on the bot uses the member's Mnemos scope (member-<userId>) — the
 * same scope the web Ralph chat uses — so memory is one store on
 * both surfaces.
 *
 * Discipline mirrors BridgeCode: only the SHA-256 hash is stored,
 * the plaintext is shown exactly once, codes expire in 24 hours,
 * and consumption is single-use (usedAt is the lock).
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CODE_LENGTH = 8;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, same as bridge codes (Dave, 2026-11-23; was 15 minutes)

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export async function mintTelegramPairCode(
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.telegramPairCode.create({
    data: { userId, codeHash: hashCode(code), expiresAt },
  });
  return { code, expiresAt };
}

/** Consume a code: returns the member's userId, or null (unknown,
 *  expired, or already used). Marks it used in the same call. */
export async function consumeTelegramPairCode(code: string): Promise<string | null> {
  if (!code || typeof code !== "string") return null;
  const row = await prisma.telegramPairCode.findUnique({
    where: { codeHash: hashCode(code) },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  // Single-use lock: conditional update so two simultaneous verifies
  // can't both win.
  const claimed = await prisma.telegramPairCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return null;
  return row.userId;
}

/** Peek at a code WITHOUT consuming it: the member's userId, or null
 *  (unknown, expired, or already used). Spine A (2026-11-21): the
 *  pair-verify route peeks first so it can refuse an identity-alias
 *  conflict BEFORE the single-use code is spent; consumption still
 *  goes through consumeTelegramPairCode's conditional-update lock. */
export async function peekTelegramPairCode(code: string): Promise<string | null> {
  if (!code || typeof code !== "string") return null;
  const row = await prisma.telegramPairCode.findUnique({
    where: { codeHash: hashCode(code) },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

/** The bot proves itself with TELEGRAM_PAIR_SECRET (Dave sets the
 *  same value on both services; until then pairing is unarmed and
 *  the verify route answers 503). */
export function telegramPairSecretOk(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_PAIR_SECRET;
  if (!secret || !headerValue) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(headerValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function telegramPairConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_PAIR_SECRET);
}
