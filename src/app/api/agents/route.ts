import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { AGENT_CATALOG, LEGACY_TEMPLATES, getWalletState, internalBotBudget, templateByKey } from "@/lib/agents";
import { toolsFromJson, toolsToJson } from "@/lib/agent-architect-core";
import { getPlan } from "@/lib/plans";
import { countMonthlyUsage } from "@/lib/usage-server";
import { awardXp } from "@/lib/game";
import { recordConversion } from "@/lib/referrals";
import { expireReferralBots } from "@/lib/bot-grants";
import { getTrafficPoolsForUser } from "@/lib/traffic-pool";

export const runtime = "nodejs";

/** Agent economy state: plan + meme meter, bot catalog, your bots, your job queue.
 *  Tokens are an internal ops ledger — members see bots and memes only. */
export async function GET() {
  try {
    const user = await getWhopUser();
    const plan = getPlan(user.plan);
    // Park referral bots whose 24h window closed before reading state.
    await expireReferralBots(user.id);
    const [wallet, hires, jobs, memesUsed, trafficPools, brand] = await Promise.all([
      getWalletState(user.id, user.plan),
      db.hiredAgent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.agentJob.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      countMonthlyUsage(user.id),
      // Traffic pool (2026-11-19): each agent's daily 10-slot pool
      // state for the control center cards. Best-effort — a pool read
      // failure must not take the whole agents state down with it.
      getTrafficPoolsForUser(user.id).catch(() => ({})),
      db.brandProfile.findFirst({
        where: { userId: user.id, researchJson: { not: null } },
        orderBy: { updatedAt: "desc" },
      }).catch(() => null),
    ]);
    // The control center's Research tab (Factory Slice B): the latest
    // business research every agent works from, parsed defensively.
    let research: Record<string, unknown> | null = null;
    if (brand?.researchJson) {
      try {
        const r = JSON.parse(brand.researchJson) as Record<string, unknown>;
        research = { brandName: brand.name, website: brand.website, ...r };
      } catch {
        research = null;
      }
    }
    return NextResponse.json({
      wallet,
      plan: {
        key: plan.key,
        name: plan.name,
        price: plan.price,
        // Engine-meter model (2026-11-19): no seat count exists.
        // Agents are unlimited; the plan meters generations.
        botsRented: hires.filter((h) => h.source !== "REFERRAL").length,
        memesUsed,
        memesLimit: plan.monthlyItems,
      },
      catalog: AGENT_CATALOG,
      // Retired rental bench (2026-11-19): display-only, so existing
      // hires grandfathered from the old catalog still resolve their
      // name/role/default job kind in the UI. Never hireable.
      legacy: LEGACY_TEMPLATES,
      hires,
      jobs,
      research,
      trafficPools,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load agents" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}

/** Rent a bot: fills one of the plan's bot seats. The bot's fuel budget
 *  is allocated internally — members never handle tokens. */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as {
      templateKey?: string;
      name?: string;
      role?: string;
      instructions?: string;
      toolsJson?: string;
    };
    const template = body.templateKey ? templateByKey(body.templateKey) : undefined;
    if (!template) {
      return NextResponse.json({ error: "Pick an agent from the catalog." }, { status: 400 });
    }
    // Real agents seeded by a stack (Dave, 2026-11-19) are never
    // hired directly — they join through their stack launch, gated
    // on the member saving the offer link (Barry: DH Media).
    if (template.viaStack) {
      return NextResponse.json(
        { error: `${template.name} joins through its stack, not a direct hire — save your offer link and launch the stack from the operator panel.` },
        { status: 400 },
      );
    }
    // SMB Agent Factory (2026-11-18): a "custom" rental carries the
    // architect's config — role, standing instructions and the tool
    // selection. Tools are re-validated against the registry here, so
    // a client can never install a capability that doesn't exist.
    // Templates with preset instructions (FAQ) carry their own.
    const isCustom = template.key === "custom";
    const customTools = isCustom ? toolsFromJson(body.toolsJson) : [];
    if (isCustom && customTools.length === 0) {
      return NextResponse.json(
        { error: "A custom agent needs at least one tool — run the architect first so it can pick them." },
        { status: 400 },
      );
    }
    const hireConfig = {
      role: isCustom ? (body.role?.trim().slice(0, 300) || template.role) : template.role,
      instructions: isCustom
        ? body.instructions?.trim().slice(0, 4000) || null
        : (template.instructions ?? null),
      toolsJson: isCustom ? toolsToJson(customTools) : null,
    };
    // No seat gate (engine-meter model, 2026-11-19): hiring is
    // unlimited on every plan. What the plan meters is monthly
    // generations, enforced when agents actually run jobs.
    const hire = await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: template.key,
        name: body.name?.trim().slice(0, 60) || template.name,
        tokenBudget: internalBotBudget(user.plan),
        role: hireConfig.role,
        instructions: hireConfig.instructions,
        toolsJson: hireConfig.toolsJson,
      },
    });
    // Gamification + referral program: renting earns XP; a FIRST rental
    // converts the member — their referrer earns 30% (see referrals.ts).
    void awardXp(user.id, "BOT_RENTED", template.key).catch(() => {});
    const totalHires = await db.hiredAgent.count({ where: { userId: user.id } });
    if (totalHires === 1) {
      void recordConversion(user.id).catch(() => {});
    }
    return NextResponse.json({ hire }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rental failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
