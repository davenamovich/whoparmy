import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { AGENT_CATALOG, getWalletState, templateByKey } from "@/lib/agents";

export const runtime = "nodejs";

/** Agent economy state: wallet, marketplace catalog, your agents, your job queue. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const [wallet, hires, jobs] = await Promise.all([
      getWalletState(user.id, user.plan),
      db.hiredAgent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.agentJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return NextResponse.json({ wallet, catalog: AGENT_CATALOG, hires, jobs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load agents" }, { status: 500 });
  }
}

/** Hire an agent: reserve `tokenBudget` weighted tokens from the plan wallet. */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { templateKey?: string; name?: string; tokenBudget?: number };
    const template = body.templateKey ? templateByKey(body.templateKey) : undefined;
    if (!template) {
      return NextResponse.json({ error: "Pick an agent from the marketplace catalog." }, { status: 400 });
    }
    const budget = Math.floor(Number(body.tokenBudget ?? 0));
    if (!Number.isFinite(budget) || budget < template.minBudget) {
      return NextResponse.json(
        { error: `${template.name} needs at least ${template.minBudget.toLocaleString()} tokens allocated.` },
        { status: 400 },
      );
    }
    const wallet = await getWalletState(user.id, user.plan);
    if (budget > wallet.available) {
      return NextResponse.json(
        { error: `Not enough unallocated tokens — ${wallet.available.toLocaleString()} available in your ${user.plan} wallet.` },
        { status: 402 },
      );
    }
    const hire = await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: template.key,
        name: body.name?.trim().slice(0, 60) || template.name,
        tokenBudget: budget,
      },
    });
    return NextResponse.json({ hire }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hire failed" }, { status: 500 });
  }
}
