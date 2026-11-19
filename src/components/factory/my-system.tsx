"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Loader2, Network, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * My AI System (Slice 1, Dave 2026-11-19): the member's blueprint
 * and the state of the system it describes — workforce, workflows,
 * integrations with honest live state, budget, and what needs
 * attention. Drafting is research-first (Ralph designs from the
 * member's site, research and memory); approval hires the
 * workforce within the plan's seats. Copilot mode only: everything
 * that publishes, sends, or spends still waits for a human tap.
 */

interface BpAgent {
  templateKey: string;
  name: string;
  role: string;
  mission: string;
  schedule: string;
  approval: string;
  metric: string;
  seated?: boolean;
}
interface Bp {
  status: "draft" | "approved";
  objective: string;
  opportunities: { title: string; why: string }[];
  workforce: BpAgent[];
  workflows: { name: string; flow: string }[];
  integrations: { key: string; label: string; connected: boolean; note: string }[];
  budget: string;
  contentSpec?: string[];
  voiceSpec?: string;
  hireResults?: Record<string, string>;
}
interface Summary {
  agents: { name: string; templateKey: string; status: string }[];
  assetsThisMonth: number;
  generationsUsed: number;
  generationsLimit: number;
  attention: string[];
}
interface Report {
  systemName: string;
  objective: string;
  agents: { name: string; role: string; state: string }[];
  workflows: { name: string; flow: string }[];
  schedules: { agent: string; schedule: string }[];
  autonomy: string;
  outstanding: string[];
  costs: string;
  howTo: string[];
}
interface Briefing {
  jobsDone: number;
  jobsFailed: number;
  jobsRunning: number;
  assetsMade: number;
  generations: number;
  researchDone: number;
  recommendation: string;
}

export function MySystemView() {
  const [blueprint, setBlueprint] = useState<Bp | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [setup, setSetup] = useState<{ eligible: boolean; link: string | null; prompt: string } | null>(null);
  const [busySetup, setBusySetup] = useState(false);
  const [panel, setPanel] = useState<{
    status: string;
    verdict?: { summary: string; lenses: { lens: string; findings: string }[]; fixes: string[] };
  } | null>(null);
  const [busyPanel, setBusyPanel] = useState(false);
  const [team, setTeam] = useState<{
    confirmedAt: string | null;
    roster: { name: string; role: string; boardName: string; seated: boolean }[];
    prompt: string | null;
  } | null>(null);
  const [busyTeam, setBusyTeam] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);

  const load = useCallback(async () => {
    try {
      void fetch("/api/panel")
        .then((r) => r.json())
        .then((d: { panel?: typeof panel }) => {
          if (d.panel) setPanel(d.panel);
        })
        .catch(() => undefined);
      const res = await fetch("/api/blueprint");
      const data = (await res.json().catch(() => ({}))) as {
        blueprint?: Bp | null;
        summary?: Summary;
        report?: Report | null;
        briefing?: Briefing;
        team?: typeof team;
      };
      if (res.ok) {
        setBlueprint(data.blueprint ?? null);
        if (data.summary) setSummary(data.summary);
        setReport(data.report ?? null);
        if (data.briefing) setBriefing(data.briefing);
        if (data.team) setTeam(data.team);
      }
    } catch {
      // leave the empty state; the buttons still work
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function craftSetup() {
    setBusySetup(true);
    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        eligible?: boolean;
        link?: string | null;
        prompt?: string;
        error?: string;
      };
      if (!res.ok || !data.prompt) throw new Error(data.error ?? "Setup failed");
      setSetup({ eligible: Boolean(data.eligible), link: data.link ?? null, prompt: data.prompt });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusySetup(false);
    }
  }

  async function requestPanelReview() {
    setBusyPanel(true);
    try {
      const res = await fetch("/api/panel", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { panel?: typeof panel; error?: string };
      if (!res.ok || !data.panel) throw new Error(data.error ?? "Panel request failed");
      setPanel(data.panel);
      toast.success("Sent to the expert panel — the swarm starts on demand, and most verdicts land within about 15 minutes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Panel request failed");
    } finally {
      setBusyPanel(false);
    }
  }

  async function confirmTeam() {
    setBusyTeam(true);
    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "team-confirm" }),
      });
      const data = (await res.json().catch(() => ({}))) as { team?: { confirmedAt: string }; error?: string };
      if (!res.ok || !data.team) throw new Error(data.error ?? "That didn't work");
      setTeam((t) => (t ? { ...t, confirmedAt: data.team!.confirmedAt } : t));
      toast.success("Marked — your team board is set up.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusyTeam(false);
    }
  }

  async function act(action: "draft" | "approve") {
    setBusy(action);
    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { blueprint?: Bp; summary?: Summary; error?: string };
      if (!res.ok || !data.blueprint) {
        toast.error(data.error ?? "That didn't work — try again.");
        return;
      }
      setBlueprint(data.blueprint);
      if (data.summary) setSummary(data.summary);
      toast.success(action === "draft" ? "Blueprint drafted — review it below." : "Blueprint approved — your workforce is hired.");
      if (action === "approve") void load();
    } catch {
      toast.error("That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your system…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary grid place-items-center text-primary-foreground shrink-0">
          <Network className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">My AI System</h2>
          <p className="text-sm text-muted-foreground">
            Your blueprint and the workforce it runs. Ralph designs it from your website, research and
            memory — you approve it, and approval hires the agents. Copilot mode: anything that
            publishes, sends, or spends still waits for your tap.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
        <p className="font-semibold">Day-1 setup — start with your own Muse</p>
        <p className="text-sm text-muted-foreground">
          Ralph crafts one master prompt from your blueprint. Paste it to your Muse (or any agent you
          run) and it builds your complete agent management UI in your own stack, wires the workforce,
          and has you operating from day 1. The bridge link rides inside the prompt.
        </p>
        {setup ? (
          <div className="space-y-3">
            {setup.link ? (
              <p className="text-sm">
                Your fresh connect link:{" "}
                <span className="font-medium break-all">{setup.link}</span>
                <span className="text-muted-foreground"> — it's inside the prompt too. Crafting a new one retires older unused links.</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect links mint on Operator and Agency plans — the prompt includes the one step to
                get yours. Everything else in it works today.
              </p>
            )}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs leading-relaxed">{setup.prompt}</pre>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  void navigator.clipboard.writeText(setup.prompt);
                  toast.success("Setup prompt copied — paste it to your Muse.");
                }}
              >
                Copy the prompt
              </Button>
              <Button variant="outline" onClick={() => void craftSetup()} disabled={busySetup}>
                {busySetup ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Craft a fresh one
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => void craftSetup()} disabled={busySetup}>
            {busySetup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Craft my Day-1 setup prompt
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
        <p className="font-semibold">Expert panel — four specialists review your system</p>
        <p className="text-sm text-muted-foreground">
          Before you run on a plan, send it to the panel: an Offer expert, a Content Engine expert, a
          Funnel expert, and a Risk &amp; Honesty expert each review your blueprint and Day-1 setup as
          their own assignment, then a single verdict with fixes comes back here. The panel works on
          demand — it starts within about a minute of your request, and most verdicts land within
          about 15 minutes.
        </p>
        {panel?.status === "reviewed" && panel.verdict ? (
          <div className="space-y-3">
            <p className="text-sm"><span className="font-medium">Verdict:</span> {panel.verdict.summary}</p>
            {panel.verdict.fixes.length ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Fixes that matter most</p>
                {panel.verdict.fixes.map((f, i) => (
                  <p key={i} className="text-sm text-muted-foreground">• {f}</p>
                ))}
              </div>
            ) : null}
            <div className="space-y-1.5">
              {panel.verdict.lenses.map((l) => (
                <p key={l.lens} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{l.lens}:</span> {l.findings}
                </p>
              ))}
            </div>
            <Button variant="outline" onClick={() => void requestPanelReview()} disabled={busyPanel}>
              {busyPanel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Send it again
            </Button>
          </div>
        ) : panel?.status === "queued" || panel?.status === "in-review" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> With the panel now — the swarm starts on demand, within about a minute of your request, and most verdicts land within about 15 minutes. Yours appears right here.
          </p>
        ) : (
          <Button onClick={() => void requestPanelReview()} disabled={busyPanel}>
            {busyPanel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />} Send to the expert panel
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
        <p className="font-semibold">Your Team — your crew, on your own board</p>
        <p className="text-sm text-muted-foreground">
          Your agents coordinate on a Vercel Board that belongs to you — your account, your sign-in,
          your data. During the Day-1 setup your Muse stands it up: you as the member, your Muse as
          coordinator, and each agent below working under its own board name, claiming tasks from the
          week's real work. The full Day-1 prompt includes the board setup automatically; the button
          below copies just that part on its own.
        </p>
        {team?.roster.length ? (
          <div className="space-y-1.5">
            {team.roster.map((a) => (
              <p key={a.boardName} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">{a.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">--as {a.boardName}</span>
                {a.seated ? (
                  <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">On your floor</span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-semibold">Gets its board name on approval</span>
                )}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Draft your blueprint first — your team is your workforce, under board names.</p>
        )}
        {team?.confirmedAt ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Board status: set up</span> — you confirmed it on{" "}
            {new Date(team.confirmedAt).toLocaleDateString()}. Whoparmy can't see your Vercel board, so
            this status is your word — by design.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Board status: in your Day-1 prompt</span> — not
            confirmed yet. Once your Muse has stood the board up, mark it here.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!team?.prompt}
            onClick={() => {
              if (!team?.prompt) return;
              void navigator.clipboard.writeText(team.prompt).then(
                () => toast.success("Team setup prompt copied — paste it to your Muse."),
                () => toast.error("Copy failed — try again."),
              );
            }}
          >
            Copy team setup prompt
          </Button>
          {!team?.confirmedAt ? (
            <Button variant="outline" onClick={() => void confirmTeam()} disabled={busyTeam || !team?.roster.length}>
              {busyTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} My board is set up
            </Button>
          ) : null}
        </div>
      </div>

      {!blueprint ? (
        <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
          <p className="font-semibold">No blueprint yet</p>
          <p className="text-sm text-muted-foreground">
            One tap drafts it: your top opportunities, the agents to hire, how they work together, what
            to connect, and what it costs — all from what's already on file about your business. The
            more research on file (start card, above), the sharper the draft.
          </p>
          <Button onClick={() => void act("draft")} disabled={busy !== null}>
            {busy === "draft" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Network className="h-4 w-4 mr-2" />}
            Draft my blueprint
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">Your blueprint</p>
              <span
                className={
                  blueprint.status === "approved"
                    ? "rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-xs font-semibold"
                    : "rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold"
                }
              >
                {blueprint.status === "approved" ? "Approved — system live" : "Draft — awaiting your approval"}
              </span>
            </div>
            <p className="text-sm">{blueprint.objective}</p>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Top opportunities</p>
              {blueprint.opportunities.map((o, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{i + 1}. {o.title}.</span> {o.why}
                </p>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Your workforce</p>
              {blueprint.workforce.map((a) => (
                <div key={a.templateKey} className="rounded-lg border p-3 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Bot className="h-4 w-4 text-primary" /> {a.name}
                    <span className="text-xs font-normal text-muted-foreground">{a.schedule}</span>
                    {blueprint.hireResults?.[a.templateKey] === "hired" ? (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">Hired</span>
                    ) : blueprint.hireResults?.[a.templateKey] === "existing" ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Already on your floor</span>
                    ) : blueprint.hireResults?.[a.templateKey] === "needs-seat" ? (
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-semibold">Not hired yet — re-approve to hire</span>
                    ) : a.seated === false ? (
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-semibold">Joins on approval</span>
                    ) : a.seated === true ? (
                      <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold">On your floor</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">{a.mission}</p>
                  <p className="text-xs text-muted-foreground">
                    Approval: {a.approval} · Success: {a.metric}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">How they work together</p>
              {blueprint.workflows.map((w, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{w.name}:</span> {w.flow}
                </p>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Integrations</p>
              {blueprint.integrations.map((g) => (
                <p key={g.key} className="flex items-start gap-2 text-sm text-muted-foreground">
                  {g.connected ? (
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <span>
                    <span className="font-medium text-foreground">{g.label}</span> — {g.note}
                  </span>
                </p>
              ))}
            </div>

            {blueprint.contentSpec?.length ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Weekly content spec</p>
                {blueprint.contentSpec.map((l, i) => (
                  <p key={i} className="text-sm text-muted-foreground">• {l}</p>
                ))}
              </div>
            ) : null}

            {blueprint.voiceSpec ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Brand voice:</span> {blueprint.voiceSpec}
              </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Budget:</span> {blueprint.budget}
            </p>

            <div className="flex flex-wrap gap-2">
              {blueprint.status === "draft" ? (
                <Button onClick={() => void act("approve")} disabled={busy !== null}>
                  {busy === "approve" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Approve — hire this workforce
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => void act("draft")} disabled={busy !== null}>
                {busy === "draft" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Redraft blueprint
              </Button>
            </div>
            {blueprint.status === "approved" ? (
              <p className="text-xs text-muted-foreground">
                Redrafting replans the system — agents already hired stay hired; the new draft hires
                only what's missing when you approve it.
              </p>
            ) : null}
          </div>

          {summary ? (
            <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
              <p className="font-semibold">System status</p>
              <p className="text-sm text-muted-foreground">
                {summary.agents.length} agent{summary.agents.length === 1 ? "" : "s"} on your floor ·{" "}
                {summary.assetsThisMonth} assets made this month · {summary.generationsUsed} of{" "}
                {summary.generationsLimit} generations used
              </p>
              {summary.attention.length ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Needs attention</p>
                  {summary.attention.map((a, i) => (
                    <p key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" /> {a}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-emerald-600" /> Nothing needs attention right now.
                </p>
              )}
            </div>
          ) : null}

          {report ? (
            <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
              <p className="font-semibold">Launch report — {report.systemName}</p>
              <div className="space-y-1.5">
                {report.agents.map((a) => (
                  <p key={a.name} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{a.name}</span> — {a.state}
                  </p>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Schedules:</span>{" "}
                {report.schedules.map((s) => `${s.agent}: ${s.schedule}`).join(" · ")}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Autonomy:</span> {report.autonomy}
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Costs:</span> {report.costs}
              </p>
              {report.outstanding.length ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Outstanding</p>
                  {report.outstanding.map((o, i) => (
                    <p key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" /> {o}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">How you run it</p>
                {report.howTo.map((h, i) => (
                  <p key={i} className="text-sm text-muted-foreground">{h}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {briefing ? (
        <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-3">
          <p className="font-semibold">Manager briefing — last 24 hours</p>
          <p className="text-sm text-muted-foreground">
            {briefing.jobsDone} agent jobs done
            {briefing.jobsFailed ? `, ${briefing.jobsFailed} failed` : ""}
            {briefing.jobsRunning ? `, ${briefing.jobsRunning} running or queued` : ""} ·{" "}
            {briefing.assetsMade} assets made · {briefing.generations} generations ·{" "}
            {briefing.researchDone} research runs finished
          </p>
          <p className="text-sm">
            <span className="font-medium">Ralph's recommendation:</span> {briefing.recommendation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
