"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Wallet, Pause, Play, Store, Briefcase, ListOrdered, Zap, Send, Brain, Download, Sparkles, Activity, FileSearch, Wrench, Settings2, LayoutGrid, Hammer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useTranslations, useLocale } from "next-intl";
import { LANGUAGES, isSupportedLanguage } from "@/lib/languages";
import type { AgentTemplate } from "@/lib/agents";
import { BrandedBotCard } from "@/components/factory/branded-bot-card";

interface Hire {
  id: string;
  templateKey: string;
  name: string;
  tokenBudget: number;
  tokensUsed: number;
  status: string;
  source?: string;
  expiresAt?: string | null;
  agent37Ref: string | null;
  role?: string | null;
  instructions?: string | null;
  toolsJson?: string | null;
}

interface TrafficPool {
  total: number;
  used: number;
  remaining: number;
  placements: Array<{ partner: string; partnerName: string; url: string | null }>;
}

interface FactoryToolView {
  id: string;
  label: string;
  kind: string;
}

interface ArchitectConfigView {
  name: string;
  role: string;
  instructions: string;
  tools: FactoryToolView[];
  toolsJson: string;
  defaultKind: string;
  successMetric: string;
  summary: string;
}

interface ResearchView {
  brandName?: string;
  website?: string | null;
  analysisSummary?: string;
  offer?: string;
  audience?: string;
  pains?: string[];
  angles?: string[];
  competitors?: string[];
}

const KIND_LABELS: Record<string, string> = {
  SCOUT: "Scout report",
  MEME: "Meme pack",
  HOOK: "Hooks",
  QA: "QA pass",
  CAMPAIGN: "Campaign pack",
  VIDEO: "Video (engine)",
  ASSESS: "Assessment offer (bridge)",
  CUSTOM: "Custom job (its own instructions)",
};

function hireTools(h: Hire): FactoryToolView[] {
  if (!h.toolsJson) return [];
  try {
    const parsed = JSON.parse(h.toolsJson) as FactoryToolView[];
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.id === "string") : [];
  } catch {
    return [];
  }
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
  const uiLocale = useLocale();
  // Job output defaults to the member's UI language when it's one of the
  // 23 content languages; the job form lets them pick any other.
  const defaultJobLanguage = isSupportedLanguage(uiLocale) ? uiLocale : "en";
  const [planInfo, setPlanInfo] = useState<{ name: string; price: string; botsRented: number; memesUsed: number; memesLimit: number } | null>(null);
  const [catalog, setCatalog] = useState<AgentTemplate[]>([]);
  const [hires, setHires] = useState<Hire[]>([]);
  const [trafficPools, setTrafficPools] = useState<Record<string, TrafficPool>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [myUserId, setMyUserId] = useState<string>("");
  const [jobForms, setJobForms] = useState<Record<string, { kind: string; brief: string; pieces: string; language: string }>>({});
  const [campForm, setCampForm] = useState({ title: "", description: "", bounty: "100" });
  const [claimAgent, setClaimAgent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // SMB Agent Factory (2026-11-18): research for the control center,
  // the architect creator, per-agent tabs, and the memory view.
  const [research, setResearch] = useState<ResearchView | null>(null);
  const [archForm, setArchForm] = useState({ brief: "", website: "" });
  const [archBusy, setArchBusy] = useState(false);
  const [archConfig, setArchConfig] = useState<ArchitectConfigView | null>(null);
  const [archResearched, setArchResearched] = useState(false);
  const [hireTabs, setHireTabs] = useState<Record<string, string>>({});
  const [memoryFacts, setMemoryFacts] = useState<string[] | null>(null);
  const [settingsForms, setSettingsForms] = useState<Record<string, { name: string; role: string; instructions: string }>>({});

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([fetch("/api/agents"), fetch("/api/campaign-market")]);
    if (a.ok) {
      const d = await a.json();
      setPlanInfo(d.plan);
      setCatalog(d.catalog);
      setHires(d.hires);
      setJobs(d.jobs);
      setResearch(d.research ?? null);
      setTrafficPools(d.trafficPools ?? {});
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

  async function runArchitect() {
    setArchBusy(true);
    try {
      const res = await fetch("/api/agents/architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: archForm.brief, website: archForm.website || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The architect couldn't design that agent");
      setArchConfig(data.config as ArchitectConfigView);
      setArchResearched(!!data.researched);
    } catch (err) {
      toast({ title: "That didn't work", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setArchBusy(false);
    }
  }

  async function installArchitectAgent() {
    if (!archConfig) return;
    await act(
      () =>
        fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateKey: "custom",
            name: archConfig.name,
            role: archConfig.role,
            instructions: archConfig.instructions,
            toolsJson: archConfig.toolsJson,
          }),
        }),
      `${archConfig.name} installed — it's on your team`,
    );
    setArchConfig(null);
    setArchForm({ brief: "", website: "" });
  }

  // Memory is per-member and shared by every agent — load it once,
  // the first time any agent's Memory tab opens.
  const anyMemoryTabOpen = Object.values(hireTabs).some((t) => t === "memory");
  useEffect(() => {
    if (!anyMemoryTabOpen || memoryFacts !== null) return;
    void (async () => {
      try {
        const res = await fetch("/api/memory/view");
        const data = await res.json().catch(() => ({}));
        setMemoryFacts(Array.isArray(data.facts) ? (data.facts as string[]) : []);
      } catch {
        setMemoryFacts([]);
      }
    })();
  }, [anyMemoryTabOpen, memoryFacts]);

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

      {/* Control-center roll-up (Factory Slice B) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        {[
          { n: hires.filter((h) => h.status === "ACTIVE").length, label: "Agents active" },
          { n: jobs.filter((j) => j.status === "QUEUED" || j.status === "RUNNING").length, label: "Jobs running / queued" },
          { n: jobs.filter((j) => j.status === "DONE").length, label: "Jobs finished" },
          { n: jobs.filter((j) => j.status === "FAILED").length, label: "Jobs failed (never charged)" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-lg font-black">{s.n}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── BUILD YOUR AI EMPLOYEE (Factory Slice A) ─── */}
      <Card className="border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Build Your AI Employee
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Describe the job in plain English. The architect researches your business, designs the agent —
            its role, instructions and tools — and shows you the whole thing before anything is installed.
            No AI knowledge needed.
          </p>
          <textarea
            className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder='e.g. "I own a roofing company. I want an agent that finds commercial roofing opportunities and drafts the outreach for my approval."'
            value={archForm.brief}
            onChange={(e) => setArchForm((f) => ({ ...f, brief: e.target.value }))}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              className="flex-1"
              placeholder="Your business website (optional — the architect researches it)"
              value={archForm.website}
              onChange={(e) => setArchForm((f) => ({ ...f, website: e.target.value }))}
            />
            <Button disabled={archBusy || archForm.brief.trim().length < 10} onClick={() => void runArchitect()}>
              <Hammer className="h-4 w-4 mr-1.5" /> {archBusy ? "Designing your agent…" : "Build my agent"}
            </Button>
          </div>
          {archBusy ? (
            <p className="text-[11px] text-muted-foreground">Researching and designing can take a minute when a website is included.</p>
          ) : null}
          {archConfig ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-black text-base">Your agent is ready — {archConfig.name}</span>
                <Badge className="bg-primary/15 text-primary border-0 text-[10px]">ONE-CLICK INSTALL</Badge>
              </div>
              <p className="text-sm">{archConfig.summary}</p>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What it does</div>
                <p className="text-sm text-muted-foreground">{archConfig.role}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Capabilities</div>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  {archConfig.tools.map((t) => (
                    <li key={t.id}>{t.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">How it runs</div>
                <p className="text-sm text-muted-foreground">
                  Whoparmy agent runner · Mnemos business memory (shared with your other agents) ·{" "}
                  {archResearched ? "designed from live research on your business · " : ""}P&R creative engine
                  where its tools call for it. It fills one of your plan&apos;s bot seats. Everything it makes is
                  a draft for your approval — it never publishes, sends or spends on its own.
                </p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">You&apos;ll know it&apos;s working when</div>
                <p className="text-sm text-muted-foreground">{archConfig.successMetric}</p>
              </div>
              <details>
                <summary className="text-xs font-semibold cursor-pointer">Its standing instructions</summary>
                <pre className="text-xs whitespace-pre-wrap mt-2 max-h-48 overflow-auto rounded-md bg-secondary/40 p-2.5">{archConfig.instructions}</pre>
              </details>
              <div className="flex gap-2 flex-wrap">
                <Button disabled={busy} onClick={() => void installArchitectAgent()}>
                  Install agent
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setArchConfig(null)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <BrandedBotCard />

      {/* One-click memory export (Dave, 2026-11-18): members own
          their memory — one click downloads everything the house
          store holds for them as an Obsidian-ready markdown file. */}
      <div className="rounded-2xl border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center shrink-0">
          <Brain className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">Your memory is yours</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Everything your agents remember about your business, in one file — yours to keep, correct, and
            take anywhere. It drops straight into Obsidian, and it&apos;s the seed for your own memory stack.
          </p>
        </div>
        <a
          href="/api/memory/export"
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shrink-0 inline-flex items-center gap-1.5 justify-center"
        >
          <Download className="h-4 w-4" /> Export my memory
        </a>
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
                <div className="text-lg font-black">{planInfo.botsRented}</div>
                <div className="text-[11px] text-muted-foreground">Agents on your floor — no seat limit</div>
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
          {catalog.filter((t) => t.key !== "custom").map((t) => (
            <div key={t.key} className="rounded-lg border border-border/60 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{t.name}</span>
                <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{tA("tierSuffix", { tier: t.tierKey })}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t.role}</p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={busy}
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
          <a
            href="https://t.me/thewhoppbot"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
          >
            <Send className="h-3.5 w-3.5" /> Questions first? Ask our Whop bot on Telegram
          </a>
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
              const template = catalog.find((c) => c.key === h.templateKey);
              const tools = hireTools(h);
              const form = jobForms[h.id] ?? { kind: template?.defaultKind ?? (h.templateKey === "assessor" ? "ASSESS" : "MEME"), brief: "", pieces: "1", language: defaultJobLanguage };
              const kindOptions: string[] =
                tools.length > 0
                  ? [...new Set([...tools.map((t) => t.kind), ...(h.instructions ? ["CUSTOM"] : [])])]
                  : ["SCOUT", "MEME", "HOOK", "QA", "CAMPAIGN", "VIDEO", "ASSESS", ...(h.instructions ? ["CUSTOM"] : [])];
              const effectiveKind = kindOptions.includes(form.kind) ? form.kind : kindOptions[0];
              const tab = hireTabs[h.id] ?? "overview";
              const hireJobs = jobs.filter((j) => j.hireId === h.id);
              const settings = settingsForms[h.id] ?? { name: h.name, role: h.role ?? "", instructions: h.instructions ?? "" };
              return (
                <div key={h.id} className="rounded-lg border border-border/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold">{h.name}</span>
                    <div className="flex items-center gap-2">
                      {h.source === "REFERRAL" ? (
                        <Badge className="bg-amber-500/15 text-amber-500 border-0 text-[10px]">
                          REFERRAL BOT{h.expiresAt ? ` · until ${new Date(h.expiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
                        </Badge>
                      ) : null}
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
                  {trafficPools[h.id] ? (
                    <div className="text-[11px] text-muted-foreground">
                      Traffic pool today: {trafficPools[h.id].used} of {trafficPools[h.id].total} slots used
                      {trafficPools[h.id].placements.length > 0
                        ? ` · rotating: ${trafficPools[h.id].placements.map((p) => p.partnerName).join(", ")}`
                        : ""}
                    </div>
                  ) : null}
                  {h.status === "ACTIVE" ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={effectiveKind}
                        onChange={(e) => setJobForms((f) => ({ ...f, [h.id]: { ...form, kind: e.target.value } }))}
                      >
                        {kindOptions.map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABELS[k] ?? k}
                            {k === "VIDEO" ? " — brief = topic, or JSON {format,…}" : ""}
                            {k === "ASSESS" ? " — your Muse makes the /before pack on your key" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={form.language}
                        onChange={(e) => setJobForms((f) => ({ ...f, [h.id]: { ...form, language: e.target.value } }))}
                        aria-label="Output language"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.native}
                          </option>
                        ))}
                      </select>
                      <Input
                        className="flex-1"
                        placeholder={effectiveKind === "ASSESS" ? "Your business website — the Assessor hands it to your Muse through the bridge" : "Brief — what should the agent make?"}
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
                                body: JSON.stringify({ kind: effectiveKind, brief: form.brief, pieces: Number(form.pieces || 1), language: form.language }),
                              }),
                            "Job queued for your agent",
                          )
                        }
                      >
                        Order job
                      </Button>
                    </div>
                  ) : null}

                  {/* ─── Agent control center tabs (Factory Slice B) ─── */}
                  <div className="border-t border-border/60 pt-3 space-y-3">
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { id: "overview", label: "Overview", icon: LayoutGrid },
                        { id: "activity", label: "Activity", icon: Activity },
                        { id: "research", label: "Research", icon: FileSearch },
                        { id: "memory", label: "Memory", icon: Brain },
                        { id: "tools", label: "Tools", icon: Wrench },
                        { id: "settings", label: "Settings", icon: Settings2 },
                      ].map((t) => (
                        <button
                          key={t.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground"}`}
                          onClick={() => setHireTabs((s) => ({ ...s, [h.id]: t.id }))}
                        >
                          <t.icon className="h-3 w-3" /> {t.label}
                        </button>
                      ))}
                    </div>

                    {tab === "overview" ? (
                      <div className="space-y-2 text-sm">
                        <p className="text-muted-foreground">{h.role ?? template?.role ?? "A rented bot on your team."}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {hireJobs.filter((j) => j.status === "DONE").length} jobs finished ·{" "}
                          {hireJobs.filter((j) => j.status === "FAILED").length} failed (never charged) ·{" "}
                          {hireJobs[0] ? `last job ${new Date(hireJobs[0].createdAt).toLocaleDateString()}` : "no jobs yet"}
                        </p>
                        {h.instructions ? (
                          <details>
                            <summary className="text-xs font-semibold cursor-pointer">Standing instructions</summary>
                            <pre className="text-xs whitespace-pre-wrap mt-2 max-h-48 overflow-auto rounded-md bg-secondary/40 p-2.5">{h.instructions}</pre>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    {tab === "activity" ? (
                      <div className="space-y-2">
                        {hireJobs.length === 0 ? <p className="text-xs text-muted-foreground">No jobs yet — order one above.</p> : null}
                        {hireJobs.map((j) => {
                          let parsed: { text?: string; error?: string } | null = null;
                          if (j.result) {
                            try {
                              parsed = JSON.parse(j.result) as { text?: string; error?: string };
                            } catch {
                              parsed = null;
                            }
                          }
                          return (
                            <div key={j.id} className="rounded-md border border-border/60 p-2.5 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
                                <span className="text-xs font-medium truncate">{KIND_LABELS[j.kind] ?? j.kind} — {j.brief}</span>
                              </div>
                              {j.status === "DONE" && parsed?.text ? (
                                <details>
                                  <summary className="text-xs font-semibold cursor-pointer">View result</summary>
                                  <pre className="text-xs whitespace-pre-wrap mt-2 max-h-56 overflow-auto">{parsed.text}</pre>
                                </details>
                              ) : null}
                              {j.status === "FAILED" && parsed?.error ? <p className="text-xs text-destructive">{parsed.error}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {tab === "research" ? (
                      research ? (
                        <div className="space-y-1.5 text-sm">
                          <p className="font-semibold">{research.brandName ?? "Your business"}{research.website ? <span className="text-muted-foreground font-normal"> — {research.website}</span> : null}</p>
                          {research.analysisSummary ? <p className="text-muted-foreground">{research.analysisSummary}</p> : null}
                          {research.offer ? <p className="text-muted-foreground"><span className="font-semibold text-foreground">Offer:</span> {research.offer}</p> : null}
                          {research.audience ? <p className="text-muted-foreground"><span className="font-semibold text-foreground">Audience:</span> {research.audience}</p> : null}
                          {research.pains?.length ? <p className="text-muted-foreground"><span className="font-semibold text-foreground">Customer pains:</span> {research.pains.join("; ")}</p> : null}
                          {research.angles?.length ? <p className="text-muted-foreground"><span className="font-semibold text-foreground">Angles:</span> {research.angles.join("; ")}</p> : null}
                          {research.competitors?.length ? <p className="text-muted-foreground"><span className="font-semibold text-foreground">Competitors:</span> {research.competitors.join(", ")}</p> : null}
                          <p className="text-[11px] text-muted-foreground">Every agent on your team works from this same research.</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No business research yet. Run a brand research from the Create view and every agent here will work from what it finds.</p>
                      )
                    ) : null}

                    {tab === "memory" ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          One shared business memory (Mnemos) for your whole team — not one per bot.{" "}
                          <a href="/api/memory/export" className="text-primary underline underline-offset-2">Export it as a file</a>
                        </p>
                        {memoryFacts === null ? (
                          <p className="text-xs text-muted-foreground">Loading memory…</p>
                        ) : memoryFacts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nothing stored yet — tell Ralph about your business and it lands here.</p>
                        ) : (
                          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                            {memoryFacts.slice(0, 30).map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}

                    {tab === "tools" ? (
                      tools.length > 0 ? (
                        <ul className="space-y-1.5">
                          {tools.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 text-sm">
                              <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{KIND_LABELS[t.kind] ?? t.kind}</Badge>
                              <span>{t.label}</span>
                            </li>
                          ))}
                          <li className="text-[11px] text-muted-foreground">Plus Mnemos memory and your business research. Publishing and sending are never tools — those stay with your approval.</li>
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">This bot runs the standard job kinds from the order form above, on the P&R engine, with your business research and memory behind it.</p>
                      )
                    ) : null}

                    {tab === "settings" ? (
                      <div className="space-y-2">
                        <Input
                          placeholder="Agent name"
                          value={settings.name}
                          onChange={(e) => setSettingsForms((s) => ({ ...s, [h.id]: { ...settings, name: e.target.value } }))}
                        />
                        <Input
                          placeholder="Role — what this agent does, in plain words"
                          value={settings.role}
                          onChange={(e) => setSettingsForms((s) => ({ ...s, [h.id]: { ...settings, role: e.target.value } }))}
                        />
                        <textarea
                          className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="Standing instructions — a custom job runs on these"
                          value={settings.instructions}
                          onChange={(e) => setSettingsForms((s) => ({ ...s, [h.id]: { ...settings, instructions: e.target.value } }))}
                        />
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                fetch(`/api/agents/${h.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: settings.name, role: settings.role, instructions: settings.instructions }),
                                }),
                              "Agent settings saved",
                            )
                          }
                        >
                          Save settings
                        </Button>
                        <p className="text-[11px] text-muted-foreground">Pause and resume live in the header above. There is no schedule yet — agents run when you order a job.</p>
                      </div>
                    ) : null}
                  </div>
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
