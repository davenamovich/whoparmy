import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";

/**
 * ─── Whop integration core (server-only) ─────────────────────────────
 *
 * Every endpoint and algorithm here comes straight from the official docs
 * (docs.whop.com — OAuth, Authentication, Webhooks, Accept Payments):
 *
 *   OAuth 2.1 + PKCE          https://api.whop.com/oauth/authorize
 *                             POST https://api.whop.com/oauth/token
 *                             GET  https://api.whop.com/oauth/userinfo
 *                             POST https://api.whop.com/oauth/revoke
 *   REST API (server key)     {API_BASE}/api/v1/...  Bearer <WHOP_API_KEY>
 *   Access check              GET {API_BASE}/api/v1/users/{id}/access/{resource_id}
 *                             → { has_access, access_level: customer | admin | no_access }
 *   Webhooks                  Standard Webhooks spec — signed via @whop/sdk/helpers
 *   Checkout                  Whop-hosted checkout links (Dashboard → Checkout links)
 *
 * API base follows WHOP_API_ENV: "sandbox" → https://sandbox-api.whop.com
 * (no real money), anything else → https://api.whop.com (production).
 * The two share no accounts, keys, products, or webhooks.
 */

export const WHOP_OAUTH_BASE = "https://api.whop.com/oauth";
export const API_VERSION_DATE = "2026-08-14";

export type WhopApiEnv = "sandbox" | "production";

export interface WhopConfig {
  appId: string | null; // app_xxx — OAuth client_id
  companyId: string | null; // biz_xxx — the company that owns the products
  apiEnv: WhopApiEnv;
  apiBase: string; // https://api.whop.com | https://sandbox-api.whop.com
  apiKey: string | null; // server-side Whop API key (Bearer)
  webhookSecret: string | null; // ws_... signing secret
  productIds: { CREATOR: string | null; PRO: string | null; AGENCY: string | null };
  checkoutUrls: {
    CREATOR: string | null;
    PRO: string | null;
    AGENCY: string | null;
    ARMY_CUSTOM: string | null;
    ARMY_AGENCY: string | null;
  };
}

export function getWhopConfig(): WhopConfig {
  const rawEnv = (process.env.WHOP_API_ENV ?? "production").toLowerCase();
  const apiEnv: WhopApiEnv = rawEnv === "sandbox" ? "sandbox" : "production";
  return {
    appId: process.env.WHOP_APP_ID?.trim() || null,
    companyId: process.env.WHOP_COMPANY_ID?.trim() || null,
    apiEnv,
    apiBase: apiEnv === "sandbox" ? "https://sandbox-api.whop.com" : "https://api.whop.com",
    apiKey: process.env.WHOP_API_KEY?.trim() || null,
    webhookSecret: process.env.WHOP_WEBHOOK_SECRET?.trim() || null,
    productIds: {
      CREATOR: process.env.WHOP_PRODUCT_ID_CREATOR?.trim() || null,
      PRO: process.env.WHOP_PRODUCT_ID_PRO?.trim() || null,
      AGENCY: process.env.WHOP_PRODUCT_ID_AGENCY?.trim() || null,
    },
    checkoutUrls: {
      CREATOR: process.env.WHOP_CHECKOUT_URL_CREATOR?.trim() || null,
      PRO: process.env.WHOP_CHECKOUT_URL_PRO?.trim() || null,
      AGENCY: process.env.WHOP_CHECKOUT_URL_AGENCY?.trim() || null,
      ARMY_CUSTOM: process.env.WHOP_CHECKOUT_URL_ARMY_CUSTOM?.trim() || null,
      ARMY_AGENCY: process.env.WHOP_CHECKOUT_URL_ARMY_AGENCY?.trim() || null,
    },
  };
}

export function isWhopOAuthConfigured(): boolean {
  return Boolean(getWhopConfig().appId);
}

export function isWhopApiConfigured(): boolean {
  return Boolean(getWhopConfig().apiKey);
}

export function isWhopWebhookConfigured(): boolean {
  return Boolean(getWhopConfig().webhookSecret);
}

// ─── OAuth 2.1 + PKCE ("Log in with Whop") ───────────────────────────

export function buildWhopAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const qp = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: "openid profile email",
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${WHOP_OAUTH_BASE}/authorize?${qp.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 * POST {WHOP_OAUTH_BASE}/token — JSON body per docs (PKCE, public client):
 * { grant_type: "authorization_code", code, redirect_uri, client_id, code_verifier }
 */
export async function exchangeWhopCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}): Promise<{ access_token: string; refresh_token?: string; id_token?: string; expires_in: number }> {
  // This app is registered as a CONFIDENTIAL OAuth client, and Whop's
  // token endpoint requires the client secret in the exchange
  // (verified live 2026-11-17: "client_secret is required"). PKCE is
  // still sent. The secret lives only in the WHOP_APP_SECRET env var.
  const clientSecret = process.env.WHOP_APP_SECRET?.trim();
  const res = await fetch(`${WHOP_OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      code_verifier: params.codeVerifier,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    throw new Error(`Whop token exchange failed: ${err.error_description || err.error || res.status}`);
  }
  return (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number };
}

export interface WhopUserInfo {
  sub: string; // user_xxx
  name?: string;
  preferred_username?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

/** GET {WHOP_OAUTH_BASE}/userinfo with the user's access token. */
export async function fetchWhopUserInfo(accessToken: string): Promise<WhopUserInfo> {
  const res = await fetch(`${WHOP_OAUTH_BASE}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Whop userinfo failed: ${res.status}`);
  return (await res.json()) as WhopUserInfo;
}

/** POST {WHOP_OAUTH_BASE}/revoke — invalidate a refresh token on logout. */
export async function revokeWhopToken(refreshToken: string, clientId: string): Promise<void> {
  await fetch(`${WHOP_OAUTH_BASE}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: refreshToken, client_id: clientId }),
  }).catch(() => {});
}

// ─── REST API with the account API key (server-side only) ────────────

export interface WhopAccessResult {
  has_access: boolean;
  access_level: "customer" | "admin" | "no_access";
}

/**
 * GET {API_BASE}/api/v1/users/{id}/access/{resource_id}
 * resource_id: biz_xxx (account) | prod_xxx (product) | exp_xxx (experience)
 */
export async function whopCheckAccess(userId: string, resourceId: string): Promise<WhopAccessResult> {
  const cfg = getWhopConfig();
  if (!cfg.apiKey) throw new Error("WHOP_API_KEY is not configured");
  const res = await fetch(`${cfg.apiBase}/api/v1/users/${encodeURIComponent(userId)}/access/${encodeURIComponent(resourceId)}`, {
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Api-Version-Date": API_VERSION_DATE,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whop access check failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as WhopAccessResult;
}

export interface WhopMembershipLite {
  id: string;
  status: string;
  userId: string | null;
  productId: string | null;
  planId: string | null;
}

const PAID_TIERS = ["AGENCY", "PRO", "CREATOR"] as const;
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due", "completed", "canceling"]);
type TierIds = Record<(typeof PAID_TIERS)[number], string | null>;

export function getWhopTierIds(): { planIds: TierIds; productIds: TierIds } {
  return {
    planIds: {
      AGENCY: process.env.WHOP_PLAN_ID_AGENCY?.trim() || null,
      PRO: process.env.WHOP_PLAN_ID_PRO?.trim() || null,
      CREATOR: process.env.WHOP_PLAN_ID_CREATOR?.trim() || null,
    },
    productIds: getWhopConfig().productIds,
  };
}

export function resolveTierFromMemberships(
  memberships: readonly { status?: string; planId?: string | null; productId?: string | null }[],
  { planIds, productIds }: ReturnType<typeof getWhopTierIds>,
): (typeof PAID_TIERS)[number] | null {
  const eligible = memberships.filter(({ status }) => status && ENTITLED_STATUSES.has(status));
  return PAID_TIERS.find((tier) => planIds[tier] && eligible.some((row) => row.planId === planIds[tier]))
    ?? PAID_TIERS.find((tier) => productIds[tier] && eligible.some((row) => row.productId === productIds[tier]))
    ?? null;
}

/**
 * Return only complete membership evidence. Callers filter by userId
 * locally because some Whop API versions ignore the user filter.
 */
export async function whopListMemberships(): Promise<WhopMembershipLite[]> {
  const cfg = getWhopConfig();
  if (!cfg.apiKey) throw new Error("WHOP_API_KEY is not configured");
  if (!cfg.companyId) throw new Error("WHOP_COMPANY_ID is not configured");
  const url = new URL("/api/v1/memberships", cfg.apiBase);
  url.searchParams.set("account_id", cfg.companyId);
  url.searchParams.set("first", "50");
  const memberships: WhopMembershipLite[] = [];
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Api-Version-Date": API_VERSION_DATE,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Whop memberships list failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      data?: {
        id: string;
        status: string;
        user_id?: string | null;
        user?: { id: string } | null;
        product_id?: string;
        product?: { id: string } | null;
        variant_id?: string;
        plan?: { id: string } | null;
      }[];
      page_info?: { has_next_page?: boolean; end_cursor?: string | null };
    } | null;
    if (!Array.isArray(body?.data) || typeof body.page_info?.has_next_page !== "boolean") {
      throw new Error("Invalid Whop memberships page");
    }
    for (const row of body.data) {
      const userId = row?.user_id !== undefined ? row.user_id : row?.user === null ? null : row?.user?.id;
      const productId = row?.product_id ?? row?.product?.id ?? null;
      const planId = row?.variant_id ?? row?.plan?.id ?? null;
      if (typeof row?.status !== "string" || (userId !== null && typeof userId !== "string")
        || (typeof productId !== "string" && typeof planId !== "string")) {
        throw new Error("Invalid Whop membership");
      }
      memberships.push({ id: row.id, status: row.status, userId, productId, planId });
    }
    if (!body.page_info.has_next_page) return memberships;
    const cursor = body.page_info.end_cursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) {
      throw new Error("Invalid Whop memberships cursor");
    }
    cursors.add(cursor);
    url.searchParams.set("after", cursor);
  }
  throw new Error("Whop memberships list exceeded 10 pages");
}

// ─── Webhook verification (Standard Webhooks spec via @whop/sdk) ─────

export { WebhookVerificationError };

export function verifyWhopWebhook(
  rawBody: string,
  headers: Record<string, string>,
): { type: string; data: unknown; id?: string; accountId?: string } {
  const cfg = getWhopConfig();
  if (!cfg.webhookSecret) throw new WebhookVerificationError("WHOP_WEBHOOK_SECRET is not configured");
  const event = unwrapWebhook<{
    type?: string;
    data?: unknown;
    id?: string;
    account_id?: string;
    company_id?: string;
  }>(
    rawBody,
    { headers, key: cfg.webhookSecret },
  );
  const payload = event.data as {
    account_id?: string;
    company_id?: string;
    account?: { id?: string } | null;
    company?: { id?: string } | null;
  } | null | undefined;
  return {
    type: event.type ?? "",
    data: event.data,
    id: event.id,
    // Dated pins ≥ 2026-08-14 carry account_id; older pins carry company_id.
    accountId: event.account_id ?? event.company_id ?? payload?.account_id ?? payload?.company_id
      ?? payload?.account?.id ?? payload?.company?.id,
  };
}

// ─── AI Assessments product (created 2026-11-18 at Dave's order) ────
//
// The $999 AI Assessments offer lives on its OWN Whop product, separate
// from the Meme Content Engine bot-rental product:
//   product  prod_375J8KgxlSmT1  "AI Assessments"        (visibility: hidden)
//   plan     plan_s98ZsXPvBxNpO  "AI Assessment" $999 one-time (hidden)
// Both flip visible when Dave launches the offer. Env vars override the
// defaults so a re-created product never needs a code change. The check
// Whoparmy runs is the standard product access check (whopCheckAccess) —
// a buyer's purchase flips has_access to true (access_level "customer").

export function getAssessmentsProduct() {
  return {
    productId: process.env.WHOP_ASSESSMENTS_PRODUCT_ID?.trim() || "prod_375J8KgxlSmT1",
    planId: process.env.WHOP_ASSESSMENTS_PLAN_ID?.trim() || "plan_s98ZsXPvBxNpO",
    checkoutUrl:
      process.env.WHOP_ASSESSMENTS_CHECKOUT_URL?.trim() || "https://whop.com/checkout/plan_s98ZsXPvBxNpO",
  };
}

/** Does this Whop user own the AI Assessments product? */
export async function checkAssessmentAccess(userId: string): Promise<WhopAccessResult> {
  return whopCheckAccess(userId, getAssessmentsProduct().productId);
}

// ─── Checkout URL status (booleans + public links, never secrets) ────

export function whopPublicStatus() {
  const cfg = getWhopConfig();
  return {
    oauthConfigured: Boolean(cfg.appId),
    apiConfigured: Boolean(cfg.apiKey),
    webhookConfigured: Boolean(cfg.webhookSecret),
    apiEnv: cfg.apiEnv,
    checkoutUrls: cfg.checkoutUrls,
    assessments: getAssessmentsProduct(),
  };
}

// ─── Session signing (HMAC-SHA256, our own cookie — Whop tokens are
//     never stored; access tokens expire after 1 hour by design) ─────

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  const explicit = process.env.SESSION_SECRET?.trim();
  if (explicit) return explicit;
  // Stable dev fallback — production deployments must set SESSION_SECRET.
  return createHmac("sha256", "p&r-content-factory-session-seed")
    .update(process.env.DATABASE_URL ?? "local")
    .digest("hex");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signValue(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const payload = b64url(JSON.stringify({ uid: userId, iat: Date.now() }));
  return `${payload}.${signValue(payload)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signValue(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: string; iat?: number };
    if (!parsed.uid || typeof parsed.iat !== "number") return null;
    if (Date.now() - parsed.iat > SESSION_TTL_SECONDS * 1000) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "pr_session";
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
export const PKCE_COOKIE = "whop_pkce";
export const PKCE_COOKIE_MAX_AGE = 600; // 10 minutes for the OAuth round trip
