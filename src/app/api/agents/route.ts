import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { AGENT_CATALOG, getWalletState, internalBotBudget, templateByKey } from "@/lib/agents";
import { getPlan } from "@/lib/plans";
import { countMonthlyUsage } from "@/lib/usage-server";

export const runtime = "nodejs";

/** Agent economy state: plan + meme meter, bot catalog, your bots, your job queue.
 *  Tokens are an internal ops ledger — members see bots and memes only. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const plan = getPlan(user.plan);
    const [wallet, hires, jobs, memesUsed] = await Promise.all([
      getWalletState(user.id, user.plan),
      db.hiredAgent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.agentJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      countMonthlyUsage(user.id),
    ]);
    return NextResponse.json({
      wallet,
      plan: {
        key: plan.key,
        name: plan.name,
        price: plan.price,
        botSeats: plan.botSeats,
        botsRented: hires.length,
        memesUsed,
        memesLimit: plan.monthlyItems,
      },
      catalog: AGENT_CATALOG,
      hires,
      jobs,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load agents" }, { status: 500 });
  }
}

/** Rent a bot: fills one of the plan's bot seats. The bot's fuel budget
 *  is allocated internally — members never handle tokens. */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { templateKey?: string; name?: string };
    const template = body.templateKey ? templateByKey(body.templateKey) : undefined;
    if (!template) {
      return NextResponse.json({ error: "Pick a bot from the rental catalog." }, { status: 400 });
    }
    const plan = getPlan(user.plan);
    const rented = await db.hiredAgent.count({ where: { userId: user.id } });
    if (rented >= plan.botSeats) {
      return NextResponse.json(
        {
          error:
            plan.botSeats === 1
              ? `Your ${plan.name} plan includes 1 bot and it's already rented. Upgrade for more bots — or connect your own key (BYOK) to run uncapped.`
              : `All ${plan.botSeats} bot seats on your ${plan.name} plan are rented. Upgrade for more bots.`,
        },
        { status: 402 },
      );
    }
    const hire = await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: template.key,
        name: body.name?.trim().slice(0, 60) || template.name,
        tokenBudget: internalBotBudget(user.plan),
      },
    });
    return NextResponse.json({ hire }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rental failed" }, { status: 500 });
  }
}
