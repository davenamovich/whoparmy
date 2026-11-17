import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { FORMAT_MAP, CATEGORY_LABELS, type ContentCategory } from "@/lib/formats";
import { LANGUAGE_MAP, languageLabel } from "@/lib/languages";
import { OBJECTIVE_MAP, TONE_MAP } from "@/lib/formats";
import type { ProfileDTO } from "@/lib/types";
import { generateEngineMeme, memeBackend, researchBrand, type EngineResearch } from "@/lib/engine";
import { applyFreeGens } from "@/lib/usage-server";

// ─── Text generation backend (Starimg) ──────────────────────────────
// Slice 1 of the P&R rewire (REWIRE-DESIGN.md): every text call in this
// module runs on Starimg chat completions — the same provider and env
// names the agent runner already uses (STARIMG_API_KEY / STARIMG_BASE_URL).
// The Z.ai SDK this module originally ran on only exists on its home
// build platform, so it has been removed from the text path entirely.
// Image generation is slice 2 and stays unwired until Dave picks the lane.

function starimgConfig(): { key: string; base: string } | null {
  const key = process.env.STARIMG_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.STARIMG_BASE_URL?.trim() || "https://ai.starimg.ru/v1").replace(/\/$/, "");
  return { key, base };
}

let modelListPromise: Promise<string[]> | null = null;

async function starimgModels(cfg: { key: string; base: string }): Promise<string[]> {
  if (!modelListPromise) {
    modelListPromise = (async () => {
      try {
        const res = await fetch(`${cfg.base}/models`, {
          headers: { Authorization: ["Bearer", cfg.key].join(" ") },
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        return (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
      } catch {
        return [];
      }
    })();
  }
  return modelListPromise;
}

async function pickTextModel(cfg: { key: string; base: string }): Promise<string> {
  const preferred = process.env.STARIMG_TEXT_MODEL?.trim();
  if (preferred) return preferred;
  const live = await starimgModels(cfg);
  for (const candidate of ["gpt-6-luna", "claude-haiku-4-5"]) {
    if (live.includes(candidate)) return candidate;
  }
  return live[0] ?? "gpt-6-luna";
}

// ─── Robust JSON extraction from LLM output ─────────────────────────
export function parseJsonSafe<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    // attempt to find the outermost JSON object
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function llm(system: string, user: string): Promise<string> {
  const cfg = starimgConfig();
  if (!cfg) {
    throw new Error(
      "STARIMG_API_KEY is not set in the app environment — the operator sets it at deploy (Railway env) and the text engine picks it up.",
    );
  }
  const model = await pickTextModel(cfg);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: ["Bearer", cfg.key].join(" ") },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Text engine answered HTTP ${res.status}`);
      const completion = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = completion.choices?.[0]?.message?.content;
      if (!content || !content.trim()) throw new Error("Empty response from generation engine");
      return content;
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Generation engine unavailable");
}

/** Shared text completion for routes that used to call the Z.ai SDK directly. */
export async function chatCompletion(system: string, user: string): Promise<string> {
  return llm(system, user);
}

// ─── Website research (real fetch, then LLM synthesis) ──────────────
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface WebsiteResearchResult {
  pageText: string | null;
  title: string | null;
  metaDescription: string | null;
  researched: boolean;
}

export async function researchWebsite(url: string): Promise<WebsiteResearchResult> {
  const result: WebsiteResearchResult = { pageText: null, title: null, metaDescription: null, researched: false };
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  try {
    const res = await fetch(normalized, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PRContentFactory/1.0; +research-bot)" },
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
    });
    if (!res.ok) return result;
    const html = (await res.text()).slice(0, 400_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) result.title = stripHtml(titleMatch[1]).slice(0, 200);
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    if (descMatch) result.metaDescription = descMatch[1].slice(0, 300);
    result.pageText = stripHtml(html).slice(0, 6000);
    result.researched = result.pageText.length > 40;
    return result;
  } catch {
    return result;
  }
}

const PROFILE_SYSTEM = `You are P&R RESEARCH, the business intelligence unit of the Plunder & Riffle content engine.
Analyze the provided business signals and return a concise, factual business profile.
Respond with STRICT JSON only, no markdown, no commentary:
{"name":string,"industry":string,"description":string (2-3 sentences, marketing-ready),"products":string[] (up to 6),"audience":string,"sellingPoints":string[] (up to 5),"differentiators":string[] (up to 3),"primaryLanguage":string (ISO code like "en"),"suggestedLanguages":string[] (2-4 ISO codes),"suggestedTones":string[] (2-3 keys from: funny,sarcastic,professional,educational,controversial,inspirational,casual,bold,storytelling,sales)}
Never invent facts that are not supported by the signals. If signals are thin, keep entries short and generic-honest rather than fabricating specifics.`;

export async function buildProfileFromSignals(opts: {
  website?: string;
  pageText?: string | null;
  title?: string | null;
  metaDescription?: string | null;
  description?: string;
  idea?: string;
}): Promise<ProfileDTO> {
  const signals: string[] = [];
  if (opts.website) signals.push(`Website: ${opts.website}`);
  if (opts.title) signals.push(`Page title: ${opts.title}`);
  if (opts.metaDescription) signals.push(`Meta description: ${opts.metaDescription}`);
  if (opts.pageText) signals.push(`Page content (truncated):\n${opts.pageText}`);
  if (opts.description) signals.push(`Owner-provided description:\n${opts.description}`);
  if (opts.idea) signals.push(`Idea to build a business around:\n${opts.idea}`);

  const raw = await llm(PROFILE_SYSTEM, signals.join("\n\n"));
  const parsed = parseJsonSafe<Partial<ProfileDTO>>(raw);
  if (!parsed || !parsed.name || !parsed.description) {
    throw new Error("Could not build a reliable business profile from these signals");
  }
  return {
    name: String(parsed.name),
    industry: parsed.industry ? String(parsed.industry) : undefined,
    description: String(parsed.description),
    products: Array.isArray(parsed.products) ? parsed.products.map(String).slice(0, 6) : [],
    audience: parsed.audience ? String(parsed.audience) : undefined,
    sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.map(String).slice(0, 5) : [],
    differentiators: Array.isArray(parsed.differentiators) ? parsed.differentiators.map(String).slice(0, 3) : [],
    website: opts.website,
    primaryLanguage: parsed.primaryLanguage ? String(parsed.primaryLanguage) : "en",
    suggestedLanguages: Array.isArray(parsed.suggestedLanguages) ? parsed.suggestedLanguages.map(String) : ["en"],
    suggestedTones: Array.isArray(parsed.suggestedTones) ? parsed.suggestedTones.map(String) : ["casual"],
  };
}

/**
 * Brand profile built on P&R deep research (slice 3). The engine's
 * research_brand digests the member's website into sourced brand
 * knowledge; that digest feeds the profile builder, and the engine's
 * own findings win on the fields it speaks to directly (name,
 * description, audience, angles). Runs on the bridge key — the member
 * is not logged in to P&R and holds no key yet.
 */
export async function buildProfileFromResearch(opts: {
  brandName: string;
  website: string;
}): Promise<{ profile: ProfileDTO; research: EngineResearch }> {
  const research = await researchBrand({ url: opts.website });
  const dto = await buildProfileFromSignals({
    website: opts.website,
    pageText: research.digest,
    title: opts.brandName,
  });
  dto.name = research.brandName || opts.brandName;
  if (research.analysisSummary) dto.description = research.analysisSummary;
  if (research.audience) dto.audience = research.audience;
  dto.website = opts.website;
  const angles = research.angles.filter((a) => !dto.sellingPoints.includes(a));
  dto.sellingPoints = [...angles, ...dto.sellingPoints].slice(0, 6);
  if (research.offer && !dto.products.some((p) => p.toLowerCase().includes(research.offer!.slice(0, 24).toLowerCase()))) {
    dto.products = [research.offer, ...dto.products].slice(0, 6);
  }
  return { profile: dto, research };
}

// ─── Text content generation ────────────────────────────────────────
interface TextBatchRequest {
  profile: ProfileDTO;
  objective: string;
  objectiveLabel: string;
  tone: string;
  toneLabel: string;
  format: string;
  formatLabel: string;
  instruction: string;
  language: string;
  languageName: string;
  count: number;
  variation?: string;
}

function profileBlock(p: ProfileDTO): string {
  return [
    `Business: ${p.name}`,
    p.industry ? `Industry: ${p.industry}` : "",
    `Description: ${p.description}`,
    p.products.length ? `Products/Services: ${p.products.join("; ")}` : "",
    p.audience ? `Target audience: ${p.audience}` : "",
    p.sellingPoints.length ? `Selling points: ${p.sellingPoints.join("; ")}` : "",
    p.differentiators.length ? `Differentiators: ${p.differentiators.join("; ")}` : "",
    p.website ? `Website: ${p.website}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateTextBatch(req: TextBatchRequest): Promise<{ title: string; body: string }[]> {
  const system = `You are P&R ENGINE, an elite multilingual direct-response marketing copy team inside the Plunder & Riffle Global Content Factory.
You write like a native ${req.languageName} marketing copywriter who deeply understands local culture.

CULTURAL ADAPTATION RULES (critical):
- NEVER produce word-for-word translation. Culturally adapt the content for the target market.
- Adapt humor, idioms, slang and cultural references so they feel native.
- Preserve the original marketing message and the intended call to action.
- The output must sound like it was written by a local professional copywriter, not a machine.

FORMAT: ${req.instruction}
TONE: ${req.toneLabel}.
OBJECTIVE: ${req.objectiveLabel}.
${req.variation ? `VARIATION DIRECTIVE: rewrite with this directive — ${req.variation}.` : ""}

Respond with STRICT JSON only, no markdown fences, no commentary:
{"items":[{"title":string (short internal label for the piece),"body":string (the finished content, ready to publish)}]}
Produce exactly ${req.count} items. Vary angles and hooks across items.`;

  const user = `${profileBlock(req.profile)}\n\nLanguage: write natively in ${req.languageName} (code: ${req.language}).`;
  const raw = await llm(system, user);
  const parsed = parseJsonSafe<{ items?: { title?: string; body?: string }[] }>(raw);
  const items = parsed?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Generation engine returned an unreadable response");
  }
  return items.slice(0, req.count).map((it) => ({
    title: (it.title ?? "").toString().slice(0, 120) || `${req.formatLabel} — ${req.languageName}`,
    body: (it.body ?? "").toString(),
  }));
}

// ─── Meme concept generation ────────────────────────────────────────
export interface MemeConcept {
  title: string;
  imagePrompt: string;
  topText: string;
  bottomText: string;
}

export async function generateMemeConcepts(opts: {
  profile: ProfileDTO;
  objectiveLabel: string;
  toneLabel: string;
  formatInstruction: string;
  languageName: string;
  count: number;
}): Promise<MemeConcept[]> {
  const system = `You are P&R MEME DIVISION, a viral meme creative team.
Create ${opts.count} DISTINCT meme concepts for the business below. Format goal: ${opts.formatInstruction}. Tone: ${opts.toneLabel}. Objective: ${opts.objectiveLabel}.

For each concept return:
- "title": short internal label
- "imagePrompt": a detailed image-generation prompt describing a FUNNY, EXPRESSIVE SCENE that works as a meme BACKGROUND. Describe subjects, expressions, setting, style (photorealistic or illustration), lighting, mood. ABSOLUTELY NO TEXT, words, letters, captions or watermarks in the image.
- "topText": meme caption, max 60 characters, written natively in ${opts.languageName}
- "bottomText": meme punchline, max 60 characters, written natively in ${opts.languageName}

Culturally adapt the humor for a ${opts.languageName} audience — local expressions and references, never literal translation.

Respond with STRICT JSON only: {"items":[{"title":string,"imagePrompt":string,"topText":string,"bottomText":string}]}`;

  const raw = await llm(system, profileBlock(opts.profile));
  const parsed = parseJsonSafe<{ items?: MemeConcept[] }>(raw);
  const items = parsed?.items;
  if (!Array.isArray(items) || items.length === 0) throw new Error("Meme engine returned an unreadable response");
  return items.slice(0, opts.count).map((it) => ({
    title: String(it.title ?? "Meme").slice(0, 120),
    imagePrompt: String(it.imagePrompt ?? ""),
    topText: String(it.topText ?? "").slice(0, 90),
    bottomText: String(it.bottomText ?? "").slice(0, 90),
  }));
}

// ─── Real image generation ──────────────────────────────────────────
const GEN_DIR = path.join(process.cwd(), "public", "generated");

export async function generateMemeImage(assetId: string, imagePrompt: string): Promise<string> {
  // Slice 2 of the rewire (REWIRE-DESIGN.md) — intentionally unwired.
  // The Z.ai image API this used only exists on its home build platform.
  // Dave picks the image lane: a hosted image API behind this seam, or
  // the meme pipeline rebuilt on the P&R engine's meme kinds. Until then
  // this throws an honest error and callers mark the asset failed, the
  // same failure shape as before, with the real reason attached.
  void assetId;
  void imagePrompt;
  throw new Error("Image generation lane is not wired yet (REWIRE-DESIGN slice 2). Text generation works; meme images wait on the lane decision.");
}

export async function deleteMemeImage(imageUrl?: string | null) {
  if (!imageUrl || !imageUrl.startsWith("/generated/")) return;
  try {
    await fs.promises.unlink(path.join(GEN_DIR, path.basename(imageUrl)));
  } catch {
    // non-fatal
  }
}

// ─── Meme caption localization (same visual, native captions) ───────
export async function localizeMemeTexts(opts: {
  concept: { topText: string; bottomText: string; title: string };
  profileName: string;
  businessDescription: string;
  language: string;
  languageName: string;
}): Promise<{ title: string; topText: string; bottomText: string }> {
  const system = `You are P&R MEME DIVISION localizer. A meme about "${opts.profileName}" exists with English captions. Rewrite the captions natively in ${opts.languageName} (code: ${opts.language}) for that market — adapt the joke culturally, keep it punchy (max 60 chars per caption), keep the same marketing intent. Never literal translation.
Respond STRICT JSON only: {"title":string,"topText":string,"bottomText":string}`;
  const user = `Business: ${opts.profileName} — ${opts.businessDescription}\nOriginal title: ${opts.concept.title}\nTop: ${opts.concept.topText}\nBottom: ${opts.concept.bottomText}`;
  const raw = await llm(system, user);
  const parsed = parseJsonSafe<{ title?: string; topText?: string; bottomText?: string }>(raw);
  if (!parsed?.topText || !parsed?.bottomText) throw new Error("Meme localization failed");
  return {
    title: String(parsed.title ?? opts.concept.title).slice(0, 120),
    topText: String(parsed.topText).slice(0, 90),
    bottomText: String(parsed.bottomText).slice(0, 90),
  };
}

// ─── Single-asset regeneration & variations ─────────────────────────
export const VARIATIONS: { key: string; directive: string }[] = [
  { key: "funnier", directive: "Make it funnier." },
  { key: "shorter", directive: "Make it shorter and punchier." },
  { key: "persuasive", directive: "Make it more persuasive." },
  { key: "controversial", directive: "Make it more controversial (still brand-safe)." },
  { key: "stronger_cta", directive: "Add a stronger call to action." },
  { key: "natural", directive: "Make it more natural and human." },
  { key: "new_audience", directive: "Rewrite it for a different audience segment within the same market." },
];

export async function regenerateAsset(assetId: string, variation?: string, language?: string): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error("Asset not found");

  const spec = FORMAT_MAP[asset.format];
  if (!spec) throw new Error("Unknown format");
  const targetLanguage = language ?? asset.language;
  const variationDirective = variation ? VARIATIONS.find((v) => v.key === variation)?.directive : undefined;

  await db.asset.update({ where: { id: assetId }, data: { status: "GENERATING", error: null } });

  try {
    if (asset.type === "MEMES") {
      if (memeBackend() === "engine") {
        // Engine path (slice 2): a regenerate is a fresh engine call —
        // same language or natively in the target language, with the
        // variation directive folded into the brief.
        const campaign = asset.campaignId
          ? await db.campaign.findUnique({ where: { id: asset.campaignId } })
          : null;
        const profile = campaign
          ? (JSON.parse(campaign.profileJson) as ProfileDTO)
          : ({
              name: asset.title,
              description: asset.body,
              products: [],
              sellingPoints: [],
              differentiators: [],
              primaryLanguage: asset.language,
              suggestedLanguages: [],
              suggestedTones: [],
            } as ProfileDTO);
        if (!(await bridgeSlotAvailable(asset.userId))) {
          throw new Error("Daily bridge limit reached for engine memes — try again tomorrow, or connect your own P&R key.");
        }
        const made = await generateEngineMeme({
          brief:
            engineMemeBrief({
              profile,
              businessName: campaign?.businessName ?? asset.title,
              objective: campaign ? objectiveLabel(campaign.objective, campaign.customObjective) : "Promote the business",
              tone: campaign ? toneLabel(campaign.tone, campaign.customTone) : "Funny",
              formatInstruction: spec.instruction,
            }) + (variationDirective ? `\nVariation: ${variationDirective}` : ""),
          languageName: languageLabel(targetLanguage),
        });
        await db.asset.update({
          where: { id: assetId },
          data: {
            imageUrl: made.imageUrl,
            pageUrl: made.pageUrl,
            engineRef: made.pageId,
            language: targetLanguage,
            languageLabel: languageLabel(targetLanguage),
            status: "DONE",
          },
        });
        await recordUsage(asset.userId, "IMAGE", 1, "engine-meme-regen");
        return;
      }
      const concept: MemeConcept = {
        title: asset.title,
        imagePrompt: "",
        topText: asset.topText ?? "",
        bottomText: asset.bottomText ?? "",
      };
      if (targetLanguage === asset.language) {
        // fresh concept + fresh image
        const campaign = asset.campaignId
          ? await db.campaign.findUnique({ where: { id: asset.campaignId } })
          : null;
        const profile = campaign ? (JSON.parse(campaign.profileJson) as ProfileDTO) : ({
          name: asset.title,
          description: asset.body,
          products: [],
          sellingPoints: [],
          differentiators: [],
          primaryLanguage: asset.language,
          suggestedLanguages: [],
          suggestedTones: [],
        } as ProfileDTO);
        const concepts = await generateMemeConcepts({
          profile,
          objectiveLabel: campaign ? objectiveLabel(campaign.objective, campaign.customObjective) : "Promote the business",
          toneLabel: campaign ? toneLabel(campaign.tone, campaign.customTone) : "Funny",
          formatInstruction: spec.instruction,
          languageName: languageLabel(asset.language),
          count: 1,
        });
        const c = concepts[0];
        const imageUrl = await generateMemeImage(asset.id, c.imagePrompt);
        await deleteMemeImage(asset.imageUrl);
        await db.asset.update({
          where: { id: assetId },
          data: {
            title: c.title,
            topText: c.topText,
            bottomText: c.bottomText,
            imageUrl,
            language: asset.language,
            languageLabel: asset.languageLabel,
            status: "DONE",
          },
        });
      } else {
        // same visual, localized captions
        const campaign = asset.campaignId ? await db.campaign.findUnique({ where: { id: asset.campaignId } }) : null;
        const loc = await localizeMemeTexts({
          concept,
          profileName: campaign?.businessName ?? asset.title,
          businessDescription: campaign ? (JSON.parse(campaign.profileJson) as ProfileDTO).description : "",
          language: targetLanguage,
          languageName: languageLabel(targetLanguage),
        });
        await db.asset.update({
          where: { id: assetId },
          data: { ...loc, language: targetLanguage, languageLabel: languageLabel(targetLanguage), status: "DONE" },
        });
      }
      return;
    }

    // text formats
    const campaign = asset.campaignId ? await db.campaign.findUnique({ where: { id: asset.campaignId } }) : null;
    if (!campaign) throw new Error("Campaign context missing");
    const profile = JSON.parse(campaign.profileJson) as ProfileDTO;
    const items = await generateTextBatch({
      profile,
      objective: campaign.objective,
      objectiveLabel: objectiveLabel(campaign.objective, campaign.customObjective),
      tone: campaign.tone,
      toneLabel: toneLabel(campaign.tone, campaign.customTone),
      format: asset.format,
      formatLabel: asset.formatLabel,
      instruction: spec.instruction,
      language: targetLanguage,
      languageName: languageLabel(targetLanguage),
      count: 1,
      variation: variationDirective,
    });
    await db.asset.update({
      where: { id: assetId },
      data: {
        title: items[0].title,
        body: items[0].body,
        language: targetLanguage,
        languageLabel: languageLabel(targetLanguage),
        status: "DONE",
      },
    });
    await recordUsage(asset.userId, "TEXT", 1);
  } catch (err) {
    await db.asset.update({
      where: { id: assetId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Generation failed" },
    });
    await recordUsage(asset.userId, "FAILED", 1);
    throw err;
  }
}

// ─── Usage recording (successes only are billable events) ───────────
// ─── Bridge guard + engine brief (slice 2) ──────────────────────────
// Engine memes spend the bridge house key at 1 credit per call, so a
// per-member daily cap stands in front of them. PR_BRIDGE_DAILY_CAP
// overrides the default of 50.
function bridgeDailyCap(): number {
  const n = Number(process.env.PR_BRIDGE_DAILY_CAP ?? "50");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

async function bridgeSlotAvailable(userId: string): Promise<boolean> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const used = await db.usageRecord.aggregate({
    where: { userId, kind: "IMAGE", createdAt: { gte: start } },
    _sum: { count: true },
  });
  return (used._sum.count ?? 0) < bridgeDailyCap();
}

function engineMemeBrief(opts: {
  profile: ProfileDTO;
  businessName: string;
  objective: string;
  tone: string;
  formatInstruction: string;
}): string {
  const p = opts.profile;
  const parts = [
    `A meme for ${p.name || opts.businessName} — ${p.description}`,
    p.products.length ? `Products and services: ${p.products.join(", ")}.` : "",
    p.sellingPoints.length ? `Selling points: ${p.sellingPoints.join("; ")}.` : "",
    p.audience ? `Audience: ${p.audience}.` : "",
    `Campaign objective: ${opts.objective}. Tone: ${opts.tone}.`,
    `Format direction: ${opts.formatInstruction}`,
    "The meme must be about this business specifically — funny, punchy, and shareable.",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function recordUsage(userId: string, kind: "TEXT" | "IMAGE" | "VIDEO" | "FAILED", count: number, meta?: string) {
  if (count <= 0) return;
  try {
    await db.usageRecord.create({ data: { userId, kind, count, meta } });
    // Successful generations past the plan cap draw down the member's
    // free-generation pool (referral rewards). FAILED rows skip this —
    // failures never spend.
    if (kind !== "FAILED") {
      await applyFreeGens(userId).catch(() => undefined);
    }
  } catch {
    // usage logging must never break generation
  }
}

function objectiveLabel(objective: string, custom?: string | null): string {
  return custom?.trim() || OBJECTIVE_MAP[objective]?.label || "Promote the business";
}

function toneLabel(tone: string, custom?: string | null): string {
  return custom?.trim() || TONE_MAP[tone] || "Casual";
}

// ─── Job runner ─────────────────────────────────────────────────────
const IMAGE_STYLE_NOTE = "";

export function campaignStatusLabel(failed: number, total: number): string {
  if (total === 0) return "COMPLETE";
  if (failed === 0) return "COMPLETE";
  if (failed >= total) return "PARTIAL";
  return "PARTIAL";
}

/**
 * Processes a generation job: meme images first (shared visual per
 * concept across languages — authentic meme localization), then text
 * batches per (format, language). Updates per-asset and job progress.
 */
export async function runGenerationJob(jobId: string): Promise<void> {
  const job = await db.generationJob.findUnique({ where: { id: jobId }, include: { campaign: true } });
  if (!job) return;
  const campaign = job.campaign;

  try {
    await db.generationJob.update({ where: { id: jobId }, data: { status: "RUNNING", currentStep: "Preparing campaign engine" } });

    const profile = JSON.parse(campaign.profileJson) as ProfileDTO;
    const formats = JSON.parse(campaign.formats) as { category: ContentCategory; format: string; label: string }[];
    const languages = JSON.parse(campaign.languages) as string[];
    const primary = languages[0] ?? "en";

    const assets = await db.asset.findMany({ where: { campaignId: campaign.id, status: "PENDING" }, orderBy: { createdAt: "asc" } });

    let done = 0;
    let failed = 0;
    const total = assets.length;
    const bump = async (step: string) => {
      await db.generationJob.update({ where: { id: jobId }, data: { done, failed, total, currentStep: step } });
    };

    const groupKey = (a: { format: string; language: string }) => `${a.format}::${a.language}`;

    // ── Phase 1: memes (primary language concepts → real images, then localized captions)
    const memeFormats = formats.filter((f) => f.category === "MEMES");
    for (const f of memeFormats) {
      const langGroups = languages
        .map((lang) => ({
          lang,
          assets: assets.filter((a) => a.format === f.format && a.language === lang),
        }))
        .filter((g) => g.assets.length > 0);
      if (langGroups.length === 0) continue;

      if (memeBackend() === "engine") {
        // Engine path (slice 2): one engine call per asset, generated
        // natively in the asset's own language. The concept → image →
        // localize chain does not exist here — the engine bakes the
        // text into the render and returns a shareable page.
        for (const g of langGroups) {
          for (const asset of g.assets) {
            await bump(`Generating ${FORMAT_MAP[f.format]?.label ?? f.format} on the P&R engine — ${languageLabel(g.lang)}`);
            await db.asset.update({ where: { id: asset.id }, data: { status: "GENERATING" } });
            try {
              if (!(await bridgeSlotAvailable(campaign.userId))) {
                throw new Error("Daily bridge limit reached for engine memes — try again tomorrow, or connect your own P&R key.");
              }
              const made = await generateEngineMeme({
                brief: engineMemeBrief({
                  profile,
                  businessName: campaign.businessName,
                  objective: objectiveLabel(campaign.objective, campaign.customObjective),
                  tone: toneLabel(campaign.tone, campaign.customTone),
                  formatInstruction: FORMAT_MAP[f.format]?.instruction ?? "A shareable meme",
                }),
                languageName: languageLabel(g.lang),
              });
              await db.asset.update({
                where: { id: asset.id },
                data: {
                  title: `${FORMAT_MAP[f.format]?.label ?? "Meme"} — ${campaign.businessName}`,
                  imageUrl: made.imageUrl,
                  pageUrl: made.pageUrl,
                  engineRef: made.pageId,
                  status: "DONE",
                },
              });
              done++;
              await recordUsage(campaign.userId, "IMAGE", 1, "engine-meme");
            } catch (err) {
              await db.asset.update({
                where: { id: asset.id },
                data: { status: "FAILED", error: err instanceof Error ? err.message : "Engine meme failed" },
              });
              failed++;
              await recordUsage(campaign.userId, "FAILED", 1, "engine-meme");
            }
          }
        }
        continue;
      }

      await bump(`Designing ${FORMAT_MAP[f.format]?.label ?? f.format} concepts`);
      // concepts in primary language (or first available)
      const conceptLang = langGroups.find((g) => g.lang === primary)?.lang ?? langGroups[0].lang;
      let concepts: MemeConcept[] = [];
      try {
        concepts = await generateMemeConcepts({
          profile,
          objectiveLabel: objectiveLabel(campaign.objective, campaign.customObjective),
          toneLabel: toneLabel(campaign.tone, campaign.customTone),
          formatInstruction: FORMAT_MAP[f.format]?.instruction ?? "A shareable meme",
          languageName: languageLabel(conceptLang),
          count: campaign.piecesPerFormat,
        });
      } catch (err) {
        for (const g of langGroups) {
          for (const a of g.assets) {
            await db.asset.update({
              where: { id: a.id },
              data: { status: "FAILED", error: err instanceof Error ? err.message : "Meme generation failed" },
            });
            failed++;
          }
        }
        await recordUsage(campaign.userId, "FAILED", langGroups.reduce((n, g) => n + g.assets.length, 0));
        continue;
      }

      // base visuals (one per concept) on the concept-language assets
      const conceptCarrier = langGroups.find((g) => g.lang === conceptLang)!;
      const imageUrls: string[] = [];
      for (let i = 0; i < conceptCarrier.assets.length; i++) {
        const asset = conceptCarrier.assets[i];
        const concept = concepts[i % concepts.length];
        await bump(`Generating ${FORMAT_MAP[f.format]?.label ?? f.format} imagery (${i + 1}/${conceptCarrier.assets.length})`);
        await db.asset.update({ where: { id: asset.id }, data: { status: "GENERATING" } });
        try {
          if (!concept.imagePrompt) throw new Error("Empty image prompt");
          const imageUrl = await generateMemeImage(asset.id, concept.imagePrompt + (IMAGE_STYLE_NOTE ? `, ${IMAGE_STYLE_NOTE}` : ""));
          imageUrls[i] = imageUrl;
          await db.asset.update({
            where: { id: asset.id },
            data: { title: concept.title, topText: concept.topText, bottomText: concept.bottomText, imageUrl, status: "DONE" },
          });
          done++;
          await recordUsage(campaign.userId, "IMAGE", 1);
        } catch (err) {
          await db.asset.update({
            where: { id: asset.id },
            data: { status: "FAILED", error: err instanceof Error ? err.message : "Image generation failed" },
          });
          failed++;
          await recordUsage(campaign.userId, "FAILED", 1);
        }
      }

      // other languages: localize captions onto the shared visuals
      for (const g of langGroups) {
        if (g.lang === conceptLang) continue;
        for (let i = 0; i < g.assets.length; i++) {
          const asset = g.assets[i];
          const concept = concepts[i % concepts.length];
          const imageUrl = imageUrls[i % Math.max(imageUrls.length, 1)] ?? null;
          await db.asset.update({ where: { id: asset.id }, data: { status: "GENERATING" } });
          try {
            const loc = await localizeMemeTexts({
              concept,
              profileName: campaign.businessName,
              businessDescription: profile.description,
              language: g.lang,
              languageName: languageLabel(g.lang),
            });
            await db.asset.update({
              where: { id: asset.id },
              data: { title: loc.title, topText: loc.topText, bottomText: loc.bottomText, imageUrl, status: "DONE" },
            });
            done++;
            await recordUsage(campaign.userId, "TEXT", 1);
          } catch (err) {
            await db.asset.update({
              where: { id: asset.id },
              data: { status: "FAILED", error: err instanceof Error ? err.message : "Meme localization failed" },
            });
            failed++;
            await recordUsage(campaign.userId, "FAILED", 1);
          }
        }
      }
    }

    // ── Phase 2: text formats, one LLM batch per (format, language)
    for (const f of formats.filter((x) => x.category !== "MEMES")) {
      for (const lang of languages) {
        const group = assets.filter((a) => a.format === f.format && a.language === lang);
        if (group.length === 0) continue;
        await bump(`Writing ${FORMAT_MAP[f.format]?.label ?? f.format} — ${languageLabel(lang)}`);
        for (const a of group) await db.asset.update({ where: { id: a.id }, data: { status: "GENERATING" } });
        try {
          const items = await generateTextBatch({
            profile,
            objective: campaign.objective,
            objectiveLabel: objectiveLabel(campaign.objective, campaign.customObjective),
            tone: campaign.tone,
            toneLabel: toneLabel(campaign.tone, campaign.customTone),
            format: f.format,
            formatLabel: FORMAT_MAP[f.format]?.label ?? f.format,
            instruction: FORMAT_MAP[f.format]?.instruction ?? "High quality marketing content",
            language: lang,
            languageName: languageLabel(lang),
            count: group.length,
          });
          for (let i = 0; i < group.length; i++) {
            const item = items[i % items.length];
            await db.asset.update({
              where: { id: group[i].id },
              data: { title: item.title, body: item.body, status: "DONE" },
            });
            done++;
          }
          await recordUsage(campaign.userId, "TEXT", group.length);
        } catch (err) {
          for (const a of group) {
            await db.asset.update({
              where: { id: a.id },
              data: { status: "FAILED", error: err instanceof Error ? err.message : "Generation failed" },
            });
            failed++;
          }
          await recordUsage(campaign.userId, "FAILED", group.length);
        }
      }
    }

    const finalStatus = failed === 0 ? "COMPLETE" : "PARTIAL";
    await db.campaign.update({ where: { id: campaign.id }, data: { status: finalStatus } });
    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "COMPLETE", done, failed, total, currentStep: null },
    });
  } catch (err) {
    await db.campaign.update({ where: { id: campaign.id }, data: { status: "PARTIAL" } }).catch(() => {});
    await db.generationJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unexpected engine failure",
      },
    }).catch(() => {});
  }
}
