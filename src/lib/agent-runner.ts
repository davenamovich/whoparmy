import "server-only";
import { db } from "@/lib/db";
import { JOB_TIERS } from "@/lib/agents";
import { MODEL_TIERS, awardXp } from "@/lib/game";
import { recordUsage } from "@/lib/pr-engine";
import { languageLabel } from "@/lib/languages";
import { getLadder, starimgConfig } from "@/lib/llm-policy";
import { narrativePromptBlock } from "@/lib/narrative-hooks";

/**
 * ─── AGENT RUNNER — executes the job queue for real ─────────────────
 *
 * A hired agent's jobs run here, through Starimg, on the tier the job
 * kind maps to (src/lib/agents.ts JOB_TIERS), with the routing skill's
 * fallback ladder: a tier tries its model, then falls DOWN the ladder
 * (final → sol, luna, deepseek). The live model list is read first and
 * retired ids are skipped.
 *
 * The app reads STARIMG_API_KEY / STARIMG_BASE_URL from its OWN
 * environment (set by the operator at deploy — Railway env). There is
 * deliberately no other key source: the old Z.ai SDK is dead outside
 * its original platform ("Configuration file not found" — verified
 * 2026-11-16), so it is not used as a fallback.
 *
 * Money honesty: the order-time charge is the tier's typical weighted
 * cost. On completion the charge is reconciled to the call's ACTUAL
 * weighted tokens (usage x coefficient). On failure the full charge is
 * refunded to the agent's allocation — failed work is never charged.
 */

const COEF: Record<string, number> = Object.fromEntries(MODEL_TIERS.map((t) => [t.model, t.coefficient]));

const KIND_INSTRUCTIONS: Record<string, string> = {
  SCOUT:
    "You are a Trend Scout agent. From the brief, produce a scouting report: 5 trend angles or hooks the business can use this week, each one line, plus the single strongest pick and why. Concrete and specific — no generic filler.",
  MEME:
    "You are a Meme Smith agent. From the brief, produce the requested number of meme concepts. For each: a concept title, TOP text (max 60 chars), BOTTOM text (max 60 chars), and a one-line image scene description (no text in the image). Punchy, native, shareable. The TOP text is the meme's hook: when the brief allows it, open it as a first-person narrative line in one of the proven frames below.\n\n" +
    narrativePromptBlock(10),
  HOOK:
    "You are a Hook Smith agent. From the brief, produce the requested number of scroll-stopping hooks/headlines, each under 15 words, varied angles, then mark the one you would ship with ★ and say why in one line.\n\n" +
    narrativePromptBlock(16),
  QA:
    "You are a QA Editor agent. Review the material in the brief: flag anything weak, confusing, off-brand or legally risky, then return a tightened final version. Be specific; do not rewrite what already works.",
  CAMPAIGN:
    "You are a campaign agent. From the brief, produce a ready-to-run mini campaign pack: 1 announcement post, 2 meme concepts (TOP/BOTTOM text), 2 short social posts, and 3 CTA lines. Ready for the owner to approve and ship.",
};

/**
 * The Assessor's offer write-up (Dave, 2026-11-18): the free /before
 * pack is the lead magnet; this pass turns it into the $999 AI
 * Assessment offer, following Corey Ganim's playbook — sell the
 * OUTCOME, never the software. One free finding only; the rest stays
 * behind the $999, and the recurring option is pitched at delivery.
 */
const ASSESS_OFFER_INSTRUCTIONS =
  "You are The Assessor agent for Plunder & Riffle's $999 AI Assessments. The business owner has just received a free /before pack made from their own website — a 30–50 second personalized audio monologue plus 5 memes about THEIR business. From the brief, write their assessment offer with exactly these parts:\n" +
  "1) FIT — which ONE of the four $999 assessments fits this business best, and why, in their terms. The four: Time Leak (ranked top-5 time sinks for the owner + up to 2 staff, with the AI fix for each); AI Visibility (whether AI search recommends them or their top 3 competitors — proof included); Lead Response (a 7-day secret shop of their site, chat and forms, with the hard number of unanswered leads and the slowest reply time); AI Tools (a 45-minute interview that ends in 3–7 off-the-shelf AI tools matched to their bottlenecks).\n" +
  "2) ONE FREE FINDING — a single specific, credible pain point for this business that the full assessment would quantify. Frame it as what the assessment will verify and measure, never as an already-measured fact. One finding only — the rest stays behind the $999.\n" +
  "3) THE OFFER — the full assessment at $999 one-time: the ranked report plus fix roadmap, delivered as a report with a live 30-minute walkthrough. The recurring option for their fit (implementation, $300/mo AI-visibility monitoring, or a $1,000+/mo speed-to-lead system) is pitched at delivery, after they have seen the proof — name it as later, do not sell it now.\n" +
  "4) NEXT STEP — book the assessment at ai-assessments.pages.dev, and use the free pack while it is alive: pack links expire in under 7 days.\n" +
  "Rules: sell the outcome, never software or tool names as the product. No earnings promises. No invented numbers, reviews, or facts about their business. Tight, concrete, in the owner's language — no generic filler.";

async function liveModelIds(base: string, key: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = new Set((data.data ?? []).map((m) => m.id).filter((x): x is string => !!x));
    return ids.size > 0 ? ids : null;
  } catch {
    return null; // list unreadable — try the ladder anyway rather than refusing to work
  }
}

interface StarimgResult {
  text: string;
  model: string;
  totalTokens: number | null;
}

async function callStarimg(tierKey: string, system: string, user: string): Promise<StarimgResult> {
  const cfg = starimgConfig();
  if (!cfg) {
    throw new Error(
      "STARIMG_API_KEY is not set in the app environment — the operator sets it at deploy (Railway env) and the runner picks it up. Job refunded.",
    );
  }
  const ladder = await getLadder(tierKey);
  const live = await liveModelIds(cfg.base, cfg.key);
  const candidates = ladder.filter((m) => !live || live.has(m));
  if (candidates.length === 0) {
    throw new Error(`None of the ${tierKey} tier models are live on Starimg right now (${ladder.join(", ")}). Job refunded.`);
  }
  let lastError: unknown;
  for (const model of candidates) {
    try {
      const res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        lastError = new Error(`Starimg ${model} returned HTTP ${res.status}`);
        continue; // a failure on one model does not skip the rest of the tier
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        lastError = new Error(`Starimg ${model} returned an empty reply`);
        continue;
      }
      return { text, model, totalTokens: data.usage?.total_tokens ?? null };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Starimg call failed on every model in the tier");
}

/** Execute one QUEUED job. Safe to call twice — the claim is atomic. */
export async function runAgentJob(jobId: string): Promise<void> {
  const claimed = await db.agentJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: { status: "RUNNING" },
  });
  if (claimed.count === 0) return;

  const job = await db.agentJob.findUnique({ where: { id: jobId }, include: { hire: true } });
  if (!job) return;
  const hire = job.hire;

  // VIDEO jobs (Dave, 2026-11-17) run on the P&R engine's video lane,
  // not the LLM: the brief is either JSON ({format, ...params}) or a
  // plain topic (→ a Ridiculous episode). The video job runs detached
  // and lands its preview in the member's library; the hire's token
  // charge is refunded because video is accounted in VIDEO usage
  // against the plan allowance, not hire tokens.
  if (job.kind === "VIDEO") {
    const refund = db.hiredAgent.update({
      where: { id: hire.id },
      data: { tokensUsed: Math.max(0, hire.tokensUsed - job.tokenCost) },
    });
    try {
      const { startVideoJob, VIDEO_FORMATS } = await import("@/lib/video-jobs");
      let format: string = "RIDICULOUS";
      let params: Record<string, unknown> = { topic: job.brief.slice(0, 400) };
      try {
        const parsed = JSON.parse(job.brief) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && typeof parsed.format === "string") {
          format = parsed.format.toUpperCase();
          params = { ...parsed };
          delete params.format;
        }
      } catch {
        // plain-text brief → Ridiculous topic, as defaulted above
      }
      if (!(VIDEO_FORMATS as readonly string[]).includes(format)) {
        throw new Error(`Unknown video format "${format}" in the job brief.`);
      }
      if (!params.language) params.language = languageLabel(job.language);
      const vjob = await startVideoJob(job.userId, format as never, params);
      await db.$transaction([
        db.agentJob.update({
          where: { id: job.id },
          data: {
            status: "DONE",
            tokenCost: 0,
            result: JSON.stringify({
              videoJobId: vjob.id,
              format,
              note: "Video preview generating in the background — it lands in the library when the engine finishes.",
            }),
          },
        }),
        refund,
      ]);
    } catch (err) {
      await db.$transaction([
        db.agentJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            result: JSON.stringify({
              error: err instanceof Error ? err.message.slice(0, 500) : "Video job failed",
              provider: "pr-engine",
            }),
          },
        }),
        refund,
      ]).catch(() => {});
    }
    return;
  }

  // ASSESS jobs (Dave, 2026-11-18) run on the engine's /before lane,
  // not the plain LLM: the brief is the member's business (a URL, a
  // link, or a sentence — or JSON {input, product, assessmentFit}).
  // The runner submits create_before_pitch on the bridge key (1 credit,
  // accounted as 1 unit on the plan meter at order time), polls the
  // demo_pack job to its pack page, then makes one LLM pass that turns
  // the pack into the $999 assessment offer. The hire's token charge is
  // refunded like VIDEO — the pack is meter usage, not hire tokens.
  if (job.kind === "ASSESS") {
    const refund = db.hiredAgent.update({
      where: { id: hire.id },
      data: { tokensUsed: Math.max(0, hire.tokensUsed - job.tokenCost) },
    });
    try {
      const { submitBeforePack, getEngineJobStatus } = await import("@/lib/engine");
      let input = job.brief.trim();
      let product: string | undefined;
      let assessmentFit: string | undefined;
      try {
        const parsed = JSON.parse(job.brief) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.input === "string" && parsed.input.trim()) input = parsed.input.trim();
          else if (typeof parsed.businessUrl === "string" && parsed.businessUrl.trim()) input = parsed.businessUrl.trim();
          else if (typeof parsed.url === "string" && parsed.url.trim()) input = parsed.url.trim();
          if (typeof parsed.product === "string" && parsed.product.trim()) product = parsed.product.trim().slice(0, 300);
          if (typeof parsed.assessmentFit === "string" && parsed.assessmentFit.trim()) assessmentFit = parsed.assessmentFit.trim().slice(0, 40);
          else if (typeof parsed.fit === "string" && parsed.fit.trim()) assessmentFit = parsed.fit.trim().slice(0, 40);
        }
      } catch {
        // plain-text brief → the business input itself, as defaulted above
      }
      const { jobId: engineJobId } = await submitBeforePack({
        input: input.slice(0, 1500),
        ...(product ? { product } : {}),
      });
      // demo_pack generation measured ~2 minutes in the Engine Trial;
      // poll every 15s for up to 10 minutes before calling it slow.
      let pageUrl: string | null = null;
      let engineError: string | null = null;
      for (let i = 0; i < 40 && !pageUrl; i++) {
        await new Promise((r) => setTimeout(r, 15_000));
        const st = await getEngineJobStatus("demo_pack", engineJobId);
        if (st.pageUrl) pageUrl = st.pageUrl;
        else if (st.terminal) {
          engineError = st.error ?? `Engine pack ended in phase "${st.phase ?? "unknown"}" without a page.`;
          break;
        }
      }
      if (!pageUrl) {
        // create_before_pitch's job_id is a rebuild from the same input,
        // so re-ordering the same brief picks the same pack back up.
        throw new Error(
          engineError ??
            `Your /before pack is still generating on the engine (job ${engineJobId}). Order the same brief again in a few minutes and it will pick up the same pack. Nothing was charged.`,
        );
      }
      const system =
        ASSESS_OFFER_INSTRUCTIONS +
        `\n\nOUTPUT LANGUAGE: Write ALL of your output in ${languageLabel(job.language)} (${job.language}), regardless of the language the brief is written in.`;
      const user =
        `Agent: ${hire.name} (${hire.templateKey})\nBusiness: ${input}\n` +
        (product ? `Product/service to feature: ${product}\n` : "") +
        (assessmentFit ? `The owner already leans toward: ${assessmentFit} — confirm or correct the fit, do not just agree.\n` : "") +
        `Their free /before pack (live now): ${pageUrl}`;
      const offer = await callStarimg(JOB_TIERS.ASSESS, system, user);
      const text =
        `Your free /before pack: ${pageUrl}\n(30–50s monologue + 5 memes about your business — the link expires in under 7 days, use it while it's alive.)\n\n${offer.text}`;
      await db.$transaction([
        db.agentJob.update({
          where: { id: job.id },
          data: {
            status: "DONE",
            tokenCost: 0,
            result: JSON.stringify({
              text: text.slice(0, 20_000),
              packLink: pageUrl,
              engineJobId,
              model: offer.model,
              provider: "pr-engine+starimg",
            }),
          },
        }),
        refund,
      ]);
      await awardXp(job.userId, "PACK_GENERATED", `agent:${hire.name}`.slice(0, 80)).catch(() => {});
      await recordUsage(job.userId, "TEXT", 1, "agent-job");
    } catch (err) {
      await db.$transaction([
        db.agentJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            result: JSON.stringify({
              error: err instanceof Error ? err.message.slice(0, 500) : "Assessment job failed",
              provider: "pr-engine",
            }),
          },
        }),
        refund,
      ]).catch(() => {});
    }
    return;
  }

  const tierKey = JOB_TIERS[job.kind] ?? "mid";

  try {
    // Dave's language rule: any language in, selected language out. The
    // instruction scaffold stays English; the output is pinned to the
    // job's selected language no matter what language the brief used.
    const system =
      (KIND_INSTRUCTIONS[job.kind] ?? KIND_INSTRUCTIONS.MEME) +
      `\n\nOUTPUT LANGUAGE: Write ALL of your output in ${languageLabel(job.language)} (${job.language}), regardless of the language the brief is written in. The brief may arrive in any language; your output language is always the selected one, never the brief's.`;
    const user = `Agent: ${hire.name} (${hire.templateKey})\nPieces requested: ${job.pieces}\nBrief: ${job.brief}`;
    const result = await callStarimg(tierKey, system, user);

    // Reconcile the order-time estimate to the actual weighted cost.
    let actualCost = job.tokenCost;
    if (result.totalTokens != null && COEF[result.model] != null) {
      actualCost = Math.max(1, Math.ceil(result.totalTokens * COEF[result.model]));
    }
    const delta = actualCost - job.tokenCost;
    const newUsed = Math.max(0, hire.tokensUsed + delta);

    await db.$transaction([
      db.agentJob.update({
        where: { id: job.id },
        data: {
          status: "DONE",
          tokenCost: actualCost,
          result: JSON.stringify({
            text: result.text.slice(0, 20_000),
            model: result.model,
            tier: tierKey,
            totalTokens: result.totalTokens,
            provider: "starimg",
          }),
        },
      }),
      db.hiredAgent.update({
        where: { id: hire.id },
        data: {
          tokensUsed: newUsed,
          status: hire.status === "PAUSED" ? "PAUSED" : newUsed >= hire.tokenBudget ? "DEPLETED" : "ACTIVE",
        },
      }),
    ]);

    // Real finished work earns XP, same as a hand-run pack — and meme
    // output counts on the plan's monthly meme meter (the house lane
    // the member sees), one usage item per piece.
    if (job.kind === "MEME" || job.kind === "CAMPAIGN") {
      await awardXp(job.userId, "PACK_GENERATED", `agent:${hire.name}`.slice(0, 80)).catch(() => {});
      await recordUsage(job.userId, "TEXT", job.pieces, "agent-job");
    }
  } catch (err) {
    // Failed work is never charged: refund the full order-time charge.
    const refundedUsed = Math.max(0, hire.tokensUsed - job.tokenCost);
    await db.$transaction([
      db.agentJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          result: JSON.stringify({
            error: err instanceof Error ? err.message.slice(0, 500) : "Runner failed",
            provider: "starimg",
          }),
        },
      }),
      db.hiredAgent.update({
        where: { id: hire.id },
        data: {
          tokensUsed: refundedUsed,
          status: hire.status === "PAUSED" ? "PAUSED" : refundedUsed >= hire.tokenBudget ? "DEPLETED" : "ACTIVE",
        },
      }),
    ]).catch(() => {});
  }
}

/** Drain up to `limit` of one user's queued jobs (runner endpoint). */
export async function runQueuedJobsForUser(userId: string, limit = 5): Promise<number> {
  const queued = await db.agentJob.findMany({
    where: { userId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const j of queued) {
    await runAgentJob(j.id);
  }
  return queued.length;
}
