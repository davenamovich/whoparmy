import "server-only";
import { db } from "@/lib/db";
import { getBlueprint, systemSummary } from "@/lib/blueprint";

/**
 * ─── SLICE 2: LAUNCH REPORT + MANAGER BRIEFING (Dave, 2026-11-19) ──
 * The onboarding concept's Phase 7/8: when a member's system goes
 * live they get a launch report (what is running, what it does,
 * what it costs, what it produced, what needs attention), and
 * Ralph acts as the manager — a daily briefing over REAL activity
 * (agent jobs, assets, generations), with failures named and ONE
 * recommended next move. Read-only: a recommendation never
 * executes itself.
 */

type Actor = { id: string; plan: string; whopId: string | null };

export interface LaunchReport {
  systemName: string;
  objective: string;
  agents: { name: string; role: string; state: string }[];
  integrations: { label: string; connected: boolean; note: string }[];
  workflows: { name: string; flow: string }[];
  schedules: { agent: string; schedule: string }[];
  autonomy: string;
  outstanding: string[];
  costs: string;
  howTo: string[];
}

export async function launchReport(user: Actor): Promise<LaunchReport | null> {
  const bp = await getBlueprint(user.id);
  if (!bp || bp.status !== "approved") return null;
  const [brand, summary] = await Promise.all([
    db.brandProfile.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { name: true } }),
    systemSummary(user),
  ]);

  const outstanding: string[] = [...summary.attention];
  for (const a of bp.workforce) {
    if (bp.hireResults?.[a.templateKey] === "needs-seat") {
      outstanding.push(`${a.name} is in the blueprint but still needs a bot seat — upgrade to hire it.`);
    }
  }
  for (const g of bp.integrations) {
    if (!g.connected && g.key !== "telegram") {
      outstanding.push(`${g.label}: ${g.note}`);
    }
  }

  return {
    systemName: `${brand?.name ?? "Your business"} — AI System`,
    objective: bp.objective,
    agents: bp.workforce.map((a) => ({
      name: a.name,
      role: a.role,
      state:
        bp.hireResults?.[a.templateKey] === "hired"
          ? "Hired and on your floor"
          : bp.hireResults?.[a.templateKey] === "existing"
            ? "Already on your floor"
            : bp.hireResults?.[a.templateKey] === "needs-seat"
              ? "Planned — needs a bot seat"
              : "Planned",
    })),
    integrations: bp.integrations.map((g) => ({ label: g.label, connected: g.connected, note: g.note })),
    workflows: bp.workflows,
    schedules: bp.workforce.map((a) => ({ agent: a.name, schedule: a.schedule })),
    autonomy: "Copilot (Level 1) — agents draft and prepare; you approve anything that publishes, sends, or spends.",
    outstanding,
    costs: bp.budget,
    howTo: [
      "Talk to Ralph (the Ralph door) — buttons route the work; 'Build my AI system' reopens this plan.",
      "Watch the board here in My AI System: agents, output, costs, and what needs attention.",
      "Approve before anything ships — posting runs through your Upload-Post, only on your tap.",
      "Your own Muse joins through the connect link in Account and generates on your key.",
    ],
  };
}

export interface DailyBriefing {
  windowHours: 24;
  jobsDone: number;
  jobsFailed: number;
  jobsRunning: number;
  assetsMade: number;
  generations: number;
  researchDone: number;
  attention: string[];
  recommendation: string;
}

export async function dailyBriefing(user: Actor): Promise<DailyBriefing> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [jobs, assetsMade, usage, researchDone, summary, bp] = await Promise.all([
    db.agentJob.findMany({ where: { userId: user.id, createdAt: { gte: since } }, select: { status: true } }),
    db.asset.count({ where: { userId: user.id, createdAt: { gte: since } } }),
    db.usageRecord.findMany({ where: { userId: user.id, createdAt: { gte: since } }, select: { count: true } }),
    db.researchJob.count({ where: { userId: user.id, createdAt: { gte: since }, status: "done" } }),
    systemSummary(user),
    getBlueprint(user.id),
  ]);

  const jobsDone = jobs.filter((j) => j.status === "DONE").length;
  const jobsFailed = jobs.filter((j) => j.status === "FAILED").length;
  const jobsRunning = jobs.filter((j) => j.status === "RUNNING" || j.status === "QUEUED").length;
  const generations = usage.reduce((n, r) => n + (r.count ?? 1), 0);

  let recommendation: string;
  if (jobsFailed > 0) {
    recommendation = `${jobsFailed} agent job${jobsFailed === 1 ? "" : "s"} failed in the last day — check your floor (Rent a Bot) before queuing more work.`;
  } else if (summary.attention.some((a) => a.includes("Upload-Post"))) {
    recommendation = "Connect Upload-Post in Account — right now, finished content has nowhere to go.";
  } else if (!bp) {
    recommendation = "Draft your blueprint here in My AI System — that's the plan everything else runs from.";
  } else if (bp.status !== "approved") {
    recommendation = "Your blueprint is drafted and waiting — approve it here and the workforce gets hired.";
  } else if (assetsMade === 0 && jobsDone === 0) {
    recommendation = "Nothing shipped in the last 24 hours — tap Ralph's 'Make my free content' to restart the rhythm.";
  } else {
    recommendation = "The system is healthy. Ride today's trending angle while it's fresh — Trending lives in Create.";
  }

  return {
    windowHours: 24,
    jobsDone,
    jobsFailed,
    jobsRunning,
    assetsMade,
    generations,
    researchDone,
    attention: summary.attention,
    recommendation,
  };
}
