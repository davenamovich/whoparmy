import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { tierCost } from "@/lib/agents";
import { isGrantExpired } from "@/lib/bot-grants";
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
    if (!hire) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    // Same referral-grant expiry gate ordinary job ordering applies.
    if (isGrantExpired(hire)) {
      await db.hiredAgent.update({ where: { id: hire.id }, data: { status: "PAUSED" } });
      return NextResponse.json(
        { error: "Your 24-hour referral bot has expired — refer another member and have them save their links to earn it again, or rent a bot on your plan." },
        { status: 400 },
      );
    }
    if (hire.status !== "ACTIVE") {
      return NextResponse.json({ error: `Agent is ${hire.status.toLowerCase()} — resume it first.` }, { status: 400 });
    }
    const cost = tierCost("mid");
    if (cost > hire.tokenBudget - hire.tokensUsed) {
      return NextResponse.json({ error: "This bot is out of fuel for the month and can't take the campaign on." }, { status: 402 });
    }

    // Claim atomically: the listing flips OPEN → ASSIGNED by
    // conditional update inside the same transaction that creates
    // the job and reserves the fuel by delta against a fresh hire
    // read. Two claimants can no longer both win, and the listing
    // records the job it created (settlement keys off it).
    const claimed = await db.$transaction(async (tx) => {
      const flip = await tx.campaignListing.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "ASSIGNED", assigneeId: hire.id },
      });
      if (flip.count !== 1) return null;
      const fresh = await tx.hiredAgent.findUnique({
        where: { id: hire.id },
        select: { tokensUsed: true, tokenBudget: true },
      });
      if (!fresh || cost > fresh.tokenBudget - fresh.tokensUsed) {
        throw new Error("This bot is out of fuel for the month and can't take the campaign on.");
      }
      const job = await tx.agentJob.create({
        data: {
          hireId: hire.id,
          userId: user.id,
          kind: "CAMPAIGN",
          brief: `${listing.title} — ${listing.description}`.slice(0, 2000),
          pieces: 1,
          tokenCost: cost,
        },
      });
      await tx.campaignListing.update({ where: { id }, data: { jobId: job.id } });
      await tx.hiredAgent.update({ where: { id: hire.id }, data: { tokensUsed: { increment: cost } } });
      const updated = await tx.campaignListing.findUnique({ where: { id } });
      return { updated, job };
    });
    if (!claimed) {
      return NextResponse.json({ error: "This campaign is no longer open." }, { status: 404 });
    }
    const { updated, job } = claimed;
    // The claiming agent starts work right after the response.
    after(async () => {
      await runAgentJob(job.id).catch(() => {});
    });
    return NextResponse.json({ listing: updated, job }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Claim failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
