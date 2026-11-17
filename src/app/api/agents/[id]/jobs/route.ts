import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { JOB_TIERS, tierCost } from "@/lib/agents";
import { runAgentJob } from "@/lib/agent-runner";
import { getPlan } from "@/lib/plans";
import { countMonthlyUsage } from "@/lib/usage-server";
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
      return NextResponse.json({ error: "Job kind must be SCOUT, MEME, HOOK, QA or CAMPAIGN." }, { status: 400 });
    }
    const brief = body.brief?.trim();
    if (!brief) return NextResponse.json({ error: "Give the agent a brief." }, { status: 400 });
    const pieces = Math.min(10, Math.max(1, Math.floor(Number(body.pieces ?? 1)) || 1));
    // Any language in, selected language out: the brief may be written in
    // anything; the job's output language is the member's selection.
    const language = isSupportedLanguage(body.language ?? "") ? (body.language as string) : "en";

    const hire = await db.hiredAgent.findFirst({ where: { id, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (hire.status !== "ACTIVE") {
      return NextResponse.json({ error: `Agent is ${hire.status.toLowerCase()} — resume it before ordering.` }, { status: 400 });
    }

    // Meme output draws on the plan's monthly meme meter (house lane).
    if (kind === "MEME" || kind === "CAMPAIGN") {
      const plan = getPlan(user.plan);
      const usedMemes = await countMonthlyUsage(user.id);
      if (usedMemes + pieces > plan.monthlyItems) {
        return NextResponse.json(
          { error: `You're out of memes on the ${plan.name} plan this month (${plan.monthlyItems}/mo). Upgrade — or connect your own key (BYOK) and the meter lifts.` },
          { status: 402 },
        );
      }
    }

    const cost = tierCost(JOB_TIERS[kind]) * pieces;
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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Job order failed" }, { status: 500 });
  }
}
