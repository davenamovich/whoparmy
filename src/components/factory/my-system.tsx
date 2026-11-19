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
}
interface Bp {
  status: "draft" | "approved";
  objective: string;
  opportunities: { title: string; why: string }[];
  workforce: BpAgent[];
  workflows: { name: string; flow: string }[];
  integrations: { key: string; label: string; connected: boolean; note: string }[];
  budget: string;
  hireResults?: Record<string, string>;
}
interface Summary {
  agents: { name: string; templateKey: string; status: string }[];
  assetsThisMonth: number;
  generationsUsed: number;
  generationsLimit: number;
  attention: string[];
}

export function MySystemView() {
  const [blueprint, setBlueprint] = useState<Bp | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "approve" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/blueprint");
      const data = (await res.json().catch(() => ({}))) as { blueprint?: Bp | null; summary?: Summary };
      if (res.ok) {
        setBlueprint(data.blueprint ?? null);
        if (data.summary) setSummary(data.summary);
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
                      <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[11px] font-semibold">Needs a bot seat — upgrade to hire</span>
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
        </div>
      )}
    </div>
  );
}
