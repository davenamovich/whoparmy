import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUserWithMode } from "@/lib/auth";
import { JOB_TIERS } from "@/lib/agents";
import {
  fetchStarimgCatalog,
  getEffectiveTiers,
  probeBifrost,
  starimgConfig,
  tierKeys,
} from "@/lib/llm-policy";

export const runtime = "nodejs";

/**
 * ─── LLM CONTROL CONSOLE — operator only ────────────────────────────
 *
 * One surface for the whole LLM layer: provider status (Starimg live
 * catalog, Bifrost gateway probe), the tier routing policy (editable;
 * the agent runner reads overrides on the next job), and real usage
 * from the job ledger — weighted tokens and dollar cost at the
 * operator's actual Starimg rates. Members never see this route:
 * non-operator sessions get a 403.
 */

// Dave's Starimg rates (2026-11-17): $28 / 250M tokens, $100 / 2B.
const USD_PER_TOKEN_BULK = 100 / 2_000_000_000;
const USD_PER_TOKEN_PACK = 28 / 250_000_000;

async function requireOperator() {
  const { user, mode, viaFallback } = await getWhopUserWithMode();
  if (mode !== "operator") throw new Error("OPERATOR_ONLY");
  // Admin means a designated operator, full stop (Dave, 2026-11-17:
  // "llm control should not show to anyone except admin"). The
  // anonymous fallback session never unlocks this console — in any
  // environment — unless ALLOW_OPERATOR_FALLBACK=1 is set explicitly
  // (local dev). This matches the session route's admin flag exactly.
  if (viaFallback && process.env.ALLOW_OPERATOR_FALLBACK !== "1") {
    throw new Error("OPERATOR_ONLY");
  }
  return user;
}

function parseJobResult(result: string | null): { tier?: string; model?: string } {
  if (!result) return {};
  try {
    const parsed = JSON.parse(result) as { tier?: string; model?: string };
    return { tier: parsed.tier, model: parsed.model };
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    await requireOperator();
    const cfg = starimgConfig();
    const [catalog, bifrost, tiers, jobs, factoryThisMonth] = await Promise.all([
      fetchStarimgCatalog(),
      probeBifrost(),
      getEffectiveTiers(),
      db.agentJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: { kind: true, status: true, tokenCost: true, result: true },
      }),
      (async () => {
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);
        const agg = await db.usageRecord.aggregate({
          where: { createdAt: { gte: start } },
          _sum: { count: true },
        });
        return agg._sum.count ?? 0;
      })(),
    ]);

    const done = jobs.filter((j) => j.status === "DONE");
    const failed = jobs.filter((j) => j.status === "FAILED");
    const weightedTotal = done.reduce((n, j) => n + j.tokenCost, 0);

    const byTier = new Map<string, { tier: string; jobs: number; weightedTokens: number }>();
    const byModel = new Map<string, { model: string; jobs: number; weightedTokens: number }>();
    for (const j of done) {
      const meta = parseJobResult(j.result);
      const tier = meta.tier ?? JOB_TIERS[j.kind] ?? "mid";
      const model = meta.model ?? "unrecorded";
      const t = byTier.get(tier) ?? { tier, jobs: 0, weightedTokens: 0 };
      t.jobs += 1;
      t.weightedTokens += j.tokenCost;
      byTier.set(tier, t);
      const m = byModel.get(model) ?? { model, jobs: 0, weightedTokens: 0 };
      m.jobs += 1;
      m.weightedTokens += j.tokenCost;
      byModel.set(model, m);
    }

    return NextResponse.json({
      console: {
        providers: {
          starimg: {
            keySet: !!cfg,
            baseUrl: cfg?.base ?? null,
            catalogOk: catalog.ok,
            catalogCount: catalog.models.length,
            catalog: catalog.models,
            catalogError: catalog.error ?? null,
          },
          bifrost,
        },
        tiers,
        usage: {
          jobsTotal: jobs.length,
          jobsDone: done.length,
          jobsFailed: failed.length,
          weightedTokensTotal: weightedTotal,
          estCostUsdBulk: weightedTotal * USD_PER_TOKEN_BULK,
          estCostUsdPack: weightedTotal * USD_PER_TOKEN_PACK,
          byTier: [...byTier.values()].sort((a, b) => b.weightedTokens - a.weightedTokens),
          byModel: [...byModel.values()].sort((a, b) => b.weightedTokens - a.weightedTokens),
          factoryItemsThisMonth: factoryThisMonth,
        },
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "OPERATOR_ONLY") {
      return NextResponse.json({ error: "The LLM console is operator-only." }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load LLM console" }, { status: 500 });
  }
}

/** Set a tier's primary model override. Takes effect on the next job. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireOperator();
    const body = (await req.json()) as { tier?: string; model?: string };
    const tier = body.tier?.trim() ?? "";
    const model = body.model?.trim() ?? "";
    if (!tierKeys().includes(tier)) {
      return NextResponse.json({ error: `Unknown tier "${tier}".` }, { status: 400 });
    }
    if (!model || model.length > 120) {
      return NextResponse.json({ error: "Pick a model from the live catalog." }, { status: 400 });
    }
    const catalog = await fetchStarimgCatalog();
    if (catalog.ok && !catalog.models.includes(model)) {
      return NextResponse.json({ error: `"${model}" is not in the live Starimg catalog right now.` }, { status: 400 });
    }
    await db.routingPolicy.upsert({
      where: { tier },
      create: { tier, model, updatedBy: user.id },
      update: { model, updatedBy: user.id },
    });
    return NextResponse.json({ tiers: await getEffectiveTiers() });
  } catch (err) {
    if (err instanceof Error && err.message === "OPERATOR_ONLY") {
      return NextResponse.json({ error: "The LLM console is operator-only." }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Policy update failed" }, { status: 500 });
  }
}

/** Reset a tier to its code default (deletes the override). */
export async function POST(req: NextRequest) {
  try {
    await requireOperator();
    const body = (await req.json()) as { action?: string; tier?: string };
    if (body.action !== "reset" || !body.tier || !tierKeys().includes(body.tier)) {
      return NextResponse.json({ error: "Unknown console action." }, { status: 400 });
    }
    await db.routingPolicy.deleteMany({ where: { tier: body.tier } });
    return NextResponse.json({ tiers: await getEffectiveTiers() });
  } catch (err) {
    if (err instanceof Error && err.message === "OPERATOR_ONLY") {
      return NextResponse.json({ error: "The LLM console is operator-only." }, { status: 403 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Policy reset failed" }, { status: 500 });
  }
}
