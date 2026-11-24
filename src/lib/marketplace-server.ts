import "server-only";
import { db } from "@/lib/db";
import { cleanAppFields, slugify, uniqueSlug, type AppFieldInput } from "@/lib/application";
import { capabilitiesFromJson } from "@/lib/agent-profile";
import { runBattery, validateBundle, type Bundle, type Manifest } from "@/lib/marketplace";
import { LISTING_FEE_CENTS, isTrustedSeller, publishGate } from "@/lib/marketplace";
import { LISTING_PLAN_ID } from "@/lib/credit-packs";
import { whopListMemberships } from "@/lib/whop";

export class MarketplaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
// M1 registry: the house replication skill named in HOUSE_SPACE and the house skills documented in the app manifest.
export const KNOWN_SKILLS = ["Plunder & Riffle MCP bridge — runs in your own Muse", "replicate_space", "Plunder & Riffle API key — your own, saved by your Muse via the bridge"];
export const LISTING_FEE_PLAN_ID = process.env.WHOP_LISTING_FEE_PLAN_ID?.trim() || LISTING_PLAN_ID;
export function listingFeeCheckoutUrl() { return process.env.WHOP_CHECKOUT_URL_LISTING_FEE?.trim() || `https://whop.com/checkout/${LISTING_FEE_PLAN_ID}`; }
const skillExists = (name: string) => KNOWN_SKILLS.includes(name);
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
  return { published: true };
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
