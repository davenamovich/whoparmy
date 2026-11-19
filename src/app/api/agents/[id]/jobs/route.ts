import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { JOB_TIERS, tierCost } from "@/lib/agents";
import { runAgentJob } from "@/lib/agent-runner";
import { getPlan } from "@/lib/plans";
import { countMonthlyUsage, getFreeGenBalance } from "@/lib/usage-server";
import { isGrantExpired } from "@/lib/bot-grants";
import { isSupportedLanguage } from "@/lib/languages";

export const runtime = "nodejs";

/**
 * Order a job from one of your hired agents. The job is charged against
 * the agent's allocation at the tier's typical weighted cost x pieces,
 * then the runner executes it through Starimg right after the response
 * (src/lib/agent-runner.ts) — the charge is reconciled to the call's
 * actual weighted tokens, and refunded in full if the run fails.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as { kind?: string; brief?: string; pieces?: number; language?: string };

    const kind = (body.kind ?? "MEME").toUpperCase();
    if (!(kind in JOB_TIERS)) {
      return NextResponse.json({ error: "Job kind must be SCOUT, MEME, HOOK, QA, CAMPAIGN, VIDEO, ASSESS or CUSTOM." }, { status: 400 });
    }
    // A CUSTOM job runs on the hire's own instructions — an agent
    // without any has nothing to run on.
    if (kind === "CUSTOM") {
      const hirePeek = await db.hiredAgent.findFirst({ where: { id, userId: user.id }, select: { instructions: true } });
      if (!hirePeek?.instructions?.trim()) {
        return NextResponse.json(
          { error: "This agent has no standing instructions to run a custom job on — add them in its Settings tab first." },
          { status: 400 },
        );
      }
    }
    const brief = body.brief?.trim();
    if (!brief) return NextResponse.json({ error: "Give the agent a brief." }, { status: 400 });
    const pieces = Math.min(10, Math.max(1, Math.floor(Number(body.pieces ?? 1)) || 1));
    // Any language in, selected language out: the brief may be written in
    // anything; the job's output language is the member's selection.
    const language = isSupportedLanguage(body.language ?? "") ? (body.language as string) : "en";

    const hire = await db.hiredAgent.findFirst({ where: { id, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    // A referral bot whose 24 hours are up stops taking work.
    if (isGrantExpired(hire)) {
      await db.hiredAgent.update({ where: { id: hire.id }, data: { status: "PAUSED" } });
      return NextResponse.json(
        { error: "Your 24-hour referral bot has expired — refer another member and have them save their links to earn it again, or rent a bot on your plan." },
        { status: 400 },
      );
    }
    if (hire.status !== "ACTIVE") {
      return NextResponse.json({ error: `Agent is ${hire.status.toLowerCase()} — resume it before ordering.` }, { status: 400 });
    }

    // Meme output draws on the plan's monthly meme meter (house lane).
    // VIDEO draws on the same meter (1–3 units by format steps).
    // ASSESS is NOT metered: it's a bridge handoff — the member's own
    // Muse makes the pack on the member's own credits (v2).
    if (kind === "MEME" || kind === "CAMPAIGN" || kind === "VIDEO") {
      const plan = getPlan(user.plan);
      const usedMemes = await countMonthlyUsage(user.id);
      let requested = pieces;
      if (kind === "VIDEO") {
        requested = 1;
        try {
          const parsed = JSON.parse(brief) as { format?: string };
          if (typeof parsed?.format === "string" && parsed.format.toUpperCase() === "FUNNEL") requested = 3;
        } catch {
          // plain-topic brief → a single 1-credit sitdown job
        }
      }
      // The free-generation pool stacks on the plan meter — it's what
      // fuels a referral bot's work once the plan allowance is spent
      // (successful runs draw it down via recordUsage → applyFreeGens).
      const freeGens = await getFreeGenBalance(user.id);
      const memeLimit = plan.monthlyItems + freeGens;
      if (usedMemes + requested > memeLimit) {
        return NextResponse.json(
          { error: `You're out of memes on the ${plan.name} plan this month (${memeLimit} including free generations). Upgrade — or connect your own key (BYOK) and the meter lifts.` },
          { status: 402 },
        );
      }
    }

    const cost = kind === "VIDEO" || kind === "ASSESS" ? 0 : tierCost(JOB_TIERS[kind]) * pieces;
    const remaining = hire.tokenBudget - hire.tokensUsed;
    if (cost > remaining) {
      return NextResponse.json(
        { error: "This bot has used up its fuel for the month. Upgrade your plan — or connect your own key (BYOK) and the caps lift." },
        { status: 402 },
      );
    }

    const used = hire.tokensUsed + cost;
    const [job] = await db.$transaction([
      db.agentJob.create({
        data: { hireId: hire.id, userId: user.id, kind, brief: brief.slice(0, 2000), language, pieces, tokenCost: cost },
      }),
      db.hiredAgent.update({
        where: { id: hire.id },
        data: { tokensUsed: used, status: used >= hire.tokenBudget ? "DEPLETED" : "ACTIVE" },
      }),
    ]);
    // Execute after the response is sent — the job flips QUEUED →
    // RUNNING → DONE/FAILED in the queue the member watches.
    after(async () => {
      await runAgentJob(job.id).catch(() => {});
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Job order failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
