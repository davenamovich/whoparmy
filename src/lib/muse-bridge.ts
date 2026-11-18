import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { isDesignatedOperator } from "@/lib/auth";

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

export const BRIDGE_GENERATING_COSTS: Record<string, number> = {
  create_demo_pack: 115,
  create_before_pitch: 50,
  generate_ad_creative: 60,
  generate_multilanguage_ads: 60,
};

export function bridgeToolAllowed(name: string): boolean {
  return BRIDGE_FREE_TOOLS.has(name) || name in BRIDGE_GENERATING_COSTS;
}

export function estimateToolCost(name: string, args: Record<string, unknown>): number {
  const base = BRIDGE_GENERATING_COSTS[name] ?? 0;
  if (name === "generate_multilanguage_ads" && Array.isArray(args.languages)) {
    // List pricing is per language; reserve for every language asked for.
    return base * Math.max(1, Math.min(10, args.languages.length));
  }
  return base;
}

// ─── The member's derived engine key (memory cache only) ────────────

export interface MemberKeyResult {
  key: string;
  plan: BotPlan;
  credits: number;
  granted: number;
  period: string;
}

const keyCache = new Map<string, { result: MemberKeyResult; fetchedAt: number }>();
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
    if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_TTL_MS) return cached.result;
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
  keyCache.set(user.id, { result, fetchedAt: Date.now() });
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

async function mcpCall(key: string, method: string, params: Record<string, unknown>): Promise<McpReply> {
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

export async function mintBridgeCode(userId: string, budgetCredits: number): Promise<{ code: string; expiresAt: Date; budgetCredits: number }> {
  const budget = Math.max(1, Math.min(MAX_BUDGET_CREDITS, Math.trunc(budgetCredits) || WEEK_BUDGET_CREDITS));
  const code = newBridgeCode();
  const expiresAt = new Date(Date.now() + BRIDGE_CODE_TTL_MS);
  // A fresh code retires every unused one before it: only one live code
  // per member, so a code left on an old page can never be exchanged.
  await db.bridgeCode.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await db.bridgeCode.create({ data: { userId, codeHash: sha256(code), budgetCredits: budget, expiresAt } });
  return { code, expiresAt, budgetCredits: budget };
}

export async function exchangeBridgeCode(rawCode: string): Promise<{ token: string; expiresAt: Date; budgetCredits: number; userId: string }> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  const row = await db.bridgeCode.findUnique({ where: { codeHash: sha256(code) } });
  if (!row || row.usedAt) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  if (row.expiresAt.getTime() <= Date.now()) throw new BridgeError(400, "BAD_CODE", "That bridge code expired. Generate a fresh one on /muse-week.");
  // Eligibility is re-checked at exchange: a member downgraded after
  // minting holds a code that no longer opens the offer. The code is
  // NOT consumed by this refusal — it works again if they upgrade
  // inside its 15 minutes.
  const owner = await db.user.findUnique({ where: { id: row.userId } });
  if (!owner) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  assertBridgeEligible(owner);
  // Single-use: claim it before minting, so a raced double exchange fails.
  const claimed = await db.bridgeCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new BridgeError(400, "BAD_CODE", "That bridge code isn't valid.");
  const token = BRIDGE_TOKEN_PREFIX + randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + BRIDGE_TOKEN_TTL_MS);
  await db.bridgeToken.create({
    data: { userId: row.userId, tokenHash: sha256(token), budgetCredits: row.budgetCredits, expiresAt },
  });
  return { token, expiresAt, budgetCredits: row.budgetCredits, userId: row.userId };
}

export interface BridgeSession {
  tokenId: string;
  user: User;
  budgetCredits: number;
  spentCredits: number;
  expiresAt: Date;
}

export async function verifyBridgeToken(raw: string | null): Promise<BridgeSession | null> {
  if (!raw || !raw.startsWith(BRIDGE_TOKEN_PREFIX)) return null;
  const row = await db.bridgeToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  await db.bridgeToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { tokenId: row.id, user: row.user, budgetCredits: row.budgetCredits, spentCredits: row.spentCredits, expiresAt: row.expiresAt };
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

  if (!bridgeToolAllowed(name)) {
    return toolError(
      `The Muse bridge cannot call ${name}. It runs research and content generation on the member's own credits; publishing and MP4 rendering stay with the member's approval inside Whoparmy. Allowed: ${[...BRIDGE_FREE_TOOLS, ...Object.keys(BRIDGE_GENERATING_COSTS)].join(", ")}.`,
    );
  }

  if (!bridgeEligible(session.user)) {
    return toolError(
      "The Muse bridge is a special offer for Operator and Agency members, and this connection's plan no longer includes it. Nothing was charged. The member can re-open the offer by upgrading in Whop.",
    );
  }

  const member = await getMemberEngineKey(session.user);
  const generating = name in BRIDGE_GENERATING_COSTS;
  const reserve = generating ? estimateToolCost(name, args) : 0;

  if (generating) {
    const current = await db.bridgeToken.findUnique({ where: { id: session.tokenId } });
    const spent = current?.spentCredits ?? session.spentCredits;
    if (spent + reserve > session.budgetCredits) {
      return toolError(
        `This ${name} call would exceed the week's approved budget (${session.budgetCredits} credits, ${spent} already spent). Nothing was charged. The member can approve a new week budget on /muse-week.`,
      );
    }
  }

  const preCredits = generating ? await getMemberCredits(member.key) : null;
  const reply = await mcpCall(member.key, "tools/call", { name, arguments: args });
  if (!generating || reply.result?.isError || reply.error) {
    return { reply, charged: 0 };
  }

  // Settle: prefer the engine's own post-call balance; fall back to a
  // creditCost field, then to the reserve. A failure refunded bot-side
  // shows a zero delta and settles at zero.
  const payload = resultPayload(reply);
  const reported = payload && typeof payload.creditsRemaining === "number" ? payload.creditsRemaining : null;
  const postCredits = reported ?? (await getMemberCredits(member.key));
  let charged: number;
  if (preCredits !== null && postCredits !== null && preCredits >= 0 && postCredits >= 0) {
    charged = Math.max(0, preCredits - postCredits);
  } else if (payload && typeof payload.creditCost === "number") {
    charged = Math.max(0, Math.trunc(payload.creditCost));
  } else if (preCredits === -1 || postCredits === -1) {
    charged = 0; // unlimited key: no balance moves, nothing to settle
  } else {
    charged = reserve;
  }

  if (charged > 0) {
    await db.bridgeToken.update({
      where: { id: session.tokenId },
      data: { spentCredits: { increment: charged } },
    }).catch(() => undefined);
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
  if (!Array.isArray(tools)) return reply.result ?? { tools: [] };
  return { tools: tools.filter((t) => typeof t.name === "string" && bridgeToolAllowed(t.name)) };
}

// ─── Member-facing account view ─────────────────────────────────────

export interface BridgeAccountView {
  connected: boolean;
  /** Operator + Agency only (Dave, 2026-11-17) — see bridgeEligible. */
  eligible: boolean;
  botPlan: BotPlan;
  credits: number | null;
  granted: number;
  period: string | null;
  brand: { name: string; website: string | null } | null;
  tokens: Array<{ id: string; budgetCredits: number; spentCredits: number; expiresAt: Date; active: boolean }>;
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
    select: { id: true, budgetCredits: true, spentCredits: true, expiresAt: true, revokedAt: true },
  });
  const view: BridgeAccountView = {
    connected: false,
    eligible: bridgeEligible(user),
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
