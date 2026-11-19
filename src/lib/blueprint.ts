import "server-only";
import { db } from "@/lib/db";
import { AGENT_CATALOG, internalBotBudget } from "@/lib/agents";
import { FACTORY_TOOLS, sanitizeToolIds, toolsToJson } from "@/lib/agent-architect-core";
import { getPlan } from "@/lib/plans";
import { starimgConfig, getLadder } from "@/lib/llm-policy";
import { countMonthlyUsage } from "@/lib/usage-server";

/**
 * ─── THE BLUEPRINT + MY AI SYSTEM (Dave, 2026-11-19) ─────────────
 * "Instead of making Muse a prompt generator, make it the P&R
 * onboarding architect." Slice 1: a persistent Blueprint per member
 * — objective, top opportunities, a workforce drawn ONLY from the
 * real agent catalog, workflows, an integrations checklist with
 * honest live state, a budget line from real prices, and approval
 * rules — drafted by Ralph from research (the member's website,
 * deep research, brand profile and memory answer the discovery
 * questions first; nobody fills in a 20-question form), approved
 * by the member, and approval hires the workforce through the
 * same HiredAgent machinery the catalog uses.
 *
 * Autonomy: Level 1 (Copilot) is the only mode. The blueprint
 * records per-agent approval rules so future levels can light up
 * only when Dave names them. Nothing here publishes, sends, or
 * spends.
 *
 * Storage: AppSetting under `blueprint:<userId>` (the quiz
 * precedent — no schema change in Slice 1).
 */

export interface BlueprintAgent {
  templateKey: string;
  name: string;
  role: string;
  mission: string;
  schedule: string;
  approval: string;
  metric: string;
  /** custom-template only: validated Factory tool ids. */
  tools?: string[];
  instructions?: string;
}

export interface BlueprintIntegration {
  key: string;
  label: string;
  connected: boolean;
  note: string;
}

export interface Blueprint {
  status: "draft" | "approved";
  objective: string;
  opportunities: { title: string; why: string }[];
  workforce: BlueprintAgent[];
  workflows: { name: string; flow: string }[];
  integrations: BlueprintIntegration[];
  budget: string;
  autonomy: "copilot";
  createdAt: string;
  updatedAt: string;
  /** Set at approval: templateKey → hired | existing | needs-seat */
  hireResults?: Record<string, string>;
}

const keyFor = (userId: string) => `blueprint:${userId}`;

export async function getBlueprint(userId: string): Promise<Blueprint | null> {
  const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Blueprint;
    if (typeof parsed.objective !== "string" || !Array.isArray(parsed.workforce)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveBlueprint(userId: string, bp: Blueprint): Promise<void> {
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    create: { key: keyFor(userId), value: JSON.stringify(bp) },
    update: { value: JSON.stringify(bp) },
  });
}

// ─── Live context: what discovery already knows ────────────────────

export interface SystemContext {
  brandName: string | null;
  brandWebsite: string | null;
  researchSnippet: string | null;
  promoting: string | null;
  planKey: string;
  integrations: BlueprintIntegration[];
}

export async function systemContext(user: { id: string; plan: string; whopId: string | null }): Promise<SystemContext> {
  const [brand, bridge, uploadRow, quizRow] = await Promise.all([
    db.brandProfile.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { name: true, website: true, researchJson: true },
    }),
    db.bridgeConnection.findFirst({ where: { userId: user.id }, select: { id: true } }),
    db.appSetting.findUnique({ where: { key: `uploadpost:${user.id}` }, select: { key: true } }),
    db.appSetting.findUnique({ where: { key: `quiz:${user.id}` }, select: { value: true } }),
  ]);

  let promoting: string | null = null;
  if (quizRow) {
    try {
      promoting = (JSON.parse(quizRow.value) as { promoting?: string | null }).promoting ?? null;
    } catch {
      promoting = null;
    }
  }

  const integrations: BlueprintIntegration[] = [
    {
      key: "whop",
      label: "Whop membership",
      connected: Boolean(user.whopId),
      note: user.whopId ? "Your plan and entitlements sync from Whop." : "Sign in with Whop to link your plan.",
    },
    {
      key: "bridge",
      label: "Your P&R key + Muse bridge",
      connected: Boolean(bridge),
      note: bridge
        ? "Your agent generates on your own key through the bridge."
        : "Mint a connect link (Account → Talk to my Muse) so your agent can generate on your key.",
    },
    {
      key: "upload-post",
      label: "Upload-Post (your socials)",
      connected: Boolean(uploadRow),
      note: uploadRow
        ? "Connected — approved content can go out to your socials."
        : "Not connected — finished content has nowhere to go. Connect it in Account.",
    },
    {
      key: "telegram",
      label: "Telegram bot",
      connected: false,
      note: "Optional — pair your Telegram in Account, or start from @thewhoppbot.",
    },
  ];

  return {
    brandName: brand?.name ?? null,
    brandWebsite: brand?.website ?? null,
    researchSnippet: brand?.researchJson ? brand.researchJson.slice(0, 1500) : null,
    promoting,
    planKey: user.plan,
    integrations,
  };
}

// ─── Drafting ──────────────────────────────────────────────────────

const CATALOG_KEYS = new Set(AGENT_CATALOG.map((t) => t.key));
const TOOL_IDS = new Set(FACTORY_TOOLS.map((t) => t.id));

function fallbackBlueprint(ctx: SystemContext): Blueprint {
  const biz = ctx.brandName ?? "your business";
  const plan = getPlan(ctx.planKey);
  const now = new Date().toISOString();
  return {
    status: "draft",
    objective: `Keep ${biz} in front of its customers every day — fresh content, watched competitors, and leads researched — without the owner doing the marketing by hand.`,
    opportunities: [
      { title: "Daily content from your own material", why: "Your site and research already hold the stories; a content crew turns them into posts and memes on a rhythm." },
      { title: "Competitor + trend watching", why: "Riding what is already working in your niche beats inventing angles from zero." },
      { title: "A free /before pack as the front door", why: "The Assessor turns your research into a spoken pitch + memes a prospect can say yes to." },
    ],
    workforce: [
      { templateKey: "scout", name: "Trend Scout", role: "Watches trends and drafts angles for your niche, every day.", mission: `Find the day's rideable angles for ${biz} and queue the strongest.`, schedule: "Daily", approval: "Drafts only — you approve anything that ships", metric: "Angles queued per week" },
      { templateKey: "meme-smith", name: "Meme Smith", role: "Turns briefs into meme packs and captions on order.", mission: `Turn approved angles into meme packs in ${biz}'s voice.`, schedule: "On demand", approval: "Every pack waits for your approve tap", metric: "Packs delivered per week" },
      { templateKey: "content-creator", name: "Content Creator", role: "Builds content packs from your briefs.", mission: `Build the weekly content rhythm for ${biz} from the scout's angles.`, schedule: "Weekly", approval: "Drafts only — you approve anything that ships", metric: "Pieces ready per week" },
      ...(ctx.brandWebsite
        ? [{ templateKey: "assessor", name: "The Assessor", role: "Bridge agent: your /before pack + assessment offer, on your credits.", mission: `Keep ${biz}'s free /before pack current as the front-door offer.`, schedule: "On demand", approval: "Runs through your Muse on your credits, quote first", metric: "Packs generated" } satisfies BlueprintAgent]
        : []),
    ],
    workflows: [
      { name: "Morning angles", flow: "Trend Scout drafts angles → you skim → Meme Smith builds the pack → your approve tap posts it." },
      { name: "Weekly rhythm", flow: "Content Creator assembles the week from approved angles; everything waits for your approval before it goes out." },
    ],
    integrations: ctx.integrations,
    budget: `${plan.name} plan (${plan.price}) covers ${plan.botSeats} bot seat${plan.botSeats === 1 ? "" : "s"} and ${plan.monthlyItems} generations a month. Your own P&R key (BYOK) runs at 1 credit ($0.01) per engine call beyond that. No other running costs are switched on.`,
    autonomy: "copilot",
    createdAt: now,
    updatedAt: now,
  };
}

function clampStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function draftBlueprint(user: { id: string; plan: string; whopId: string | null }): Promise<Blueprint> {
  const ctx = await systemContext(user);
  const fallback = fallbackBlueprint(ctx);
  const cfg = starimgConfig();
  if (!cfg) return persist(user.id, fallback);
  try {
    const ladder = await getLadder("mid");
    const catalog = AGENT_CATALOG.map((t) => `${t.key} — ${t.name}: ${t.role}`).join("\n");
    const tools = FACTORY_TOOLS.map((t) => `${t.id} — ${t.label}`).join("\n");
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ladder[0],
        messages: [
          {
            role: "system",
            content:
              "You are Muse, the P&R onboarding architect. You design a small AI workforce for a small-business owner from a FIXED catalog — never invent agents, tools, integrations, prices, or results. Plain language, no jargon, no earnings promises. Approval rules must keep a human approving anything that publishes, sends, or spends. " +
              `Reply with ONLY JSON: {"objective":"...","opportunities":[{"title":"...","why":"..."}],"workforce":[{"templateKey":"<catalog key>","name":"...","mission":"...","schedule":"Daily|Weekly|On demand","approval":"...","metric":"..."}],"workflows":[{"name":"...","flow":"..."}]} — exactly 3 opportunities, 3–5 workforce agents, 2–3 workflows. For a "custom" agent also include "tools":[<tool ids>] and "instructions":"...".`,
          },
          {
            role: "user",
            content:
              `Business: ${ctx.brandName ?? "(unknown)"} ${ctx.brandWebsite ? `(${ctx.brandWebsite})` : ""}\n` +
              `What they promote: ${ctx.promoting ?? "(unknown)"}\n` +
              `Research on file: ${ctx.researchSnippet ?? "(none yet)"}\n` +
              `Plan: ${ctx.planKey}\n\nAgent catalog (templateKey — name: role):\n${catalog}\n\nCustom-agent tools:\n${tools}\n\nDesign the system.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return persist(user.id, fallback);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return persist(user.id, fallback);
    const p = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;

    const opportunities = (Array.isArray(p.opportunities) ? p.opportunities : [])
      .map((o) => {
        const r = (o ?? {}) as Record<string, unknown>;
        return { title: clampStr(r.title, 120), why: clampStr(r.why, 300) };
      })
      .filter((o) => o.title && o.why)
      .slice(0, 3);

    const workforce = (Array.isArray(p.workforce) ? p.workforce : [])
      .map((a): BlueprintAgent | null => {
        const r = (a ?? {}) as Record<string, unknown>;
        const key = clampStr(r.templateKey, 40);
        const tpl = AGENT_CATALOG.find((t) => t.key === key);
        if (!tpl || !CATALOG_KEYS.has(key)) return null;
        const agent: BlueprintAgent = {
          templateKey: key,
          name: clampStr(r.name, 60) || tpl.name,
          role: tpl.role,
          mission: clampStr(r.mission, 400) || tpl.role,
          schedule: clampStr(r.schedule, 40) || "On demand",
          approval: clampStr(r.approval, 200) || "Drafts only — you approve anything that ships",
          metric: clampStr(r.metric, 120) || "Jobs completed",
        };
        if (key === "custom") {
          const validTools = sanitizeToolIds(Array.isArray(r.tools) ? r.tools.filter((t): t is string => typeof t === "string" && TOOL_IDS.has(t)) : []).map((t) => t.id);
          if (validTools.length === 0) return null;
          agent.tools = validTools;
          agent.instructions = clampStr(r.instructions, 2000) || undefined;
        }
        return agent;
      })
      .filter((a): a is BlueprintAgent => a !== null)
      .slice(0, 5);

    const workflows = (Array.isArray(p.workflows) ? p.workflows : [])
      .map((w) => {
        const r = (w ?? {}) as Record<string, unknown>;
        return { name: clampStr(r.name, 80), flow: clampStr(r.flow, 400) };
      })
      .filter((w) => w.name && w.flow)
      .slice(0, 3);

    if (!clampStr(p.objective, 500) || opportunities.length < 2 || workforce.length < 3) {
      return persist(user.id, fallback);
    }
    const now = new Date().toISOString();
    return persist(user.id, {
      ...fallback,
      objective: clampStr(p.objective, 500),
      opportunities,
      workforce,
      workflows: workflows.length ? workflows : fallback.workflows,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return persist(user.id, fallback);
  }
}

async function persist(userId: string, bp: Blueprint): Promise<Blueprint> {
  await saveBlueprint(userId, bp);
  return bp;
}

// ─── Approval → hire the workforce ─────────────────────────────────

export async function approveBlueprint(user: { id: string; plan: string; whopId: string | null }): Promise<Blueprint> {
  const bp = await getBlueprint(user.id);
  if (!bp) throw new Error("No blueprint to approve — draft one first.");
  const plan = getPlan(user.plan);
  const existing = await db.hiredAgent.findMany({
    where: { userId: user.id },
    select: { templateKey: true, source: true },
  });
  const hiredKeys = new Set(existing.map((h) => h.templateKey));
  let rented = existing.filter((h) => h.source === "RENTAL").length;
  const results: Record<string, string> = {};

  for (const agent of bp.workforce) {
    if (hiredKeys.has(agent.templateKey)) {
      results[agent.templateKey] = "existing";
      continue;
    }
    if (rented >= plan.botSeats) {
      results[agent.templateKey] = "needs-seat";
      continue;
    }
    const tpl = AGENT_CATALOG.find((t) => t.key === agent.templateKey);
    if (!tpl) {
      results[agent.templateKey] = "needs-seat";
      continue;
    }
    const isCustom = agent.templateKey === "custom";
    await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: agent.templateKey,
        name: agent.name.slice(0, 60) || tpl.name,
        tokenBudget: internalBotBudget(user.plan),
        role: isCustom ? agent.role.slice(0, 300) : tpl.role,
        instructions: isCustom ? (agent.instructions ?? null) : (tpl.instructions ?? null),
        toolsJson: isCustom && agent.tools ? toolsToJson(sanitizeToolIds(agent.tools)) : null,
      },
    });
    hiredKeys.add(agent.templateKey);
    rented += 1;
    results[agent.templateKey] = "hired";
  }

  const approved: Blueprint = {
    ...bp,
    status: "approved",
    hireResults: results,
    integrations: (await systemContext(user)).integrations,
    updatedAt: new Date().toISOString(),
  };
  await saveBlueprint(user.id, approved);
  return approved;
}

// ─── Dashboard summary ─────────────────────────────────────────────

export interface SystemSummary {
  agents: { name: string; templateKey: string; status: string }[];
  assetsThisMonth: number;
  generationsUsed: number;
  generationsLimit: number;
  attention: string[];
}

export async function systemSummary(user: { id: string; plan: string; whopId: string | null }): Promise<SystemSummary> {
  const plan = getPlan(user.plan);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [hires, assets, used, ctx, latestResearch] = await Promise.all([
    db.hiredAgent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { name: true, templateKey: true, status: true },
    }),
    db.asset.count({ where: { userId: user.id, createdAt: { gte: monthStart } } }),
    countMonthlyUsage(user.id),
    systemContext(user),
    db.researchJob.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { status: true } }),
  ]);

  const attention: string[] = [];
  if (!ctx.brandWebsite) attention.push("No website on file — add one in the start card so research (and your agents) have your real material.");
  if (latestResearch && latestResearch.status !== "DONE" && latestResearch.status !== "COMPLETED") {
    attention.push(`Your latest deep research is ${latestResearch.status.toLowerCase()} — agents draft better once it lands.`);
  }
  const up = ctx.integrations.find((i) => i.key === "upload-post");
  if (up && !up.connected) attention.push("Upload-Post isn't connected — finished content has nowhere to go. Connect it in Account.");
  const bridge = ctx.integrations.find((i) => i.key === "bridge");
  if (bridge && !bridge.connected) attention.push("Your Muse bridge isn't linked yet — mint a connect link in Account so your own agent can generate on your key.");

  return {
    agents: hires.map((h) => ({ name: h.name, templateKey: h.templateKey, status: h.status })),
    assetsThisMonth: assets,
    generationsUsed: used,
    generationsLimit: plan.monthlyItems,
    attention,
  };
}
