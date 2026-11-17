import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { JOB_TIERS, tierCost } from "@/lib/agents";

export const runtime = "nodejs";

/**
 * Order a job from one of your hired agents. The job is charged against
 * the agent's allocation at the tier's real weighted cost x pieces, and
 * lands in the queue as QUEUED — the agent's Agent37 slot executes it.
 * The queue never fakes completion.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as { kind?: string; brief?: string; pieces?: number };

    const kind = (body.kind ?? "MEME").toUpperCase();
    if (!(kind in JOB_TIERS)) {
      return NextResponse.json({ error: "Job kind must be SCOUT, MEME, HOOK, QA or CAMPAIGN." }, { status: 400 });
    }
    const brief = body.brief?.trim();
    if (!brief) return NextResponse.json({ error: "Give the agent a brief." }, { status: 400 });
    const pieces = Math.min(10, Math.max(1, Math.floor(Number(body.pieces ?? 1)) || 1));

    const hire = await db.hiredAgent.findFirst({ where: { id, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (hire.status !== "ACTIVE") {
      return NextResponse.json({ error: `Agent is ${hire.status.toLowerCase()} — resume it before ordering.` }, { status: 400 });
    }

    const cost = tierCost(JOB_TIERS[kind]) * pieces;
    const remaining = hire.tokenBudget - hire.tokensUsed;
    if (cost > remaining) {
      return NextResponse.json(
        { error: `Job costs ${cost.toLocaleString()} tokens but only ${remaining.toLocaleString()} remain in this agent's allocation.` },
        { status: 402 },
      );
    }

    const used = hire.tokensUsed + cost;
    const [job] = await db.$transaction([
      db.agentJob.create({
        data: { hireId: hire.id, userId: user.id, kind, brief: brief.slice(0, 2000), pieces, tokenCost: cost },
      }),
      db.hiredAgent.update({
        where: { id: hire.id },
        data: { tokensUsed: used, status: used >= hire.tokenBudget ? "DEPLETED" : "ACTIVE" },
      }),
    ]);
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Job order failed" }, { status: 500 });
  }
}
