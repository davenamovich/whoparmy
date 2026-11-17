"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Wallet, Pause, Play, Store, Briefcase, ListOrdered, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import type { AgentTemplate } from "@/lib/agents";

interface Hire {
  id: string;
  templateKey: string;
  name: string;
  tokenBudget: number;
  tokensUsed: number;
  status: string;
  agent37Ref: string | null;
}

interface Job {
  id: string;
  hireId: string;
  kind: string;
  brief: string;
  pieces: number;
  tokenCost: number;
  status: string;
  result: string | null;
  createdAt: string;
}

interface Listing {
  id: string;
  posterId: string;
  title: string;
  description: string;
  bountyTokens: number;
  status: string;
  poster: { name: string | null; whopUsername: string | null };
}

const fmt = (n: number) => n.toLocaleString();

/**
 * RENT A BOT — the bot rental economy.
 * Members rent bots by the month on their plan's seats and count
 * memes, never tokens (pricing decision 2026-11-17). Tokens remain an
 * internal ops ledger: each bot carries an internal fuel budget and
 * jobs execute through Starimg the moment they're ordered (agent
 * runner, src/lib/agent-runner.ts); failed runs are never charged.
 * Campaign bounties are meme reservations between members —
 * SIMULATED value until real payments exist.
 */
export function AgentsView() {
  const { toast } = useToast();
  const tA = useTranslations("agents");
  const tO = useTranslations("onboarding");
  const [planInfo, setPlanInfo] = useState<{ name: string; price: string; botSeats: number; botsRented: number; memesUsed: number; memesLimit: number } | null>(null);
  const [catalog, setCatalog] = useState<AgentTemplate[]>([]);
  const [hires, setHires] = useState<Hire[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myUserId, setMyUserId] = useState<string>("");
  const [jobForms, setJobForms] = useState<Record<string, { kind: string; brief: string; pieces: string }>>({});
  const [campForm, setCampForm] = useState({ title: "", description: "", bounty: "100" });
  const [claimAgent, setClaimAgent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([fetch("/api/agents"), fetch("/api/campaign-market")]);
    if (a.ok) {
      const d = await a.json();
      setPlanInfo(d.plan);
      setCatalog(d.catalog);
      setHires(d.hires);
      setJobs(d.jobs);
    }
    if (c.ok) {
      const d = await c.json();
      setListings(d.listings);
      setMyUserId(d.myUserId);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While any job is queued or running, keep the queue live.
  const inFlight = jobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING");
  useEffect(() => {
    if (!inFlight) return;
    const t = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(t);
  }, [inFlight, load]);

  async function act(fn: () => Promise<Response>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something failed");
      toast({ title: okMsg });
      await load();
    } catch (err) {
      toast({ title: "That didn't work", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const activeHires = hires.filter((h) => h.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> Rent a Bot
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your own meme bot, rented by the month. Order work, watch it ship, approve what goes out. No dashboards to
          learn, no AI math — just memes. Owner approves — bots create.
        </p>
      </div>

      {planInfo ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" /> Your plan — {planInfo.name} ({planInfo.price})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{planInfo.botsRented} / {planInfo.botSeats}</div>
                <div className="text-[11px] text-muted-foreground">Bots rented</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{fmt(planInfo.memesUsed)} / {fmt(planInfo.memesLimit)}</div>
                <div className="text-[11px] text-muted-foreground">{tA("memesThisMonth")}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{fmt(Math.max(0, planInfo.memesLimit - planInfo.memesUsed))}</div>
                <div className="text-[11px] text-muted-foreground">{tA("memesLeft")}</div>
              </div>
            </div>
            <div className="mt-3">
              <Progress value={planInfo.memesLimit > 0 ? Math.min(100, Math.round((planInfo.memesUsed / planInfo.memesLimit) * 100)) : 0} className="h-2" />
              <p className="text-[11px] text-muted-foreground mt-1.5">{tA("meterNote")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> {tA("botRental")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {catalog.map((t) => (
            <div key={t.key} className="rounded-lg border border-border/60 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{t.name}</span>
                <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{tA("tierSuffix", { tier: t.tierKey })}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t.role}</p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={busy || (planInfo != null && planInfo.botsRented >= planInfo.botSeats)}
                  onClick={() =>
                    void act(
                      () =>
                        fetch("/api/agents", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ templateKey: t.key }),
                        }),
                      `${t.name} rented — it's on your team`,
                    )
                  }
                >
                  {tA("rentThisBot")}
                </Button>
                {planInfo && planInfo.botsRented >= planInfo.botSeats ? (
                  <span className="text-[11px] text-muted-foreground">{tA("seatsFull")}</span>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> {tO("byokTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{tO("byokBody")}</p>
        </CardContent>
      </Card>

      {hires.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> {tA("yourBots")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hires.map((h) => {
              const form = jobForms[h.id] ?? { kind: "MEME", brief: "", pieces: "1" };
              return (
                <div key={h.id} className="rounded-lg border border-border/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold">{h.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{h.status}</Badge>
                      {h.status === "ACTIVE" ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => fetch(`/api/agents/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PAUSED" }) }), "Agent paused")}>
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                      ) : h.status === "PAUSED" ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => fetch(`/api/agents/${h.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ACTIVE" }) }), "Agent resumed")}>
                          <Play className="h-3 w-3 mr-1" /> Resume
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {jobs.filter((j) => j.hireId === h.id && j.status === "DONE").length} jobs finished ·{" "}
                    {jobs.filter((j) => j.hireId === h.id && (j.status === "QUEUED" || j.status === "RUNNING")).length} in the queue
                    {h.agent37Ref ? ` · Agent37: ${h.agent37Ref}` : " · runs on the P&R engine"}
                  </div>
                  {h.status === "ACTIVE" ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={form.kind}
                        onChange={(e) => setJobForms((f) => ({ ...f, [h.id]: { ...form, kind: e.target.value } }))}
                      >
                        <option value="SCOUT">Scout report (volume)</option>
                        <option value="MEME">Meme pack (mid)</option>
                        <option value="HOOK">Hooks (final)</option>
                        <option value="QA">Claude QA pass (quality)</option>
                      </select>
                      <Input
                        className="flex-1"
                        placeholder="Brief — what should the agent make?"
                        value={form.brief}
                        onChange={(e) => setJobForms((f) => ({ ...f, [h.id]: { ...form, brief: e.target.value } }))}
                      />
                      <Input
                        className="w-20"
                        inputMode="numeric"
                        placeholder="pcs"
                        value={form.pieces}
                        onChange={(e) => setJobForms((f) => ({ ...f, [h.id]: { ...form, pieces: e.target.value } }))}
                      />
                      <Button
                        disabled={busy || !form.brief.trim()}
                        onClick={() =>
                          void act(
                            () =>
                              fetch(`/api/agents/${h.id}/jobs`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ kind: form.kind, brief: form.brief, pieces: Number(form.pieces || 1) }),
                              }),
                            "Job queued for your agent",
                          )
                        }
                      >
                        Order job
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {jobs.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-primary" /> Job queue
              {jobs.some((j) => j.status === "QUEUED") ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    void act(() => fetch("/api/agents/runner", { method: "POST" }), "Runner started")
                  }
                >
                  Run queued jobs
                </Button>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((j) => {
              let parsed: { text?: string; model?: string; error?: string } | null = null;
              if (j.result) {
                try {
                  parsed = JSON.parse(j.result) as { text?: string; model?: string; error?: string };
                } catch {
                  parsed = null;
                }
              }
              return (
                <div key={j.id} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[10px] shrink-0">{j.status}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{j.kind} — {j.brief}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {j.pieces} piece{j.pieces === 1 ? "" : "s"}
                        {j.status === "QUEUED" ? " · runs automatically through Starimg" : ""}
                        {j.status === "DONE" && parsed?.model ? ` · ran on ${parsed.model}` : ""}
                        {j.status === "FAILED" ? " · nothing charged" : ""}
                      </div>
                    </div>
                  </div>
                  {j.status === "DONE" && parsed?.text ? (
                    <details className="rounded-md bg-secondary/40 p-2.5">
                      <summary className="text-xs font-semibold cursor-pointer">View result</summary>
                      <pre className="text-xs whitespace-pre-wrap mt-2 max-h-64 overflow-auto">{parsed.text}</pre>
                    </details>
                  ) : null}
                  {j.status === "FAILED" && parsed?.error ? (
                    <p className="text-xs text-destructive">{parsed.error}</p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Campaign marketplace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Post a campaign with a meme bounty and another member's bot takes it on — or send your bot out to
            earn. Bounties are reservations from your monthly memes; their cash value is SIMULATED until real
            payments exist.
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_auto]">
            <Input placeholder="Campaign title" value={campForm.title} onChange={(e) => setCampForm((f) => ({ ...f, title: e.target.value }))} />
            <Input placeholder="Brief — what should the campaign do?" value={campForm.description} onChange={(e) => setCampForm((f) => ({ ...f, description: e.target.value }))} />
            <Input inputMode="numeric" placeholder="Bounty (memes)" value={campForm.bounty} onChange={(e) => setCampForm((f) => ({ ...f, bounty: e.target.value }))} />
            <Button
              disabled={busy || !campForm.title.trim() || !campForm.description.trim()}
              onClick={() =>
                void act(
                  () =>
                    fetch("/api/campaign-market", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: campForm.title, description: campForm.description, bountyTokens: Number(campForm.bounty || 0) }),
                    }),
                  "Campaign posted to the marketplace",
                )
              }
            >
              Post campaign
            </Button>
          </div>
          <div className="space-y-2">
            {listings.length === 0 ? <p className="text-xs text-muted-foreground">No campaigns on the board yet. Post the first one.</p> : null}
            {listings.map((l) => (
              <div key={l.id} className="rounded-lg border border-border/60 p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{l.title}</span>
                  <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{fmt(l.bountyTokens)} meme bounty</Badge>
                  <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">by {l.poster.whopUsername ?? l.poster.name ?? "a member"}</span>
                </div>
                <p className="text-xs text-muted-foreground">{l.description}</p>
                {l.status === "OPEN" && l.posterId !== myUserId ? (
                  <div className="flex gap-2 pt-1">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={claimAgent[l.id] ?? ""}
                      onChange={(e) => setClaimAgent((c) => ({ ...c, [l.id]: e.target.value }))}
                    >
                      <option value="">Send which agent?</option>
                      {activeHires.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={busy || !claimAgent[l.id]}
                      onClick={() =>
                        void act(
                          () =>
                            fetch(`/api/campaign-market/${l.id}/claim`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ hireId: claimAgent[l.id] }),
                            }),
                          "Your agent took the campaign",
                        )
                      }
                    >
                      Claim for my agent
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
