import "server-only";
import { db } from "@/lib/db";
import { cleanAppFields, slugify, uniqueSlug, type AppFieldInput } from "@/lib/application";
import { capabilitiesFromJson } from "@/lib/agent-profile";
import { runBattery, validateBundle, splitSale, canDownloadKit, type Bundle, type Manifest } from "@/lib/marketplace";
import { LISTING_FEE_CENTS, isTrustedSeller, publishGate } from "@/lib/marketplace";
import { LISTING_PLAN_ID } from "@/lib/credit-packs";
import { whopListMemberships } from "@/lib/whop";
import { API_VERSION_DATE, getWhopConfig } from "@/lib/whop";
import { BASE_USDC, HOUSE_EVM, INTENT_TTL_MS, isIntentExpired, verifyUsdcPayment } from "@/lib/paid-slots";

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due", "completed", "canceling"]);
const CLOSED_STATUSES = new Set(["canceled", "expired", "unresolved", "drafted"]);

export class MarketplaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
// M1 registry: the house replication skill named in HOUSE_SPACE and the house skills documented in the app manifest.
// Real skill registry for the battery's manifest check (M1 seeded this
// with descriptive strings copied from the house listing's manifest —
// two of them were KEYS, not skills — so every real member submission
// naming actual skills failed. Fixed 2026-11-24 during the first proof
// run.) Names are the house catalog's; comparison normalizes case and
// underscores (Space manifests write seo_gaps, skill dirs write seo-gaps).
export const KNOWN_SKILLS = ["seo_gaps", "find_local_clients", "pitch_the_fix", "space_demo_walkthrough", "social_publishing", "replicate_space", "space_demo_and_replicate", "content_atomizer", "affiliate_content", "speed_to_lead", "brand_bot_setup", "mnemos_training", "agent37_board_onboarding", "design_engine", "taste_finish_gate", "hyperframes", "gpt_researcher", "fxtwitter_post_reader", "grok_x_search", "drive_media_staging", "ethel_episode_runner", "character_intro_video", "video_production_engine", "present_script_engine", "starimg_job_tier_routing", "plunder_riffle_mcp_bridge"];
export const LISTING_FEE_PLAN_ID = process.env.WHOP_LISTING_FEE_PLAN_ID?.trim() || LISTING_PLAN_ID;
export function listingFeeCheckoutUrl() { return process.env.WHOP_CHECKOUT_URL_LISTING_FEE?.trim() || `https://whop.com/checkout/${LISTING_FEE_PLAN_ID}`; }
const normalizeSkill = (name: string) => name.trim().toLowerCase().replace(/_/g, "-");
const KNOWN_SKILL_SET = new Set(KNOWN_SKILLS.map(normalizeSkill));
const skillExists = (name: string) => KNOWN_SKILL_SET.has(normalizeSkill(name));
const probe = async (url: string | null | undefined) => {
  if (!url) return null;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
  try { const response = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" }); return { reachable: response.ok, contentType: response.headers.get("content-type") }; }
  catch { return null; } finally { clearTimeout(timer); }
};
const parseManifest = (raw: unknown): Manifest | null => {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const o = value as Record<string, unknown>;
    return { skills: Array.isArray(o.skills) ? o.skills.filter((x): x is string => typeof x === "string") : [], keys: Array.isArray(o.keys) ? o.keys : [] };
  } catch { return null; }
};
const storedBattery = async (submissionId: string, battery: ReturnType<typeof runBattery>, listingStatus: string, applicationId?: string) => {
  const now = new Date();
  const submission = await db.marketplaceSubmission.update({ where: { id: submissionId }, data: { status: battery.status, batteryJson: JSON.stringify(battery), batteryAt: now } });
  if (applicationId) await db.application.update({ where: { id: applicationId }, data: { listingStatus } });
  return submission;
};
async function executeBattery(bundle: unknown, manifestRaw: unknown, listing: { name: string; priceCents: number; demoKind: string | null; videoUrl: string | null }, oneInput: unknown) {
  const validated = validateBundle(bundle);
  const demoProbe = listing.videoUrl ? await probe(listing.videoUrl) : null;
  return runBattery({ bundle: validated.ok ? validated.bundle : bundle, manifest: parseManifest(manifestRaw), listing, demoProbe, skillExists, oneInput });
}

export async function submitSpace(userId: string, body: AppFieldInput & { agentSlug?: unknown; bundle?: unknown; oneInput?: unknown }) {
  if (typeof body.agentSlug !== "string" || !body.agentSlug.trim()) throw new MarketplaceError("agentSlug is required.");
  const agent = await db.hiredAgent.findFirst({ where: { slug: body.agentSlug, userId } });
  if (!agent) throw new MarketplaceError("Agent not found or not owned by this member.", 403);
  const cleaned = cleanAppFields(body, false); if ("error" in cleaned) throw new MarketplaceError(cleaned.error);
  const data = cleaned.data;
  const bundle = validateBundle(body.bundle); if (!bundle.ok) throw new MarketplaceError(bundle.error);
  const baseSlug = slugify(data.name!) || "app";
  const owned = await db.application.findFirst({ where: { userId, slug: baseSlug } });
  const candidate = owned ? baseSlug : await uniqueSlug(baseSlug, async (slug) => {
    const existing = await db.application.findFirst({ where: { slug }, select: { id: true } });
    return Boolean(existing);
  });
  const same = owned;
  const application = same
    ? await db.application.update({ where: { id: same.id }, data: { agentId: agent.id, name: data.name!, description: data.description ?? null, liveUrl: data.liveUrl ?? null, screenshotUrl: data.screenshotUrl ?? null, repoUrl: data.repoUrl ?? null, buildPrompt: data.buildPrompt ?? null, videoUrl: data.videoUrl ?? null, priceCents: data.priceCents ?? 0, currency: data.currency ?? "USD", category: data.category ?? null, demoKind: data.demoKind ?? null, buyUrl: data.buyUrl ?? null, replicationManifest: data.replicationManifest ?? null, public: false, listingStatus: "IN_REVIEW" } })
    : await db.application.create({ data: { agentId: agent.id, userId, slug: candidate, name: data.name!, description: data.description ?? null, liveUrl: data.liveUrl ?? null, screenshotUrl: data.screenshotUrl ?? null, repoUrl: data.repoUrl ?? null, buildPrompt: data.buildPrompt ?? null, videoUrl: data.videoUrl ?? null, priceCents: data.priceCents ?? 0, currency: data.currency ?? "USD", category: data.category ?? null, demoKind: data.demoKind ?? null, buyUrl: data.buyUrl ?? null, replicationManifest: data.replicationManifest ?? null, public: false, listingStatus: "IN_REVIEW" } });
  const submission = await db.marketplaceSubmission.create({ data: { userId, kind: "SPACE", refId: application.id, kitJson: JSON.stringify(bundle.bundle) } });
  const battery = await executeBattery(bundle.bundle, data.replicationManifest, { name: data.name!, priceCents: data.priceCents ?? 0, demoKind: data.demoKind ?? null, videoUrl: data.videoUrl ?? null }, body.oneInput);
  const saved = await storedBattery(submission.id, battery, battery.status === "READY" ? "READY" : "IN_REVIEW", application.id);
  return { submission: saved, application: { ...application, listingStatus: battery.status === "READY" ? "READY" : "IN_REVIEW", public: false }, battery };
}

export async function submitAgent(userId: string, body: { agentSlug?: unknown; bundle?: unknown; oneInput?: unknown }) {
  if (typeof body.agentSlug !== "string" || !body.agentSlug.trim()) throw new MarketplaceError("agentSlug is required.");
  const agent = await db.hiredAgent.findFirst({ where: { slug: body.agentSlug, userId } });
  if (!agent) throw new MarketplaceError("Agent not found or not owned by this member.", 403);
  if (!agent.publicProfile || !agent.name.trim() || !agent.category || capabilitiesFromJson(agent.capabilitiesJson).length === 0) throw new MarketplaceError("Agent profile is not ready for submission.");
  const bundle = validateBundle(body.bundle); if (!bundle.ok) throw new MarketplaceError(bundle.error);
  let capabilityKeys: unknown[] = capabilitiesFromJson(agent.capabilitiesJson);
  const existingApp = await db.application.findFirst({ where: { userId, agentId: agent.id } });
  const app = existingApp
    ? await db.application.update({ where: { id: existingApp.id }, data: { slug: agent.slug ?? existingApp.slug, name: agent.name, description: agent.description, liveUrl: agent.spaceUrl ?? agent.appUrl, videoUrl: agent.demoUrl, category: agent.category, buildPrompt: agent.buildPrompt, public: false, listingStatus: "IN_REVIEW" } })
    : await db.application.create({ data: { agentId: agent.id, userId, slug: agent.slug ?? `agent-${agent.id}`, name: agent.name, description: agent.description, liveUrl: agent.spaceUrl ?? agent.appUrl, videoUrl: agent.demoUrl, category: agent.category, buildPrompt: agent.buildPrompt, public: false, listingStatus: "IN_REVIEW" } });
  const submission = await db.marketplaceSubmission.create({ data: { userId, kind: "AGENT", refId: agent.id, kitJson: JSON.stringify(bundle.bundle) } });
  const battery = await executeBattery(bundle.bundle, { skills: capabilitiesFromJson(agent.capabilitiesJson), keys: capabilityKeys }, { name: agent.name, priceCents: 0, demoKind: null, videoUrl: agent.demoUrl }, body.oneInput);
  const saved = await storedBattery(submission.id, battery, battery.status === "READY" ? "READY" : "IN_REVIEW", app.id);
  return { submission: saved, agent, application: { ...app, listingStatus: battery.status === "READY" ? "READY" : "IN_REVIEW" }, battery };
}

export async function listMySubmissions(userId: string) {
  const rows = await db.marketplaceSubmission.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  const publishedCount = await db.application.count({ where: { userId, listingStatus: "PUBLISHED", public: true } });
  return Promise.all(rows.map(async (row) => {
    const application = row.kind === "SPACE" ? await db.application.findUnique({ where: { id: row.refId }, select: { feeStatus: true } }) : await db.application.findFirst({ where: { userId, agentId: row.refId }, select: { feeStatus: true } });
    const battery = row.batteryJson ? (() => { try { return JSON.parse(row.batteryJson!); } catch { return null; } })() : null;
    const reasons = row.status === "PUBLISHED" ? [] : [...(row.status === "READY" ? [] : ["Battery is not ready."]), ...(application?.feeStatus === "PAID" || application?.feeStatus === "WAIVED" ? [] : ["Listing fee is not paid."]), ...(!isTrustedSeller(publishedCount) && !row.reviewApproved ? ["Operator review is not approved."] : [])];
    return { ...row, feeStatus: application?.feeStatus ?? "UNPAID", publishReasons: reasons, battery };
  }));
}

export async function createFeeIntent(userId: string, slug: string) {
  const application = await db.application.findFirst({ where: { slug, userId } });
  if (!application) throw new MarketplaceError("Listing not found or not owned by this member.", 404);
  if (application.listingStatus !== "READY" && application.listingStatus !== "IN_REVIEW") throw new MarketplaceError("Listing must be READY or IN_REVIEW before paying its fee.");
  const [user, submission] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { referredById: true, marketplaceBundleAt: true, freeAgentListingUsed: true } }),
    db.marketplaceSubmission.findFirst({ where: { userId, refId: application.agentId, kind: "AGENT" }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!user) throw new MarketplaceError("Member not found.", 404);
  const kind = submission ? "AGENT" : "SPACE";
  if (kind === "AGENT" && user.marketplaceBundleAt && !user.freeAgentListingUsed) {
    const intent = await db.listingFeeIntent.create({ data: { userId, applicationId: application.id, kind, status: "WAIVED", feeCents: 0, referrerUserId: user.referredById } });
    await db.application.update({ where: { id: application.id }, data: { feeStatus: "WAIVED" } });
    await db.user.update({ where: { id: userId }, data: { freeAgentListingUsed: true } });
    return { intentId: intent.id, checkoutUrl: null, feeCents: 0, waived: true };
  }
  const pending = await db.listingFeeIntent.findFirst({ where: { userId, applicationId: application.id, status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const intent = pending ?? await db.listingFeeIntent.create({ data: { userId, applicationId: application.id, kind, feeCents: LISTING_FEE_CENTS, referrerUserId: user.referredById } });
  await db.application.update({ where: { id: application.id }, data: { feeStatus: "PENDING" } });
  return { intentId: intent.id, checkoutUrl: listingFeeCheckoutUrl(), feeCents: intent.feeCents, waived: false };
}

export async function confirmListingFees(userId: string): Promise<{ confirmed: number; error?: string }> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { whopId: true, marketplaceBundleAt: true } });
    if (!user?.whopId) return { confirmed: 0 };
    const memberships = (await whopListMemberships()).filter((m) => m.userId === user.whopId && (m.planId === LISTING_FEE_PLAN_ID || m.productId === LISTING_FEE_PLAN_ID) && ["active", "trialing", "past_due", "completed", "canceling"].includes(m.status)).sort((a, b) => a.id.localeCompare(b.id));
    let confirmed = 0;
    for (const membership of memberships) {
      if (await db.listingFeeIntent.findUnique({ where: { whopMembershipId: membership.id }, select: { id: true } })) continue;
      const intent = await db.listingFeeIntent.findFirst({ where: { userId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
      if (!intent) continue;
      await db.listingFeeIntent.update({ where: { id: intent.id }, data: { status: "PAID", whopMembershipId: membership.id, paidAt: new Date() } });
      await db.application.update({ where: { id: intent.applicationId }, data: { feeStatus: "PAID" } });
      confirmed++;
    }
    if (confirmed && !user.marketplaceBundleAt) await db.user.update({ where: { id: userId }, data: { marketplaceBundleAt: new Date() } });
    return { confirmed };
  } catch (err) { return { confirmed: 0, error: err instanceof Error ? err.message : "Whop fee confirmation failed." }; }
}

export async function publishListing(userId: string, slug: string, isOperator = false) {
  await confirmListingFees(userId);
  const app = await db.application.findFirst({ where: { slug, userId } });
  if (!app) throw new MarketplaceError("Listing not found or not owned by this member.", 404);
  const submission = await db.marketplaceSubmission.findFirst({ where: { userId, OR: [{ kind: "SPACE", refId: app.id }, { kind: "AGENT", refId: app.agentId }] }, orderBy: { createdAt: "desc" } });
  const publishedCount = await db.application.count({ where: { userId, listingStatus: "PUBLISHED", public: true } });
  const gate = publishGate({ batteryReady: submission?.status === "READY" || submission?.status === "PUBLISHED", feeStatus: app.feeStatus as "UNPAID" | "PENDING" | "PAID" | "WAIVED", reviewRequired: !isTrustedSeller(publishedCount), reviewApproved: submission?.reviewApproved ?? false, isOperator });
  if (!gate.ok) return { published: false, reasons: gate.reasons };
  const now = new Date();
  await db.application.update({ where: { id: app.id }, data: { public: true, listingStatus: "PUBLISHED" } });
  if (submission) await db.marketplaceSubmission.update({ where: { id: submission.id }, data: { status: "PUBLISHED", publishedAt: now } });
  const publishedApp = await db.application.findUnique({ where: { id: app.id } });
  if (publishedApp && publishedApp.priceCents > 0) await ensureWhopProduct(publishedApp);
  return { published: true };
}

export async function ensureWhopProduct(application: { id: string; name: string; priceCents: number; whopPlanId?: string | null; whopProductId?: string | null }) {
  if (application.priceCents === 0 || application.whopPlanId) return { ok: true as const, skipped: true };
  try {
    const cfg = getWhopConfig();
    if (!cfg.apiKey || !cfg.companyId) throw new Error("Whop API key or company ID is not configured");
    const headers = { Authorization: `Bearer ${cfg.apiKey}`, "Api-Version-Date": API_VERSION_DATE, "Content-Type": "application/json" };
    const productRes = await fetch(`${cfg.apiBase}/api/v1/products`, { method: "POST", headers, body: JSON.stringify({ company_id: cfg.companyId, title: application.name, visibility: "visible" }) });
    const productBody = await productRes.json().catch(() => ({})) as Record<string, unknown>;
    if (!productRes.ok || typeof productBody.id !== "string") throw new Error(`Whop product creation failed (${productRes.status})`);
    // Whop caps plan titles at 30 chars (verified live 2026-11-24: longer titles 400 at plan create).
    const planRes = await fetch(`${cfg.apiBase}/api/v1/plans`, { method: "POST", headers, body: JSON.stringify({ product_id: productBody.id, plan_type: "one_time", initial_price: application.priceCents / 100, currency: "usd", title: application.name.slice(0, 30) }) });
    const planBody = await planRes.json().catch(() => ({})) as Record<string, unknown>;
    if (!planRes.ok || typeof planBody.id !== "string") throw new Error(`Whop plan creation failed (${planRes.status})`);
    await db.application.update({ where: { id: application.id }, data: { whopProductId: productBody.id, whopPlanId: planBody.id, whopProductError: null } });
    return { ok: true as const };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Whop product creation failed").slice(0, 500);
    await db.application.update({ where: { id: application.id }, data: { whopProductError: message } }).catch(() => undefined);
    return { ok: false as const, error: message };
  }
}

async function findPublishedListing(slug: string) {
  return db.application.findFirst({ where: { slug, public: true, listingStatus: "PUBLISHED" }, include: { agent: true } });
}

export async function confirmWhopSalesForBuyer(buyerUserId: string): Promise<{ created: number; voided: number }> {
  const user = await db.user.findUnique({ where: { id: buyerUserId }, select: { whopId: true, referredById: true } });
  if (!user?.whopId) return { created: 0, voided: 0 };
  const memberships = (await whopListMemberships()).filter((m) => m.userId === user.whopId).sort((a, b) => a.id.localeCompare(b.id));
  const listings = await db.application.findMany({ where: { public: true, listingStatus: "PUBLISHED", whopPlanId: { not: null }, priceCents: { gt: 0 } } });
  let created = 0, voided = 0;
  for (const membership of memberships) {
    const listing = listings.find((row) => row.whopPlanId === membership.planId);
    if (!listing) continue;
    const prior = await db.marketplaceSale.findUnique({ where: { whopMembershipId: membership.id } });
    if (ENTITLED_STATUSES.has(membership.status) && !prior) {
      const split = splitSale(listing.priceCents);
      try {
        await db.marketplaceSale.create({ data: { listingId: listing.id, buyerUserId, sellerUserId: listing.userId, referrerUserId: user.referredById, grossCents: listing.priceCents, ...split, rail: "WHOP", whopMembershipId: membership.id } });
        created++;
      } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error; }
    } else if (CLOSED_STATUSES.has(membership.status) && prior?.status === "ACTIVE") {
      await db.marketplaceSale.update({ where: { id: prior.id }, data: { status: "VOID" } }); voided++;
    }
  }
  return { created, voided };
}

export async function getBuyInfo(userId: string, slug: string) {
  await confirmWhopSalesForBuyer(userId);
  const listing = await findPublishedListing(slug);
  if (!listing) throw new MarketplaceError("Listing not found.", 404);
  const owned = listing.userId === userId || Boolean(await db.marketplaceSale.findFirst({ where: { listingId: listing.id, buyerUserId: userId, status: "ACTIVE" } }));
  const salesOpen = listing.priceCents === 0 || Boolean(listing.whopPlanId);
  return { slug, priceCents: listing.priceCents, owned, whopCheckoutUrl: listing.whopPlanId ? `https://whop.com/checkout/${listing.whopPlanId}` : null, bankr: { wallet: HOUSE_EVM, amountUsdc: listing.priceCents / 100 }, salesOpen, salesState: salesOpen ? "open" : "sales not open yet" };
}

export async function getKitForBuyer(userId: string, slug: string) {
  await confirmWhopSalesForBuyer(userId);
  const listing = await findPublishedListing(slug);
  if (!listing) throw new MarketplaceError("Listing not found.", 404);
  const [sale, submission] = await Promise.all([
    db.marketplaceSale.findFirst({ where: { listingId: listing.id, buyerUserId: userId, status: "ACTIVE" } }),
    db.marketplaceSubmission.findFirst({ where: { kind: "SPACE", refId: listing.id, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" } }),
  ]);
  if (!canDownloadKit({ isOwner: listing.userId === userId, priceCents: listing.priceCents, hasActiveSale: Boolean(sale) })) return { error: "not_purchased", buyInfo: await getBuyInfo(userId, slug) };
  let kit: unknown; try { kit = JSON.parse(submission?.kitJson ?? "null"); } catch { kit = null; }
  return { kit, manifest: parseManifest(listing.replicationManifest) };
}

export async function createKitIntent(userId: string, slug: string) {
  const listing = await findPublishedListing(slug);
  if (!listing) throw new MarketplaceError("Listing not found.", 404);
  if (listing.userId === userId) throw new MarketplaceError("Owners do not need a purchase intent.");
  if (listing.priceCents <= 0) throw new MarketplaceError("Free listings do not create purchase intents.");
  const pending = await db.kitPurchaseIntent.findFirst({ where: { listingId: listing.id, buyerUserId: userId, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  const intent = pending ?? await db.kitPurchaseIntent.create({ data: { listingId: listing.id, buyerUserId: userId, amountCents: listing.priceCents, expiresAt: new Date(Date.now() + INTENT_TTL_MS) } });
  return { ...intent, wallet: HOUSE_EVM, usdcContract: BASE_USDC, amountRaw: String(BigInt(intent.amountCents) * BigInt(10_000)) };
}

async function rpc(method: string, params: unknown[]) {
  const response = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!response.ok) throw new Error("Could not read Base transaction");
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "Base RPC error");
  return body.result as Record<string, unknown> | null;
}

export async function verifyKitIntent(userId: string, intentId: string, txHash: string) {
  const intent = await db.kitPurchaseIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.buyerUserId !== userId) return { ok: false as const, reason: "Purchase intent not found" };
  if (intent.status !== "PENDING") return { ok: false as const, reason: "Purchase intent is not pending" };
  if (isIntentExpired(intent)) { await db.kitPurchaseIntent.update({ where: { id: intent.id }, data: { status: "EXPIRED" } }); return { ok: false as const, reason: "Purchase intent expired" }; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false as const, reason: "Invalid transaction hash" };
  const [usedIntent, usedSale] = await Promise.all([db.kitPurchaseIntent.findUnique({ where: { txHash } }), db.marketplaceSale.findUnique({ where: { txHash } })]);
  if ((usedIntent && usedIntent.id !== intent.id) || usedSale) return { ok: false as const, reason: "Transaction hash already used" };
  let tx: Record<string, unknown> | null, receipt: Record<string, unknown> | null;
  try { [tx, receipt] = await Promise.all([rpc("eth_getTransactionByHash", [txHash]), rpc("eth_getTransactionReceipt", [txHash])]); } catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : "Base RPC failed" }; }
  if (!tx || !receipt) return { ok: false as const, reason: "Transaction is not confirmed on Base yet" };
  const checked = verifyUsdcPayment({ tx: { to: tx.to as string | null, input: (tx.input ?? tx.data) as string }, receiptStatus: receipt.status as string, expectedTo: HOUSE_EVM, expectedAmountRaw: BigInt(intent.amountCents) * BigInt(10_000), usdcContract: BASE_USDC });
  if (!checked.ok) return checked;
  try {
    return await db.$transaction(async (txdb) => {
      const current = await txdb.kitPurchaseIntent.findUnique({ where: { id: intent.id } });
      if (!current || current.status !== "PENDING" || isIntentExpired(current)) throw new Error("Purchase intent is no longer pending");
      const listing = await txdb.application.findUnique({ where: { id: current.listingId } });
      const buyer = await txdb.user.findUnique({ where: { id: userId }, select: { referredById: true } });
      if (!listing || listing.listingStatus !== "PUBLISHED" || !listing.public) throw new Error("Listing is no longer available");
      const split = splitSale(current.amountCents);
      await txdb.kitPurchaseIntent.update({ where: { id: current.id }, data: { status: "PAID", txHash, paidAt: new Date() } });
      const sale = await txdb.marketplaceSale.create({ data: { listingId: listing.id, buyerUserId: userId, sellerUserId: listing.userId, referrerUserId: buyer?.referredById ?? null, grossCents: current.amountCents, ...split, rail: "BANKR", txHash } });
      return { ok: true as const, sale };
    });
  } catch (error) { return { ok: false as const, reason: error instanceof Error ? error.message : "Could not record payment" }; }
}

export async function getSellerBalance(userId: string) {
  const [seller, referrals] = await Promise.all([
    db.marketplaceSale.findMany({ where: { sellerUserId: userId, status: "ACTIVE" }, select: { grossCents: true, sellerCents: true } }),
    db.marketplaceSale.findMany({ where: { referrerUserId: userId, status: "ACTIVE" }, select: { referrerCents: true } }),
  ]);
  const salesCount = seller.length, grossCents = seller.reduce((n, x) => n + x.grossCents, 0), sellerCents = seller.reduce((n, x) => n + x.sellerCents, 0), referrerCents = referrals.reduce((n, x) => n + x.referrerCents, 0);
  return { seller: { salesCount, grossCents, sellerCents }, referrer: { referralSalesCount: referrals.length, referrerCents }, payout: { thresholdCents: 2500, payoutReady: sellerCents + referrerCents >= 2500 } };
}

export async function approveSubmission(operatorUserId: string, submissionId: string) {
  const submission = await db.marketplaceSubmission.update({ where: { id: submissionId }, data: { reviewApproved: true } });
  return { approved: true, submissionId: submission.id, operatorUserId };
}

export async function getBundle(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { marketplaceBundleAt: true, freeAgentListingUsed: true } });
  const granted = Boolean(user?.marketplaceBundleAt);
  return { granted, grantedAt: user?.marketplaceBundleAt ?? null, skills: ["space-demo-and-replicate (replicator)", "demo recording (in space-demo-and-replicate Step 2)"], freeAgentListing: { available: granted && !user?.freeAgentListingUsed, used: Boolean(user?.freeAgentListingUsed) } };
}

export async function drainBattery(limit: number) {
  const rows = await db.marketplaceSubmission.findMany({ where: { status: "PENDING_BATTERY" }, orderBy: { createdAt: "asc" }, take: Math.max(0, Math.min(100, limit)) });
  const results = [];
  for (const row of rows) {
    let bundle: unknown; try { bundle = JSON.parse(row.kitJson ?? "null"); } catch { bundle = null; }
    let manifest: unknown = null; let listing = { name: "Agent", priceCents: 0, demoKind: null as string | null, videoUrl: null as string | null }; let appId: string | undefined;
    if (row.kind === "SPACE") { const app = await db.application.findUnique({ where: { id: row.refId } }); appId = app?.id; if (app) { manifest = app.replicationManifest; listing = { name: app.name, priceCents: app.priceCents, demoKind: app.demoKind, videoUrl: app.videoUrl }; } }
    else { const agent = await db.hiredAgent.findUnique({ where: { id: row.refId } }); if (agent) { manifest = { skills: capabilitiesFromJson(agent.capabilitiesJson), keys: capabilitiesFromJson(agent.capabilitiesJson) }; listing = { name: agent.name, priceCents: 0, demoKind: null, videoUrl: agent.demoUrl }; } }
    const battery = await executeBattery(bundle, manifest, listing, "Muse input");
    await storedBattery(row.id, battery, battery.status === "READY" ? "READY" : "IN_REVIEW", appId);
    results.push({ id: row.id, status: battery.status, checks: battery.checks });
  }
  return { processed: results.length, results };
}
