import "server-only";
import { db } from "@/lib/db";
import { JOB_TIERS } from "@/lib/agents";
import { MODEL_TIERS, awardXp } from "@/lib/game";
import { recordUsage } from "@/lib/pr-engine";
import { languageLabel } from "@/lib/languages";
import { getLadder, starimgConfig } from "@/lib/llm-policy";

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
    "You are a Meme Smith agent. From the brief, produce the requested number of meme concepts. For each: a concept title, TOP text (max 60 chars), BOTTOM text (max 60 chars), and a one-line image scene description (no text in the image). Punchy, native, shareable.",
  HOOK:
    "You are a Hook Smith agent. From the brief, produce the requested number of scroll-stopping hooks/headlines, each under 15 words, varied angles, then mark the one you would ship with ★ and say why in one line.",
  QA:
    "You are a QA Editor agent. Review the material in the brief: flag anything weak, confusing, off-brand or legally risky, then return a tightened final version. Be specific; do not rewrite what already works.",
  CAMPAIGN:
    "You are a campaign agent. From the brief, produce a ready-to-run mini campaign pack: 1 announcement post, 2 meme concepts (TOP/BOTTOM text), 2 short social posts, and 3 CTA lines. Ready for the owner to approve and ship.",
};

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
