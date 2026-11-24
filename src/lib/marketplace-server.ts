import "server-only";
import { db } from "@/lib/db";
import { cleanAppFields, slugify, uniqueSlug, type AppFieldInput } from "@/lib/application";
import { capabilitiesFromJson } from "@/lib/agent-profile";
import { runBattery, validateBundle, type Bundle, type Manifest } from "@/lib/marketplace";

export class MarketplaceError extends Error { constructor(message: string, public status = 400) { super(message); } }
// M1 registry: the house replication skill named in HOUSE_SPACE and the house skills documented in the app manifest.
export const KNOWN_SKILLS = ["Plunder & Riffle MCP bridge — runs in your own Muse", "replicate_space", "Plunder & Riffle API key — your own, saved by your Muse via the bridge"];
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
  const submission = await db.marketplaceSubmission.create({ data: { userId, kind: "AGENT", refId: agent.id, kitJson: JSON.stringify(bundle.bundle) } });
  const battery = await executeBattery(bundle.bundle, { skills: capabilitiesFromJson(agent.capabilitiesJson), keys: capabilityKeys }, { name: agent.name, priceCents: 0, demoKind: null, videoUrl: agent.demoUrl }, body.oneInput);
  const saved = await storedBattery(submission.id, battery, battery.status, undefined);
  return { submission: saved, agent, battery };
}

export async function listMySubmissions(userId: string) {
  const rows = await db.marketplaceSubmission.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((row) => ({ ...row, battery: row.batteryJson ? (() => { try { return JSON.parse(row.batteryJson!); } catch { return null; } })() : null }));
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
