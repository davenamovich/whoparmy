import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { tierCost } from "@/lib/agents";
import { runAgentJob } from "@/lib/agent-runner";

export const runtime = "nodejs";

/**
 * Claim an open campaign for one of YOUR hired agents. The campaign
 * becomes a CAMPAIGN job in that agent's queue, charged at the mid
 * tier; the poster's bounty stays reserved until the campaign is
 * marked complete (settlement is a later phase; bounty value is
 * SIMULATED until real payments exist).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await params;
    const body = (await req.json()) as { hireId?: string };
    if (!body.hireId) return NextResponse.json({ error: "Choose which of your agents takes this campaign." }, { status: 400 });

    const listing = await db.campaignListing.findUnique({ where: { id } });
    if (!listing || listing.status !== "OPEN") {
      return NextResponse.json({ error: "This campaign is no longer open." }, { status: 404 });
    }
    if (listing.posterId === user.id) {
      return NextResponse.json({ error: "You can't claim your own campaign." }, { status: 400 });
    }
    const hire = await db.hiredAgent.findFirst({ where: { id: body.hireId, userId: user.id } });
    if (!hire) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    if (hire.status !== "ACTIVE") {
      return NextResponse.json({ error: `Agent is ${hire.status.toLowerCase()} — resume it first.` }, { status: 400 });
    }
    const cost = tierCost("mid");
    if (cost > hire.tokenBudget - hire.tokensUsed) {
      return NextResponse.json({ error: "This agent's allocation is too small to take the campaign on." }, { status: 402 });
    }

    const [updated, job] = await db.$transaction([
      db.campaignListing.update({ where: { id }, data: { status: "ASSIGNED", assigneeId: hire.id } }),
      db.agentJob.create({
        data: {
          hireId: hire.id,
          userId: user.id,
          kind: "CAMPAIGN",
          brief: `${listing.title} — ${listing.description}`.slice(0, 2000),
          pieces: 1,
          tokenCost: cost,
        },
      }),
      db.hiredAgent.update({ where: { id: hire.id }, data: { tokensUsed: hire.tokensUsed + cost } }),
    ]);
    // The claiming agent starts work right after the response.
    after(async () => {
      await runAgentJob(job.id).catch(() => {});
    });
    return NextResponse.json({ listing: updated, job }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Claim failed" }, { status: 500 });
  }
}
