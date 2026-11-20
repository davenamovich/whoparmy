import "server-only";
import { db } from "@/lib/db";
import { AGENT_CATALOG, internalBotBudget } from "@/lib/agents";
import { sanitizeToolIds, toolsToJson } from "@/lib/agent-architect-core";
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
  /**
   * Panel fix 2 (2026-11-19): seat reconciliation. True when the
   * member's plan seats this agent (or it's already hired); false
   * means it queues for a seat. Undefined on pre-fix blueprints —
   * treat as seated.
   */
  seated?: boolean;
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
  /** Panel fix 4: the pinned weekly content spec (targets + credit estimates). */
  contentSpec?: string[];
  /** Panel fix 5: the brand voice every agent works in. */
  voiceSpec?: string;
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

// Real-agent model (Dave, 2026-11-19): blueprints design from the
// platform-side agents that can actually be HIRED on approval — the
// bridge agents. Stack-seeded agents (Barry) are excluded: they join
// through their stack launch, never through a blueprint, and the
// retired rental bench no longer exists here at all.
const BLUEPRINT_CATALOG = AGENT_CATALOG.filter((t) => !t.viaStack);
const CATALOG_KEYS = new Set(BLUEPRINT_CATALOG.map((t) => t.key));

/**
 * Panel fix 4 (2026-11-19): a pinned weekly content spec — exact
 * pieces per cycle with credit estimates against the real caps, so
 * "a week of content" is a spec, not a hope. Targets, never
 * charges: every run is still quoted before it spends.
 */
export function weeklyContentSpec(planKey: string): string[] {
  const plan = getPlan(planKey);
  // Panel verdict on the house blueprint (2026-11-19): the old
  // closing line claimed ~23 credits sat "inside ~6 plan
  // generations a week" on Trial — false, and it conflated two
  // different meters. Honest accounting: engine CALLS are the
  // unit; the plan's monthly generations cover calls up to its
  // allowance, anything past that runs on the member's own key
  // at 1 credit ($0.01) per call; a week connect link caps at
  // 805 credits (the week bridge offer's budget).
  return [
    "5 memes (~5 engine calls)",
    "3 social posts (~3 calls)",
    "1 trending-angle pack (~15 calls)",
    "1 lead-research pass (research time — no engine calls)",
    `≈23 engine calls a week. Your ${plan.name} plan includes ${plan.monthlyItems} generations a month; calls past that run on your own key at 1 credit ($0.01) each — about $0.23 a week at this rhythm. A week connect link caps at 805 credits; this spec uses ~3% of it. Targets, not charges: every run is quoted exactly before it spends.`,
  ];
}

/**
 * Business-aware outcome (panel verdict, 2026-11-19): the old
 * fallback objective imposed a trades frame ("booked work,
 * estimate requests") on every business — wrong for a creator,
 * an affiliate, an agency, or a platform. The outcome follows
 * what the member promotes (quiz answer on file).
 */
export function outcomeFor(promoting: string | null): string {
  switch (promoting) {
    case "affiliate":
      return "clicks through your links that become signups and sales";
    case "creator":
      return "viewers who subscribe, follow, and buy";
    case "clients":
      return "inquiries and bookings for the businesses you serve";
    case "idea":
      return "your first real audience and your first sales";
    case "business":
    default:
      return "customers reaching out, booking, and buying";
  }
}

/** Panel fix 5: the brand voice, from research when it names one. */
export function voiceSpecFrom(ctx: SystemContext): string {
  if (ctx.researchSnippet) {
    try {
      const parsed = JSON.parse(ctx.researchSnippet) as Record<string, unknown>;
      for (const k of ["voice", "tone", "brandVoice"]) {
        const v = parsed[k];
        if (typeof v === "string" && v.trim()) return v.trim().slice(0, 300);
      }
    } catch {
      /* research is free text — fall through to the default */
    }
  }
  const where = ctx.brandWebsite ?? "your website";
  return `Mirror the voice on ${where}: pull three real phrases from your own pages and reuse that register — plain, direct, in your customers' words. No hype words, no corporate polish.`;
}

/**
 * Panel fix 2: reconcile the workforce with the plan's seats
 * BEFORE anything is promised — in blueprint order, already-hired
 * agents keep their seat; the rest fill the remaining seats; the
 * overflow is honestly flagged seated:false (queued for a seat).
 */
export async function withSeats(user: { id: string; plan: string }, bp: Blueprint): Promise<Blueprint> {
  // Engine-meter model (Dave, 2026-11-19): seats are retired —
  // agents are unlimited on every plan, so every workforce agent
  // is on the floor. The seated flags remain on the type so older
  // stored blueprints (and the prompt's floor/queued split) keep
  // working; new drafts simply seat everyone.
  void user;
  return { ...bp, workforce: bp.workforce.map((a) => ({ ...a, seated: true })) };
}

function fallbackBlueprint(ctx: SystemContext): Blueprint {
  const biz = ctx.brandName ?? "your business";
  const plan = getPlan(ctx.planKey);
  const now = new Date().toISOString();
  return {
    status: "draft",
    // Panel fix 1 + the house verdict: the objective names the
    // outcome THIS business actually sells — content is the
    // means, never the objective, and the frame follows the
    // member's model (no bookings frame on a business that
    // doesn't sell bookings).
    objective: `Turn ${biz}'s presence into results: a weekly rhythm of content that ends in ${outcomeFor(ctx.promoting)} — built and run by your own agent crew from Day 1, with the Assessor's free /before pack as the front door — without the owner doing the marketing by hand.`,
    opportunities: [
      { title: "Content that ends in a result", why: `Every week of posts points at the outcome that pays — ${outcomeFor(ctx.promoting)} — so the owner can see what the marketing produced.` },
      { title: "Your own crew, stood up on Day 1", why: "The Day-1 setup prompt builds your workforce in your own Muse — trend watching, content making, QA — fitted to your stack and your approval rules, instead of rented templates." },
      { title: "A free /before pack as the front door", why: "The Assessor turns your research into a spoken pitch + memes a prospect can say yes to." },
    ],
    // Real-agent model (Dave, 2026-11-19): the platform workforce is
    // the bridge agents only — the member's own crew (built Day-1 in
    // their Muse) does the production work the retired rental bench
    // used to promise. The Assessor is always on the floor; its pack
    // sharpens once the member's website is on file.
    workforce: [
      { templateKey: "assessor", name: "The Assessor", role: "Bridge agent: your /before pack + assessment offer, on your credits.", mission: `Keep ${biz}'s free /before pack current as the front-door offer.`, schedule: "On demand", approval: "Runs through your Muse on your credits, quote first", metric: "Packs generated" },
    ],
    workflows: [
      { name: "Day-1 build", flow: "The setup prompt hands your Muse this blueprint → it stands up your crew and your team board → every piece the crew drafts waits for your approve tap before it ships." },
      { name: "Front door", flow: "The Assessor keeps your free /before pack current from your research → prospects get the pack → the bridge carries your saved offer links into every pack it makes." },
    ],
    integrations: ctx.integrations,
    // Panel (Risk): never guarantee "no other costs" — the member's
    // own agent runs on their own accounts, outside P&R credits.
    budget: `${plan.name} plan (${plan.price}) includes ${plan.monthlyItems} generations a month and ${plan.monthlyClips} clips. Agents are yours — no seat limits; your own Muse runs them. Calls past the plan's generations run on your own P&R key at 1 credit ($0.01) per engine call. Those are the only P&R-side costs switched on — your own Muse or Agent37 usage runs on your own accounts, outside P&R credits.`,
    contentSpec: weeklyContentSpec(ctx.planKey),
    voiceSpec: voiceSpecFrom(ctx),
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
  if (!cfg) return persist(user.id, await withSeats(user, fallback));
  try {
    const ladder = await getLadder("mid");
    const catalog = BLUEPRINT_CATALOG.map((t) => `${t.key} — ${t.name}: ${t.role}`).join("\n");
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ladder[0],
        messages: [
          {
            role: "system",
            content:
              "You are Muse, the P&R onboarding architect. You design a small AI workforce for a small-business owner from a FIXED catalog — never invent agents, tools, integrations, prices, or results. Plain language, no jargon, no earnings promises. Approval rules must keep a human approving anything that publishes, sends, or spends. The OBJECTIVE must name the outcome THIS business actually sells — content is the means, never the objective. Match the frame to the business's model, from the research and what they promote: a local service business books jobs and estimate requests; a creator grows subscribers and sales; an affiliate earns signups and sales through their links; an agency wins inquiries for its clients; a software or platform business gets signups and customers. NEVER impose a bookings/estimates frame on a business that does not sell bookings. The catalog is deliberately small: these are the platform-side bridge agents, the whole platform workforce. The member's own Muse builds the rest of their crew from the Day-1 setup prompt — opportunities may describe what that Day-1 crew will do (trend watching, content making, QA) framed as the member's OWN agents, but never invent a platform agent, monitor, or service that is not in the catalog. Metrics measure outcomes (leads, inquiries, bookings) for roles that touch them; output counts only for pure production roles. " +
              `Reply with ONLY JSON: {"objective":"...","opportunities":[{"title":"...","why":"..."}],"workforce":[{"templateKey":"<catalog key>","name":"...","mission":"...","schedule":"Daily|Weekly|On demand","approval":"...","metric":"..."}],"workflows":[{"name":"...","flow":"..."}]} — exactly 3 opportunities, 1–3 workforce agents (only catalog keys — a short workforce is correct when the catalog is short), 2–3 workflows.`,
          },
          {
            role: "user",
            content:
              `Business: ${ctx.brandName ?? "(unknown)"} ${ctx.brandWebsite ? `(${ctx.brandWebsite})` : ""}\n` +
              `What they promote: ${ctx.promoting ?? "(unknown)"}\n` +
              `Research on file: ${ctx.researchSnippet ?? "(none yet)"}\n` +
              `Plan: ${ctx.planKey} (${getPlan(ctx.planKey).monthlyItems} generations/month included; agents are unlimited — order the workforce by priority so the most important work is unmistakable)\n\nAgent catalog (templateKey — name: role):\n${catalog}\n\nDesign the system.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return persist(user.id, await withSeats(user, fallback));
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return persist(user.id, await withSeats(user, fallback));
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
        const tpl = BLUEPRINT_CATALOG.find((t) => t.key === key);
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
        return agent;
      })
      .filter((a): a is BlueprintAgent => a !== null)
      .slice(0, 3);

    const workflows = (Array.isArray(p.workflows) ? p.workflows : [])
      .map((w) => {
        const r = (w ?? {}) as Record<string, unknown>;
        return { name: clampStr(r.name, 80), flow: clampStr(r.flow, 400) };
      })
      .filter((w) => w.name && w.flow)
      .slice(0, 3);

    if (!clampStr(p.objective, 500) || opportunities.length < 2 || workforce.length < 1) {
      return persist(user.id, await withSeats(user, fallback));
    }
    const now = new Date().toISOString();
    return persist(user.id, await withSeats(user, {
      ...fallback,
      objective: clampStr(p.objective, 500),
      opportunities,
      workforce,
      workflows: workflows.length ? workflows : fallback.workflows,
      createdAt: now,
      updatedAt: now,
    }));
  } catch {
    return persist(user.id, await withSeats(user, fallback));
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
  const existing = await db.hiredAgent.findMany({
    where: { userId: user.id },
    select: { templateKey: true, source: true },
  });
  const hiredKeys = new Set(existing.map((h) => h.templateKey));
  const results: Record<string, string> = {};

  // No seat gate (engine-meter model, 2026-11-19): approval hires
  // the whole workforce. "needs-seat" survives only in blueprints
  // approved under the old model.
  for (const agent of bp.workforce) {
    if (hiredKeys.has(agent.templateKey)) {
      results[agent.templateKey] = "existing";
      continue;
    }
    const tpl = AGENT_CATALOG.find((t) => t.key === agent.templateKey);
    if (!tpl || tpl.viaStack) {
      // Retired rental bench (2026-11-19) or a stack-seeded agent:
      // not hirable from a blueprint. The agent simply doesn't join
      // the floor — approval still completes for the rest.
      results[agent.templateKey] = "retired";
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
    results[agent.templateKey] = "hired";
  }

  const approved: Blueprint = {
    ...bp,
    status: "approved",
    hireResults: results,
    // Seat truth after hiring: hired/existing = seated.
    workforce: bp.workforce.map((a) => ({
      ...a,
      seated: results[a.templateKey] === "hired" || results[a.templateKey] === "existing",
    })),
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
  if (latestResearch && latestResearch.status === "running") {
    attention.push("Your latest deep research is still running — agents draft better once it lands.");
  }
  if (latestResearch && latestResearch.status === "failed") {
    attention.push("Your latest deep research failed — run it again from Brand Profiles so your agents have real material.");
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
