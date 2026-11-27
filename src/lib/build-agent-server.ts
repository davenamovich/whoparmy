import "server-only";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { internalBotBudget } from "@/lib/agents";
import { capabilitiesToJson, uniqueSlug } from "@/lib/agent-profile";
import { getResearchJob, startResearchJob } from "@/lib/research-jobs";
import { draftBlueprint, getBlueprint } from "@/lib/blueprint";
import { composeSetupPrompt } from "@/lib/setup-prompt";
import { HOUSE_ACCOUNT_EMAIL } from "@/lib/upload-post";
import {
  BridgeError,
  assertBridgeEligible,
  bridgeOffer,
  getOrCreateBridgeKeyClaim,
  getMemberEngineKey,
  mintBridgeCode,
} from "@/lib/muse-bridge";
import { getBridgeState, getSavedOfferLinks } from "@/lib/bridge";
import { selectWalkthroughOffers, shouldSuggestWalkthrough } from "@/lib/build-walkthrough-core";
import { getMemberLanguage } from "@/lib/member-language";
import { saveQuiz } from "@/lib/quiz";
import { awardXp } from "@/lib/game";
import { ensureAgentRotatorRow } from "@/lib/rotator-v2";
import { recordConversion } from "@/lib/referrals";
import {
  NO_WEBSITE_NOTE,
  buildStep1Complete,
  composeAgentInstructions,
  composeBuildAgentAddendum,
  designAgent,
  noWebsiteBrandName,
  noWebsiteProfile,
  researchSummaryText,
  starterFirstResult,
  type BuildQuizAnswers,
  type BuildResearchProfile,
  type BuildResearchSummary,
  type BuildStep1Status,
} from "@/lib/build-agent";
import type { ProfileDTO, ResearchSummary } from "@/lib/types";

/**
 * ─── BUILD-AN-AGENT FLOW — server layer (Slice 4) ──────────────────
 * Flow state per member in AppSetting under `buildflow:<userId>`
 * (the Blueprint precedent — no new table). Research runs on the
 * EXISTING background research lane (lib/research-jobs.ts →
 * runBrandAnalysis → the engine's research_brand); a finished job's
 * findings also land on the member's BrandProfile, exactly where
 * every other lane reads them from. The agent is a real HiredAgent
 * created the way blueprint approval creates hires (direct row,
 * templateKey "custom", plan-internal budget — agents are unlimited
 * under the engine-meter model; generations are what plans meter).
 * The prompt is the Day-1 engine prompt (lib/setup-prompt.ts)
 * composed with a freshly minted bridge link, plus the Slice 4
 * addendum (lib/build-agent.ts).
 *
 * The composed prompt is stored ONLY in this private flow state —
 * never on the agent's public buildPrompt field: it carries the
 * member's bridge connect link, and a published profile must never
 * leak it.
 */

export interface BuildFlowState {
  website?: string;
  brandName?: string;
  brandId?: string | null;
  researchJobId?: string;
  researchStatus?: BuildStep1Status;
  /** True when step 1 completed via the no-website path — the profile is the owner's name + quiz answers, never research. */
  noWebsite?: boolean;
  researchNote?: string;
  research?: BuildResearchSummary | null;
  profile?: BuildResearchProfile | null;
  quizAnswers?: BuildQuizAnswers;
  agentId?: string;
  agentSlug?: string | null;
  prompt?: string;
  promptCreatedAt?: string;
  bridgeEligible?: boolean;
  foundation?: { lane: "bridge-only" | "durable-pending-proof" | "durable"; keyClaimedAt?: string; mcpProvenAt?: string };
  updatedAt: string;
}

export function foundationFromState(state: BuildFlowState | null | undefined) {
  return state?.foundation ?? { lane: "bridge-only" as const };
}

export async function markFoundationClaimed(userId: string): Promise<void> {
  const state = await getBuildFlow(userId);
  await saveBuildFlow(userId, { ...(state ?? { updatedAt: "" }), foundation: { ...(state?.foundation ?? { lane: "bridge-only" }), lane: "durable-pending-proof", keyClaimedAt: new Date().toISOString() } });
}

export async function confirmFoundation(userId: string, provenAt?: string): Promise<BuildFlowState> {
  const state = await getBuildFlow(userId);
  return saveBuildFlow(userId, { ...(state ?? { updatedAt: "" }), foundation: { ...(state?.foundation ?? { lane: "bridge-only" }), lane: "durable", mcpProvenAt: provenAt && !Number.isNaN(Date.parse(provenAt)) ? provenAt : new Date().toISOString() } });
}

const keyFor = (userId: string) => `buildflow:${userId}`;

export async function getBuildFlow(userId: string): Promise<BuildFlowState | null> {
  const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as BuildFlowState;
    if (typeof parsed.updatedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBuildFlow(userId: string, state: BuildFlowState): Promise<BuildFlowState> {
  const full: BuildFlowState = { ...state, updatedAt: new Date().toISOString() };
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    create: { key: keyFor(userId), value: JSON.stringify(full) },
    update: { value: JSON.stringify(full) },
  });
  return full;
}

// ─── Research ──────────────────────────────────────────────────────

export function normalizeWebsite(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function hostOf(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toBuildSummary(r: ResearchSummary | null | undefined): BuildResearchSummary | null {
  if (!r) return null;
  return {
    brandName: r.brandName,
    voice: r.voice,
    hashtag: r.hashtag,
    analysisSummary: r.analysisSummary,
    offer: r.offer,
    audience: r.audience,
    pains: r.pains ?? [],
    angles: r.angles ?? [],
    competitors: r.competitors ?? [],
    sourceUrl: r.sourceUrl,
  };
}

function toBuildProfile(p: ProfileDTO | null | undefined): BuildResearchProfile | null {
  if (!p) return null;
  return {
    name: p.name,
    industry: p.industry,
    description: p.description,
    products: p.products ?? [],
    audience: p.audience,
    sellingPoints: p.sellingPoints ?? [],
    differentiators: p.differentiators ?? [],
  };
}

/**
 * Step 1: start (or reuse) deep research for the member's website.
 * Reuse = a BrandProfile for the same host already carries research —
 * the flow says so instead of re-running a 2-minute job.
 */
export async function startBuildResearch(
  user: User,
  websiteRaw: string,
  brandNameRaw?: string,
  options?: { noWebsite?: boolean },
): Promise<{ state: BuildFlowState } | { error: string; status: number }> {
  const prev = (await getBuildFlow(user.id)) ?? { updatedAt: "" };

  // No-website path (P0-1): no research job is started and none is
  // faked — step 1 completes on the owner's business name, the
  // profile stays explicitly name-only, and the quiz supplies the
  // rest at create time. The name edit persists in the flow state.
  if (options?.noWebsite) {
    const brandName = noWebsiteBrandName(brandNameRaw);
    if (!brandName) {
      return { error: "Add your business name — with no website, your agent is built from your name and your quiz answers.", status: 400 };
    }
    const state = await saveBuildFlow(user.id, {
      ...prev,
      website: undefined,
      brandName,
      brandId: undefined,
      researchJobId: undefined,
      researchStatus: "no-website",
      noWebsite: true,
      researchNote: NO_WEBSITE_NOTE,
      research: null,
      profile: noWebsiteProfile(brandName),
    });
    return { state };
  }

  const website = normalizeWebsite(websiteRaw);
  if (!website) return { error: "Enter your website — a full URL like https://yourbusiness.com.", status: 400 };
  const host = hostOf(website);

  const brands = await db.brandProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const researched = brands.find((b) => hostOf(b.website) === host && b.researchJson);
  if (researched) {
    let summary: BuildResearchSummary | null = null;
    try {
      summary = toBuildSummary(JSON.parse(researched.researchJson!) as ResearchSummary);
    } catch {
      summary = null;
    }
    const state = await saveBuildFlow(user.id, {
      ...prev,
      website,
      brandName: researched.name,
      brandId: researched.id,
      researchJobId: undefined,
      researchStatus: "reused",
      noWebsite: false,
      researchNote: "Reused the deep research already on file for this site — no need to run it again.",
      research: summary,
      profile: {
        name: researched.name,
        industry: researched.industry ?? undefined,
        description: researched.description ?? undefined,
        audience: researched.audience ?? undefined,
      },
    });
    return { state };
  }

  const brandName = (brandNameRaw ?? "").trim() || brands.find((b) => hostOf(b.website) === host)?.name || host;
  const job = await startResearchJob({ userId: user.id, brandName, website });
  const state = await saveBuildFlow(user.id, {
    ...prev,
    website,
    brandName,
    researchJobId: job.id,
    researchStatus: "running",
    noWebsite: false,
    researchNote: undefined,
    research: undefined,
    profile: undefined,
  });
  return { state };
}

/**
 * Poll-side refresh: when the background job lands, fold its result
 * into the flow state AND onto the member's BrandProfile (the shared
 * record every lane reads). Brand creation respects the plan's brand
 * cap the same way POST /api/brands does; at the cap the research
 * still lives in this flow, with an honest note.
 */
export async function refreshBuildResearch(user: User): Promise<BuildFlowState | null> {
  const state = await getBuildFlow(user.id);
  if (!state || state.researchStatus !== "running" || !state.researchJobId) return state;
  const job = await getResearchJob(user.id, state.researchJobId);
  if (!job) {
    return saveBuildFlow(user.id, { ...state, researchStatus: "failed", researchNote: "That research job could not be found. Run it again." });
  }
  if (job.status === "running") return state;
  if (job.status === "failed" || !job.result) {
    return saveBuildFlow(user.id, {
      ...state,
      researchStatus: "failed",
      researchNote: job.error ?? "Deep research failed. Run it again.",
    });
  }

  const summary = toBuildSummary(job.result.research);
  const profile = toBuildProfile(job.result.profile);
  let brandId: string | null = null;
  let note = job.result.note;
  const host = hostOf(state.website);
  const allBrands = await db.brandProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const existing = allBrands.find((b) => hostOf(b.website) === host) ?? null;
  if (existing) {
    await db.brandProfile.update({
      where: { id: existing.id },
      data: { researchJson: summary ? JSON.stringify(summary).slice(0, 60_000) : existing.researchJson },
    });
    brandId = existing.id;
  } else {
    const plan = getPlan(user.plan);
    const count = await db.brandProfile.count({ where: { userId: user.id } });
    if (count < plan.maxBrands && profile) {
      const brand = await db.brandProfile.create({
        data: {
          userId: user.id,
          name: (profile.name ?? state.brandName ?? host).slice(0, 120),
          website: state.website ?? null,
          industry: profile.industry ?? null,
          description: profile.description ?? null,
          products: profile.products?.length ? profile.products.join(", ") : null,
          audience: profile.audience ?? summary?.audience ?? null,
          voice: summary?.voice ?? null,
          languages: JSON.stringify(["en"]),
          researchJson: summary ? JSON.stringify(summary).slice(0, 60_000) : null,
        },
      });
      brandId = brand.id;
    } else if (count >= plan.maxBrands) {
      note = `${note ? `${note} ` : ""}Your ${plan.name} plan's brand profiles are full, so this research is saved in this flow only — your agent still works from it here.`;
    }
  }

  return saveBuildFlow(user.id, {
    ...state,
    researchStatus: "done",
    research: summary,
    profile,
    brandId,
    researchNote: note,
  });
}

// ─── Quiz ──────────────────────────────────────────────────────────

export async function saveBuildQuiz(user: User, answers: BuildQuizAnswers): Promise<BuildFlowState> {
  const prev = (await getBuildFlow(user.id)) ?? { updatedAt: "" };
  // The front-door quiz record is what the Blueprint architect reads
  // for "what they promote" — keep it in step (best-effort).
  await saveQuiz(user.id, {
    promoting: (answers.promoting as never) ?? null,
    agentPath: answers.runsOn === "agent37" ? "agent37" : "muse",
  }).catch(() => undefined);
  return saveBuildFlow(user.id, { ...prev, quizAnswers: answers });
}

// ─── Create: design → HiredAgent → prompt + bridge code ────────────

export interface BuildCreateResult {
  state: BuildFlowState;
  agent: {
    id: string;
    name: string;
    slug: string | null;
    category: string | null;
    capabilities: string[];
    description: string | null;
    publicProfile: boolean;
  };
  prompt: string;
  bridgeCode: string | null;
  connectLink: string | null;
  keyClaimLink: string | null;
  updateToken: string | null;
  bridgeEligible: boolean;
}

export async function createBuildAgent(user: User, options: { walkthrough?: boolean } = {}): Promise<{ result: BuildCreateResult } | { error: string; status: number }> {
  let state = await refreshBuildResearch(user);
  state = state ?? (await getBuildFlow(user.id));
  if (!state || !buildStep1Complete(state.researchStatus)) {
    return { error: "Finish step 1 first — run the deep research, or continue without a website. Your agent is designed from what step 1 holds.", status: 400 };
  }
  if (!state.quizAnswers) {
    return { error: "Answer the short quiz first — the design needs your answers.", status: 400 };
  }
  const quiz = state.quizAnswers;
  const researchText = researchSummaryText(state.research ?? null, state.profile ?? null);
  const design = designAgent({
    brandName: state.brandName ?? state.profile?.name ?? null,
    website: state.website ?? null,
    research: state.research ?? null,
    profile: state.profile ?? null,
    quiz,
  });

  // The agent row: reuse the flow's agent on re-runs (a second mint
  // must not spawn a duplicate); create it the blueprint way when new.
  let agent = state.agentId ? await db.hiredAgent.findFirst({ where: { id: state.agentId, userId: user.id } }) : null;
  if (!agent) {
    const slug = await uniqueSlug(design.name, async (candidate) => {
      const taken = await db.hiredAgent.findFirst({ where: { slug: candidate }, select: { id: true } });
      return Boolean(taken);
    });
    agent = await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: "custom",
        name: design.name,
        tokenBudget: internalBotBudget(user.plan),
        role: design.role,
        instructions: composeAgentInstructions({ design, website: state.website ?? null, researchText, quiz }),
        slug,
        publicProfile: false,
        description: design.description,
        category: design.category,
        capabilitiesJson: capabilitiesToJson(design.capabilities),
      },
    });
    // Same first-hire side effects as POST /api/agents (best-effort).
    void awardXp(user.id, "BOT_RENTED", "custom").catch(() => {});
    const totalHires = await db.hiredAgent.count({ where: { userId: user.id } });
    if (totalHires === 1) void recordConversion(user.id).catch(() => {});
  }

  // Built agents use the same shared rotator row path as other hires.
  // Best-effort bookkeeping must not interrupt prompt delivery.
  try { await ensureAgentRotatorRow(agent.id, user.id); }
  catch (err) { console.error("[build-agent] ensureAgentRotatorRow failed:", err); }

  // The prompt: Day-1 engine prompt composed with a freshly minted
  // bridge link when the member is bridge-eligible (the setup-prompt
  // pattern); otherwise the prompt still crafts and says the one step.
  const blueprint = (await getBlueprint(user.id)) ?? (await draftBlueprint(user));
  let code: string | null = null;
  let keyClaimLink: string | null = null;
  let updateToken: string | null = null;
  let link: string | null = null;
  let eligible = false;
  try {
    assertBridgeEligible(user);
    const member = await getMemberEngineKey(user); // prove the engine link before minting
    const minted = await mintBridgeCode(user.id, member.credits < 0 ? 1_000_000 : member.credits);
    code = minted.code;
    link = `https://whop.plunderandriffle.com/connect/${code}`;
    eligible = true;
    const claim = await getOrCreateBridgeKeyClaim(user.id);
    keyClaimLink = `https://whop.plunderandriffle.com/key-claim/${claim.code}`;
    updateToken = claim.token;
  } catch (e) {
    if (!(e instanceof BridgeError)) throw e;
  }

  const walkthroughOffers = options.walkthrough
    ? selectWalkthroughOffers((await getBridgeState(user.id)).partners)
    : undefined;
  const isNoWebsite = state.noWebsite === true || state.researchStatus === "no-website";
  const base = composeSetupPrompt({
    business: state.brandName ?? state.profile?.name ?? design.name,
    website: state.website ?? null,
    blueprint,
    link,
    savedLinks: await getSavedOfferLinks(user.id).catch(() => []),
    languageLabel: (await getMemberLanguage(user.id).catch(() => null))?.label,
    walkthroughOffers,
    houseAccount: user.email?.toLowerCase() === HOUSE_ACCOUNT_EMAIL,
    offer: state.research?.offer ?? design.description,
    audience: quiz.audience ?? state.research?.audience,
    // No-website members get a goal built from their own quiz
    // answers — the account blueprint may carry another business's
    // objective (e.g. a pre-existing brand record) and must never
    // leak into this member's prompt. Website path unchanged.
    firstResult: starterFirstResult({
      noWebsite: isNoWebsite,
      brandName: state.brandName ?? state.profile?.name ?? design.name,
      quiz,
      blueprintObjective: blueprint.objective,
    }),
    neverDo: quiz.neverDo,
  });
  const websiteHost = (() => { try { return new URL(state.website ?? "").hostname.toLowerCase(); } catch { return ""; } })();
  const guardedBusiness = websiteHost === "plunderandriffle.com" || websiteHost === "whop.plunderandriffle.com";
  const addendum = guardedBusiness && user.email?.toLowerCase() !== HOUSE_ACCOUNT_EMAIL ? "" : composeBuildAgentAddendum({
    design,
    website: state.website ?? null,
    researchText,
    quiz,
    agentId: agent.id,
    connectLink: link,
    bridgeCode: code,
    noWebsite: isNoWebsite,
  });
  const prompt = addendum ? `${base}\n\n${addendum}` : base;

  const next = await saveBuildFlow(user.id, {
    ...state,
    agentId: agent.id,
    agentSlug: agent.slug,
    prompt,
    promptCreatedAt: new Date().toISOString(),
    bridgeEligible: eligible,
  });

  return {
    result: {
      state: next,
      agent: {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        category: agent.category,
        capabilities: design.capabilities,
        description: agent.description,
        publicProfile: agent.publicProfile,
      },
      prompt,
      bridgeCode: code,
      connectLink: link,
      keyClaimLink,
      updateToken,
      bridgeEligible: eligible,
    },
  };
}
