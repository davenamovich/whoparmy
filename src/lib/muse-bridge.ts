import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { isDesignatedOperator } from "@/lib/auth";
import { getSavedDhMediaLink } from "@/lib/btc-addresses";
import { EXPERIMENT_GENERATING_COSTS, codeTtlMsForScope } from "@/lib/experiment-scope";

/**
 * ─── Muse bridge connector (Dave, 2026-11-17) ───────────────────────
 *
 * The end result Dave set: a member creates a Muse account, pastes ONE
 * command from whop.plunderandriffle.com, and their Muse makes a week
 * of content — calling the P&R MCP **linked to that member**, spending
 * **that member's credits**.
 *
 * How the link works (no new bot scope needed — verified in bot code):
 * the bot already runs a Whop bridge (`bot/src/lib/whop-bridge-routes.ts`):
 * POST /api/bridge/whop/key, authenticated by the shared WHOP_BRIDGE_KEY,
 * returns ONE agent key per Whop user, derived server-side
 * (HMAC of a bot-only secret + whopUserId), scoped mcp:read + mcp:write
 * (never publish), with plan allowances granted on the member's Whop
 * billing cycle. Every generation on that key charges the member's own
 * P&R balance; failures refund bot-side.
 *
 * This app is the face of that bridge for external agents:
 *   member's Muse ──Bearer prb_…──► POST /api/bridge/mcp (here)
 *     ──derived agent key──► bot.plunderandriffle.com/api/mcp
 *
 * Rules held throughout:
 * - The derived agent key is fetched server-to-server, cached in memory
 *   only, NEVER written to the database, NEVER returned to a browser or
 *   to the member's Muse. The only credential the agent holds is the
 *   bridge token (prb_…), stored here as a SHA-256 hash, revocable,
 *   dead after 7 days (one pairing funds one week — Dave, 2026-11-17).
 * - The token carries ONE approved budget (the week quote). Generating
 *   calls reserve their list cost against it before they run and settle
 *   at the engine's actual charge (balance delta) after; a failed call
 *   settles at 0 because the bot refunds it.
 * - Publishing and MP4 rendering are NOT in the allowlist: the member
 *   approves pieces first, per the standing approval rules.
 */

// ─── Config ─────────────────────────────────────────────────────────

export function botBaseUrl(): string {
  return (process.env.BOT_BRIDGE_BASE_URL?.trim() || process.env.PR_ENGINE_BASE_URL?.trim() || "https://bot.plunderandriffle.com").replace(/\/$/, "");
}

export function bridgeSharedKey(): string | null {
  return process.env.WHOP_BRIDGE_KEY?.trim() || null;
}

export const BRIDGE_TOKEN_PREFIX = "prb_";
export const BRIDGE_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000; // one pairing = one week
export const BRIDGE_CODE_TTL_MS = 15 * 60_000; // copy → paste → Muse's first call
/** The week at list prices: 7 × create_demo_pack (115). The member sees
 *  this number and the bot-quoted balance before anything spends. */
export const WEEK_BUDGET_CREDITS = 7 * 115;
export const MAX_BUDGET_CREDITS = 5000;
/** A budget reservation older than this is presumed abandoned and swept. */
export const RESERVATION_STALE_MS = 15 * 60_000;

// ─── The offers (Dave, 2026-11-17: add both variants) ───────────────
// Three sizes of the same special offer, all Operator + Agency. The
// token budget is the only enforcement difference between them; the
// command text on /muse-week carries what the Muse makes. Budgets
// are list-price reserves — calls settle at the actual charge.

export interface BridgeOffer {
  id: "taste" | "week" | "opener";
  name: string;
  budgetCredits: number;
  blurb: string;
}

export const BRIDGE_OFFERS: BridgeOffer[] = [
  { id: "taste", name: "The Taste", budgetCredits: 115, blurb: "One day-pack — run the whole flow once." },
  { id: "week", name: "The Week", budgetCredits: WEEK_BUDGET_CREDITS, blurb: "Seven day-packs, one per day, seven angles." },
  { id: "opener", name: "Week + Opener", budgetCredits: WEEK_BUDGET_CREDITS + 50, blurb: "The Week, plus a personalized /before pitch for your business." },
];

export const DEFAULT_OFFER_ID = "week";

export function bridgeOffer(id: unknown): BridgeOffer {
  return BRIDGE_OFFERS.find((o) => o.id === id) ?? BRIDGE_OFFERS.find((o) => o.id === DEFAULT_OFFER_ID)!;
}

const WHOP_USER_RE = /^user_[A-Za-z0-9]{4,64}$/;

// ─── Plan mapping ───────────────────────────────────────────────────
// Bot bridge plans are free | creator | pro. Whoparmy's AGENCY rides
// the bot's top plan (pro); its extra seats/allowance stay Whoparmy-side.

export type BotPlan = "free" | "creator" | "pro";

export function botPlanFor(user: Pick<User, "plan">): BotPlan {
  if (user.plan === "CREATOR") return "creator";
  if (user.plan === "PRO" || user.plan === "AGENCY") return "pro";
  return "free";
}

// ─── Eligibility — a special offer, not for everyone ────────────────
// Dave, 2026-11-17: the bridge is an Operator + Agency offer (local
// plan PRO is the Operator tier). Trial and Starter members can see
// the offer but cannot mint codes, exchange them, or spend through a
// token. Designated operators (the owner's own Whop accounts) always
// pass so the owner can run acceptance on the live offer.

export function bridgeEligible(user: Pick<User, "plan" | "whopId" | "whopUsername">): boolean {
  if (user.plan === "PRO" || user.plan === "AGENCY") return true;
  return isDesignatedOperator(user);
}

export function assertBridgeEligible(user: Pick<User, "plan" | "whopId" | "whopUsername">): void {
  if (!bridgeEligible(user)) {
    throw new BridgeError(
      403,
      "NOT_ELIGIBLE",
      "The Muse bridge is a special offer for Operator and Agency members. Your current plan doesn't include it — upgrade to Operator or Agency in Whop to unlock your week of content.",
    );
  }
}

// ─── Bridge scopes ──────────────────────────────────────────────────
// A bridge code/token carries ONE scope, set at mint and inherited at
// exchange. "week" is the original /muse-week special offer above.
// "clips" is the Clip Factory (Dave, 2026-11-18): a SEPARATE product
// with its own eligibility and allowlist (below). Scopes never mix:
// the MCP route enforces the token's own scope on every call.

// "experiment" is the BTC Experiment's agent connection (Dave,
// 2026-11-20, lib/experiment-scope.ts): any plan with a saved DH
// Media link, on the member's own balance, 24-hour code.
export type BridgeScope = "week" | "clips" | "experiment";

export function normalizeScope(raw: unknown): BridgeScope {
  return raw === "clips" || raw === "experiment" ? raw : "week";
}

/**
 * Strict scope read for stored rows: only the two real scopes are
 * valid. Anything else (legacy junk, corruption, a hand-edited row)
 * is NOT silently upgraded to the week offer — callers treat null as
 * an invalid code/token and refuse.
 */
export function scopeFromStored(raw: unknown): BridgeScope | null {
  return raw === "week" || raw === "clips" || raw === "experiment" ? raw : null;
}

export { redactBridgeSecrets } from "./bridge-redact";

// ─── Clips eligibility — any member spending their own credits ──────
// Dave, 2026-11-18: the Clip Factory is open to ANY signed-in member
// whose account is linked to a P&R credit account (their derived
// engine key); plan is irrelevant — they spend their own credits.
// "Linked" is the same test getMemberEngineKey applies: a real Whop
// user id. The anonymous operator fallback has none, so it cannot
// use the clips lane either (same rule as the claim bridge).

export function hasLinkedCreditAccount(user: Pick<User, "whopId">): boolean {
  return WHOP_USER_RE.test(user.whopId?.trim() ?? "");
}

export function assertClipsEligible(user: Pick<User, "whopId">): void {
  if (!hasLinkedCreditAccount(user)) {
    throw new BridgeError(
      403,
      "NOT_LINKED",
      "The Clip Factory works on your own Plunder & Riffle credits, and this account isn't linked to a credit account yet. Sign in with Whop so your account carries its Whop user id, then try again.",
    );
  }
}

// ─── Experiment eligibility — the BTC Experiment's agent ────────────
// Dave, 2026-11-20: saving the DH Media link at the end of The BTC
// Experiment is what unlocks the bridge — not the Whop plan. Any plan
// with a linked credit account (they spend their own balance) and a
// CURRENTLY saved DH Media link. Re-checked at exchange, so removing
// the link closes a code that has not been used yet.

export async function assertExperimentEligible(user: Pick<User, "id" | "whopId">): Promise<void> {
  if (!hasLinkedCreditAccount(user)) {
    throw new BridgeError(
      403,
      "NOT_LINKED",
      "Your agent works on your own Plunder & Riffle credits, and this account isn't linked to them yet. Sign in with Whop, then try again.",
    );
  }
  if (!(await getSavedDhMediaLink(user.id))) {
    throw new BridgeError(
      403,
      "NEEDS_DH_MEDIA_LINK",
      "Your agent's connection unlocks when your DH Media link is saved. Save it, then get your code.",
    );
  }
}

// ─── Tool allowlist ─────────────────────────────────────────────────
// Free tools never touch the budget. Generating tools reserve their
// LIST cost (from the bot MCP's own tool descriptions) and settle at
// the actual charge. Anything not listed here is refused — notably
// publish_clip, post_to_socials and request_mp4.

export const BRIDGE_FREE_TOOLS = new Set([
  "research_brand",
  "create_campaign_from_research",
  "get_job_status",
  "get_account",
  "get_usage",
  "list_ad_options",
  "list_services",
]);

/** Week-scope generating tools (the /muse-week offer's allowlist). */
export const BRIDGE_GENERATING_COSTS: Record<string, number> = {
  create_demo_pack: 115,
  create_before_pitch: 50,
  generate_ad_creative: 60,
  generate_multilanguage_ads: 60,
  // create_sitdown is deliberately NOT here: it belongs to the Clip
  // Factory's scope (below). When it also sat in the week table, a
  // week token could call the engine's general sit-down directly and
  // walk around both the plan gate and the clip intake.
};

/**
 * Clips-scope generating tools — deliberately a SEPARATE table, never
 * merged into the week's. A clips token must not be able to call the
 * week offer's generating tools, or any plan could walk around the
 * Operator + Agency gate through the clips lane; and a week token
 * must not gain create_sitdown, which belongs to the Clip Factory.
 * create_sitdown list cost is 25 (the engine's own tool table).
 */
export const CLIPS_GENERATING_COSTS: Record<string, number> = {
  create_sitdown: 25,
};

export function generatingCostsForScope(scope: BridgeScope): Record<string, number> {
  if (scope === "clips") return CLIPS_GENERATING_COSTS;
  if (scope === "experiment") return EXPERIMENT_GENERATING_COSTS;
  return BRIDGE_GENERATING_COSTS;
}

export function bridgeToolAllowedForScope(scope: BridgeScope, name: string): boolean {
  // Object.hasOwn, never `in`: `in` walks the prototype chain, so a
  // tool literally named "constructor" or "toString" would pass.
  return BRIDGE_FREE_TOOLS.has(name) || Object.hasOwn(generatingCostsForScope(scope), name);
}

/** Week-scope check (the original behavior, kept for existing callers). */
export function bridgeToolAllowed(name: string): boolean {
  return bridgeToolAllowedForScope("week", name);
}

export function estimateToolCostForScope(scope: BridgeScope, name: string, args: Record<string, unknown>): number {
  const base = generatingCostsForScope(scope)[name] ?? 0;
  if (name === "generate_multilanguage_ads" && Array.isArray(args.languages)) {
    // List pricing is per language; reserve per DISTINCT language
    // (duplicates don't render twice), capped at the engine's six.
    const distinct = new Set(
      args.languages.filter((l): l is string => typeof l === "string").map((l) => l.trim().toLowerCase()),
    ).size;
    return base * Math.max(1, Math.min(6, distinct));
  }
  if (name === "create_before_pitch" && typeof args.song_url === "string" && args.song_url.trim()) {
    // The engine charges +30 for the bonus song video (song_url arg).
    return base + 30;
  }
  return base;
}

/** Week-scope estimate (the original behavior, kept for existing callers). */
export function estimateToolCost(name: string, args: Record<string, unknown>): number {
  return estimateToolCostForScope("week", name, args);
}

// ─── The member's derived engine key (memory cache only) ────────────

export interface MemberKeyResult {
  key: string;
  plan: BotPlan;
  credits: number;
  granted: number;
  period: string;
}

const keyCache = new Map<string, { whopId: string; result: MemberKeyResult; fetchedAt: number }>();
const KEY_CACHE_TTL_MS = 10 * 60_000;

export class BridgeError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Fetch (or reuse) the member's own P&R agent key from the bot bridge.
 * Side effect: upserts the BridgeConnection snapshot (status/credits —
 * never the key). Throws BridgeError with an honest code:
 * NO_WHOP_ID (operator/fallback account), NOT_CONFIGURED (the shared
 * key is unset here or the bot bridge answers 503), BLOCKED (the bot
 * refuses this customer — their key was revoked), BOT_UNREACHABLE.
 */
export async function getMemberEngineKey(user: User, opts: { fresh?: boolean } = {}): Promise<MemberKeyResult> {
  const whopId = user.whopId?.trim() ?? "";
  if (!WHOP_USER_RE.test(whopId)) {
    throw new BridgeError(400, "NO_WHOP_ID", "This account has no Whop user id, so it has no P&R credit account to link. Sign in with Whop first.");
  }
  const shared = bridgeSharedKey();
  if (!shared) {
    throw new BridgeError(503, "NOT_CONFIGURED", "The Muse bridge is not configured on this app yet (WHOP_BRIDGE_KEY is unset).");
  }
  if (!opts.fresh) {
    const cached = keyCache.get(user.id);
    if (cached?.whopId === whopId && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) return cached.result;
  }
  let res: Response;
  try {
    res = await fetch(`${botBaseUrl()}/api/bridge/whop/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-brain-key": shared },
      body: JSON.stringify({ whopUserId: whopId, plan: botPlanFor(user) }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new BridgeError(502, "BOT_UNREACHABLE", "The Plunder & Riffle engine did not answer. Nothing was charged; try again in a moment.");
  }
  if (res.status === 401 || res.status === 503) {
    await markConnection(user.id, "UNCONFIGURED");
    throw new BridgeError(503, "NOT_CONFIGURED", "The Muse bridge is not configured on the engine side yet.");
  }
  if (res.status === 403) {
    forgetMemberKey(user.id);
    await markConnection(user.id, "BLOCKED");
    throw new BridgeError(403, "BLOCKED", "No P&R key is available for this account. Contact support.");
  }
  if (!res.ok) {
    throw new BridgeError(502, "BOT_UNREACHABLE", `The engine answered HTTP ${res.status}. Nothing was charged.`);
  }
  const json = (await res.json()) as { ok?: boolean; key?: string; plan?: BotPlan; credits?: number; granted?: number; period?: string };
  if (!json.ok || !json.key) {
    throw new BridgeError(502, "BOT_UNREACHABLE", "The engine returned no key. Nothing was charged.");
  }
  const result: MemberKeyResult = {
    key: json.key,
    plan: json.plan ?? botPlanFor(user),
    credits: typeof json.credits === "number" ? json.credits : 0,
    granted: typeof json.granted === "number" ? json.granted : 0,
    period: typeof json.period === "string" ? json.period : "",
  };
  keyCache.set(user.id, { whopId, result, fetchedAt: Date.now() });
  await db.bridgeConnection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      botPlan: result.plan,
      period: result.period || null,
      credits: result.credits,
      granted: result.granted,
      status: "ACTIVE",
      lastFetchedAt: new Date(),
    },
    update: {
      botPlan: result.plan,
      period: result.period || null,
      credits: result.credits,
      granted: result.granted,
      status: "ACTIVE",
      lastFetchedAt: new Date(),
    },
  }).catch(() => undefined); // the snapshot must never break the key path
  return result;
}

async function markConnection(userId: string, status: string): Promise<void> {
  await db.bridgeConnection.upsert({
    where: { userId },
    create: { userId, botPlan: "free", status },
    update: { status },
  }).catch(() => undefined);
}

/** Test seam + logout hygiene: forget the cached derived key. */
export function forgetMemberKey(userId: string): void {
  keyCache.delete(userId);
}

// ─── Raw MCP calls on a member key ──────────────────────────────────

interface McpReply {
  result?: { content?: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
  error?: { code?: number; message?: string };
}

/** Exported so the clip dispatcher drives the same MCP path as the bridge. */
export async function mcpCall(key: string, method: string, params: Record<string, unknown>): Promise<McpReply> {
  const res = await fetch(`${botBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: ["Bearer", key].join(" "),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new BridgeError(502, "BOT_UNREACHABLE", `The engine answered HTTP ${res.status}.`);
  const text = await res.text();
  try {
    return JSON.parse(text) as McpReply;
  } catch {
    // SSE framing: take the last data: line, like the stdio bridge does.
    const data = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).pop();
    if (data) return JSON.parse(data.slice(5).trim()) as McpReply;
    throw new BridgeError(502, "BOT_UNREACHABLE", "The engine returned an unreadable reply.");
  }
}

function resultPayload(reply: McpReply): Record<string, unknown> | null {
  const r = reply.result;
  if (!r) return null;
  if (r.structuredContent) return r.structuredContent;
  const text = r.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The member's live P&R balance on their own key (-1 = unlimited). */
export async function getMemberCredits(key: string): Promise<number | null> {
  try {
    const reply = await mcpCall(key, "tools/call", { name: "get_account", arguments: {} });
    const payload = resultPayload(reply);
    const credits = payload?.credits;
    return typeof credits === "number" ? credits : null;
  } catch {
    return null;
  }
}

// ─── Bridge codes + tokens ──────────────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function newBridgeCode(): string {
  const raw = randomBytes(8).toString("hex").toUpperCase(); // 16 chars
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export async function mintBridgeCode(
  userId: string,
  budgetCredits: number,
  scope: BridgeScope = "week",
): Promise<{ code: string; expiresAt: Date; budgetCredits: number; scope: BridgeScope }> {
  // Week codes fall back to the standing offer budget; clips codes
  // snapshot the member's own balance, where ZERO is a real value
  // (an empty account gets a zero-budget connection, not the week's
  // 805-credit default smuggled in by a falsy check).
  const truncated = Math.trunc(budgetCredits);
  // Experiment codes budget like clips: the member's own balance,
  // where zero is real.
  const budget =
    scope === "clips" || scope === "experiment"
      ? Math.max(0, Math.min(MAX_BUDGET_CREDITS, Number.isFinite(truncated) ? truncated : 0))
      : Math.max(1, Math.min(MAX_BUDGET_CREDITS, truncated || WEEK_BUDGET_CREDITS));
  const code = newBridgeCode();
  // 15 minutes, except experiment codes: 24 hours (Dave, 2026-11-20),
  // so a code survives the member setting up their agent.
  const expiresAt = new Date(Date.now() + codeTtlMsForScope(scope));
  // A fresh code retires every unused one before it: only one live code
  // per member (across BOTH scopes), so a code left on an old page can
  // never be exchanged. Retire + create run in ONE transaction: two
  // concurrent mints can no longer interleave into two live codes.
  await db.$transaction(async (tx) => {
    await tx.bridgeCode.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.bridgeCode.create({ data: { userId, codeHash: sha256(code), budgetCredits: budget, expiresAt, scope } });
  });
  return { code, expiresAt, budgetCredits: budget, scope };
}

export async function exchangeBridgeCode(rawCode: string): Promise<{ token: string; expiresAt: Date; budgetCredits: number; userId: string; scope: BridgeScope }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  const row = await db.bridgeCode.findUnique({ where: { codeHash: sha256(code) } });
  if (!row || row.usedAt) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  const scope = scopeFromStored(row.scope);
  if (!scope) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  if (row.expiresAt.getTime() <= Date.now()) {
    const where = scope === "clips" ? "in the Clip Factory" : scope === "experiment" ? "at whop.plunderandriffle.com/bridge" : "on /muse-week";
    throw new BridgeError(400, "BAD_CODE", `That bridge code expired. Generate a fresh one ${where}.`);
  }
  // Eligibility is re-checked at exchange, PER SCOPE: a member
  // downgraded after minting holds a week code that no longer opens
  // the offer; a clips code re-checks the linked-account test instead
  // (plan never enters it). The code is NOT consumed by this refusal —
  // it works again if eligibility returns inside its 15 minutes.
  const owner = await db.user.findUnique({ where: { id: row.userId } });
  if (!owner) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  if (scope === "clips") assertClipsEligible(owner);
  else if (scope === "experiment") await assertExperimentEligible(owner);
  else assertBridgeEligible(owner);
  // Single-use: claim the code AND create the token in one
  // transaction — a crash between the two used to burn the code
  // without issuing a token. A raced double exchange fails the
  // conditional claim and rolls the whole exchange back.
  const token = BRIDGE_TOKEN_PREFIX + randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + BRIDGE_TOKEN_TTL_MS);
  await db.$transaction(async (tx) => {
    const claimed = await tx.bridgeCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
    await tx.bridgeToken.create({
      data: { userId: row.userId, tokenHash: sha256(token), budgetCredits: row.budgetCredits, expiresAt, scope },
    });
  });
  return { token, expiresAt, budgetCredits: row.budgetCredits, userId: row.userId, scope };
}

/**
 * Look up a live (unused, unexpired) bridge code WITHOUT consuming
 * it — the /connect/[code] agent-link page renders from this.
 * Viewing never burns the code; only exchangeBridgeCode claims it,
 * and exchange re-checks eligibility per scope. Returns null for
 * unknown, used, or expired codes alike (no oracle about which).
 */
export async function findLiveBridgeCode(
  rawCode: string,
): Promise<{ budgetCredits: number; scope: BridgeScope; expiresAt: Date; user: User } | null> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const row = await db.bridgeCode.findUnique({ where: { codeHash: sha256(code) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  const scope = scopeFromStored(row.scope);
  if (!scope) return null;
  return {
    budgetCredits: row.budgetCredits,
    scope,
    expiresAt: row.expiresAt,
    user: row.user,
  };
}

export interface BridgeSession {
  tokenId: string;
  user: User;
  budgetCredits: number;
  spentCredits: number;
  expiresAt: Date;
  scope: BridgeScope;
}

export async function verifyBridgeToken(raw: string | null): Promise<BridgeSession | null> {
  if (!raw || !raw.startsWith(BRIDGE_TOKEN_PREFIX)) return null;
  const row = await db.bridgeToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  const scope = scopeFromStored(row.scope);
  if (!scope) return null; // unknown stored scope: not a usable token
  await db.bridgeToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return {
    tokenId: row.id,
    user: row.user,
    budgetCredits: row.budgetCredits,
    spentCredits: row.spentCredits,
    expiresAt: row.expiresAt,
    scope,
  };
}

export async function revokeBridgeToken(tokenId: string, userId: string): Promise<boolean> {
  const out = await db.bridgeToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return out.count === 1;
}

// ─── The proxied tool call ──────────────────────────────────────────

export interface ProxiedCall {
  reply: McpReply;
  charged: number;
}

/**
 * Run one MCP tools/call for a bridge session: allowlist → budget
 * reserve → the member's own key → settle at the actual charge.
 * Refusals come back as MCP tool errors (isError content), the same
 * shape the bot itself uses, so any MCP client shows them to the human.
 */
export async function proxyToolCall(session: BridgeSession, name: string, args: Record<string, unknown>): Promise<ProxiedCall> {
  const toolError = (message: string): ProxiedCall => ({
    reply: { result: { isError: true, content: [{ type: "text", text: message }] } },
    charged: 0,
  });

  // The token's OWN scope decides the allowlist — this is the check
  // that keeps the clips lane from becoming a side door into the
  // week offer (and the week offer out of the Clip Factory's tool).
  const costs = generatingCostsForScope(session.scope);
  if (!bridgeToolAllowedForScope(session.scope, name)) {
    return toolError(
      session.scope === "clips"
        ? `This clips connection cannot call ${name}. A Clip Factory connection runs create_sitdown plus research and account tools on the member's own credits; the week offer's content tools need their own /muse-week connection, and publishing and MP4 rendering stay with the member's approval inside Whoparmy. Allowed: ${[...BRIDGE_FREE_TOOLS, ...Object.keys(costs)].join(", ")}.`
        : `The Muse bridge cannot call ${name}. It runs research and content generation on the member's own credits; publishing and MP4 rendering stay with the member's approval inside Whoparmy. Allowed: ${[...BRIDGE_FREE_TOOLS, ...Object.keys(costs)].join(", ")}.`,
    );
  }

  // Eligibility re-check on every call, per scope: the week offer
  // re-checks its plan gate (a downgrade kills a live token); the
  // clips lane re-checks only the linked-account test, never plan.
  if (session.scope === "clips") {
    if (!hasLinkedCreditAccount(session.user)) {
      return toolError(
        "This clips connection's account is no longer linked to a Plunder & Riffle credit account. Nothing was charged. The member can re-link by signing in with Whop.",
      );
    }
  } else if (!bridgeEligible(session.user)) {
    return toolError(
      "The Muse bridge is a special offer for Operator and Agency members, and this connection's plan no longer includes it. Nothing was charged. The member can re-open the offer by upgrading in Whop.",
    );
  }

  const member = await getMemberEngineKey(session.user);
  const generating = Object.hasOwn(costs, name);
  const reserve = generating ? estimateToolCostForScope(session.scope, name, args) : 0;

  // Budget RESERVATION, before dispatch (generating calls only). The
  // old flow checked the budget, dispatched, and incremented spent
  // afterwards — two concurrent calls could both pass the check on
  // the same stale spent figure and both settle past the cap. Now
  // the reserve lands atomically first (spent + pending + reserve
  // must fit), and every exit path settles or releases it exactly
  // once. A reservation older than the stale window is presumed
  // abandoned (its caller died mid-flight) and swept back.
  const settleReservation = async (charged: number): Promise<void> => {
    if (!generating) return;
    const apply = async (amount: number) => {
      await db.$transaction(async (tx) => {
        const tok = await tx.bridgeToken.findUnique({ where: { id: session.tokenId } });
        if (!tok) return;
        const pending = Math.max(0, tok.pendingCredits - reserve);
        await tx.bridgeToken.update({
          where: { id: tok.id },
          data: {
            pendingCredits: pending,
            pendingSince: pending > 0 ? tok.pendingSince : null,
            spentCredits: tok.spentCredits + amount,
          },
        });
      });
    };
    try {
      await apply(charged);
    } catch {
      try {
        await apply(charged);
      } catch (err) {
        // Fail closed: if the true settlement cannot be written, the
        // reserve itself becomes the charge rather than vanishing.
        console.error("[bridge] settlement failed twice; charging the reserve", session.tokenId, name, err);
        await apply(reserve).catch((e) => console.error("[bridge] fail-closed settlement also failed", session.tokenId, name, e));
      }
    }
  };

  if (generating) {
    const now = Date.now();
    const reservation = await db.$transaction(async (tx) => {
      const tok = await tx.bridgeToken.findUnique({ where: { id: session.tokenId } });
      if (!tok || tok.revokedAt || tok.expiresAt.getTime() <= now) return { ok: false as const, dead: true, spent: 0 };
      let pending = tok.pendingCredits;
      let pendingSince = tok.pendingSince;
      if (pending > 0 && pendingSince && now - pendingSince.getTime() > RESERVATION_STALE_MS) {
        pending = 0;
        pendingSince = null;
      }
      if (tok.spentCredits + pending + reserve > tok.budgetCredits) {
        return { ok: false as const, dead: false, spent: tok.spentCredits + pending };
      }
      await tx.bridgeToken.update({
        where: { id: tok.id },
        data: { pendingCredits: pending + reserve, pendingSince: pendingSince ?? new Date() },
      });
      return { ok: true as const, dead: false, spent: tok.spentCredits };
    });
    if (!reservation.ok) {
      if (reservation.dead) {
        return toolError("This bridge connection has expired or been revoked. Nothing was charged. The member can open a fresh connection in Whoparmy.");
      }
      return toolError(
        session.scope === "clips"
          ? `This ${name} call would exceed this connection's approved budget (${session.budgetCredits} credits — the member's own balance when the connection was approved, ${reservation.spent} already spent or in flight). Nothing was charged. The member can approve a new clips connection in Whoparmy.`
          : `This ${name} call would exceed the week's approved budget (${session.budgetCredits} credits, ${reservation.spent} already spent or in flight). Nothing was charged. The member can approve a new week budget on /muse-week.`,
      );
    }
  }

  const preCredits = generating ? await getMemberCredits(member.key) : null;
  let reply: McpReply;
  try {
    reply = await mcpCall(member.key, "tools/call", { name, arguments: args });
  } catch (err) {
    await settleReservation(0);
    throw err;
  }
  if (!generating || reply.result?.isError || reply.error) {
    await settleReservation(0);
    return { reply, charged: 0 };
  }

  // Settle at the ACTUAL charge for THIS call. The reply's own
  // creditCost is call-specific and wins; the member's whole-key
  // balance delta is only the fallback (concurrent activity on the
  // same key would otherwise be billed to this call). A failure
  // refunded bot-side settles at zero.
  const payload = resultPayload(reply);
  const reported = payload && typeof payload.creditsRemaining === "number" ? payload.creditsRemaining : null;
  const postCredits = reported ?? (await getMemberCredits(member.key));
  let charged: number;
  if (payload && typeof payload.creditCost === "number") {
    charged = Math.max(0, Math.trunc(payload.creditCost));
  } else if (preCredits !== null && postCredits !== null && preCredits >= 0 && postCredits >= 0) {
    charged = Math.max(0, preCredits - postCredits);
  } else if (preCredits === -1 || postCredits === -1) {
    charged = 0; // unlimited key: no balance moves, nothing to settle
  } else {
    charged = reserve;
  }

  await settleReservation(charged);
  if (charged > 0) {
    await db.usageRecord.create({
      data: { userId: session.user.id, kind: "BRIDGE", count: 1, meta: `muse-bridge:${name}:${charged}cr` },
    }).catch(() => undefined);
    if (postCredits !== null && postCredits >= 0) {
      await db.bridgeConnection.update({
        where: { userId: session.user.id },
        data: { credits: postCredits },
      }).catch(() => undefined);
    }
  }
  return { reply, charged };
}

/** The member's tool list, filtered to the bridge allowlist. */
export async function proxyToolsList(session: BridgeSession): Promise<unknown> {
  const member = await getMemberEngineKey(session.user);
  const reply = await mcpCall(member.key, "tools/list", {});
  const tools = (reply.result as unknown as { tools?: Array<{ name?: string }> } | undefined)?.tools;
  if (!Array.isArray(tools)) {
    // Upstream list unusable: synthesize the allowlist itself rather
    // than handing the member's agent an empty tool list.
    const names = [...BRIDGE_FREE_TOOLS, ...Object.keys(generatingCostsForScope(session.scope))];
    return {
      tools: names.map((name) => ({
        name,
        description: "Plunder & Riffle engine tool, available through the Muse bridge.",
        inputSchema: { type: "object", properties: {} },
      })),
    };
  }
  return { tools: tools.filter((t) => typeof t.name === "string" && bridgeToolAllowedForScope(session.scope, t.name)) };
}

// ─── Member-facing account view ─────────────────────────────────────

export interface BridgeAccountView {
  connected: boolean;
  /** Operator + Agency only (Dave, 2026-11-17) — see bridgeEligible. */
  eligible: boolean;
  /** Clip Factory: any member with a linked credit account, any plan. */
  clipsEligible: boolean;
  botPlan: BotPlan;
  credits: number | null;
  granted: number;
  period: string | null;
  brand: { name: string; website: string | null } | null;
  tokens: Array<{ id: string; budgetCredits: number; spentCredits: number; expiresAt: Date; active: boolean; scope: BridgeScope }>;
  weekBudgetCredits: number;
  offers: BridgeOffer[];
  error: string | null;
  errorCode: string | null;
}

export async function getBridgeAccountView(user: User): Promise<BridgeAccountView> {
  const brand = await db.brandProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { name: true, website: true },
  });
  const tokens = await db.bridgeToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, budgetCredits: true, spentCredits: true, expiresAt: true, revokedAt: true, scope: true },
  });
  const view: BridgeAccountView = {
    connected: false,
    eligible: bridgeEligible(user),
    clipsEligible: hasLinkedCreditAccount(user),
    botPlan: botPlanFor(user),
    credits: null,
    granted: 0,
    period: null,
    brand: brand ?? null,
    tokens: tokens.map((t) => ({
      id: t.id,
      budgetCredits: t.budgetCredits,
      spentCredits: t.spentCredits,
      expiresAt: t.expiresAt,
      active: !t.revokedAt && t.expiresAt.getTime() > Date.now(),
      scope: normalizeScope(t.scope),
    })),
    weekBudgetCredits: WEEK_BUDGET_CREDITS,
    offers: BRIDGE_OFFERS,
    error: null,
    errorCode: null,
  };
  if (!view.eligible) {
    // The offer gate sits in front of the engine: a non-eligible
    // member's visit never fetches a key and never triggers a grant.
    view.error = "The Muse bridge is a special offer for Operator and Agency members.";
    view.errorCode = "NOT_ELIGIBLE";
    return view;
  }
  try {
    const member = await getMemberEngineKey(user);
    view.connected = true;
    view.botPlan = member.plan;
    view.credits = member.credits;
    view.granted = member.granted;
    view.period = member.period || null;
  } catch (err) {
    if (err instanceof BridgeError) {
      view.error = err.message;
      view.errorCode = err.code;
    } else {
      view.error = "Could not reach the engine. Try again in a moment.";
      view.errorCode = "BOT_UNREACHABLE";
    }
  }
  return view;
}
