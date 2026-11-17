import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
  PKCE_COOKIE,
  PKCE_COOKIE_MAX_AGE,
  createSessionToken,
  readSessionToken,
} from "./whop";

/**
 * Session cookie helpers — Route Handlers may write cookies via next/headers.
 * The session token is an HMAC-signed {uid, iat} pair (see lib/whop.ts).
 * Whop OAuth access tokens are never persisted; the signed cookie is the
 * only credential this app issues.
 */

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

// ─── PKCE round-trip state (server-side, httpOnly) ───────────────────

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

export async function setPkceCookie(state: string, verifier: string): Promise<void> {
  const jar = await cookies();
  jar.set(PKCE_COOKIE, b64urlJson({ state, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PKCE_COOKIE_MAX_AGE,
  });
}

export async function readPkceCookie(): Promise<{ state: string; verifier: string } | null> {
  const jar = await cookies();
  const raw = jar.get(PKCE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as { state?: string; verifier?: string };
    if (!parsed.state || !parsed.verifier) return null;
    return { state: parsed.state, verifier: parsed.verifier };
  } catch {
    return null;
  }
}

export async function clearPkceCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(PKCE_COOKIE, "", { path: "/", maxAge: 0 });
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// ─── Redirect URI (exact-match registered in the Whop dashboard) ─────

export function resolveRedirectUri(origin: string): string {
  const override = process.env.WHOP_REDIRECT_URI?.trim();
  if (override) return override;
  return `${origin.replace(/\/$/, "")}/api/auth/whop/callback`;
}
