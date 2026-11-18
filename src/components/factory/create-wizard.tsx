"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Lightbulb,
  Loader2,
  Rocket,
  Search,
  Sparkles,
  FileText,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FORMAT_CATALOG, FORMAT_MAP, OBJECTIVES, TONES, CATEGORY_LABELS, type ContentCategory } from "@/lib/formats";
import { LANGUAGES, LANGUAGE_MAP } from "@/lib/languages";
import type { AnalyzeResponse, JobDTO, ProfileDTO, ResearchJobDTO } from "@/lib/types";
import { LangChip } from "./shared";
import { WaitExplainer, GENERATE_WAIT_SLIDES } from "./wait-explainer";

const STEPS = ["Source", "Objective", "Formats", "Languages", "Tone", "Generate"] as const;

type SourceTab = "url" | "description" | "idea";

interface SelectedFormat {
  category: ContentCategory;
  format: string;
}

export interface WizardResult {
  campaignId: string;
  jobId: string;
  name: string;
}

export function CreateWizard({
  onCompleted,
  initialProfile,
  initialProfileName,
}: {
  onCompleted: (result: WizardResult) => void;
  initialProfile?: ProfileDTO | null;
  initialProfileName?: string | null;
}) {
  const { toast } = useToast();

  const [step, setStep] = useState(initialProfile ? 1 : 0);
  const [sourceTab, setSourceTab] = useState<SourceTab>("url");
  const [sourceValue, setSourceValue] = useState("");
  const [brandName, setBrandName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);
  const researchPollRef = useRef<number | null>(null);
  const [analyzeMeta, setAnalyzeMeta] = useState<AnalyzeResponse | null>(null);

  useEffect(
    () => () => {
      if (researchPollRef.current !== null) window.clearInterval(researchPollRef.current);
    },
    [],
  );
  const [profile, setProfile] = useState<Partial<ProfileDTO>>(initialProfile ?? {});

  const [objective, setObjective] = useState<string>("");
  const [customObjective, setCustomObjective] = useState("");
  const [formats, setFormats] = useState<SelectedFormat[]>([]);
  const [langQuery, setLangQuery] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [tone, setTone] = useState<string>("");
  const [customTone, setCustomTone] = useState("");
  const [pieces, setPieces] = useState(2);
  const [campaignName, setCampaignName] = useState("");

  const [generating, setGenerating] = useState(false);
  const [job, setJob] = useState<JobDTO | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const estimate = formats.length * languages.length * pieces;

  const filteredLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter((l) => `${l.label} ${l.native} ${l.code}`.toLowerCase().includes(q));
  }, [langQuery]);

  async function analyze() {
    if (!sourceValue.trim()) {
      toast({ title: "Enter something to analyze first", variant: "destructive" });
      return;
    }
    // Website path = deep research: brand name + website are both
    // required, and the bridge runs from the Whoparmy server (slice 3).
    const useBrandMode = sourceTab === "url";
    if (useBrandMode && !brandName.trim()) {
      toast({ title: "Brand name is required for deep research", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setAnalyzeMeta(null);
    setAnalyzeElapsed(0);
    try {
      let json: AnalyzeResponse;
      if (useBrandMode) {
        // Deep research runs as a background job (~2 min) — start it,
        // then poll. The wizard needs the profile to proceed, so this
        // waits, but no single request hangs for minutes anymore.
        const startRes = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandName: brandName.trim(), website: sourceValue.trim() }),
        });
        const startJson = (await startRes.json()) as { job?: ResearchJobDTO; error?: string };
        if (!startRes.ok || !startJson.job) throw new Error(startJson.error ?? "Could not start research");
        json = startJson.job.result ?? (await waitForResearchJob(startJson.job.id));
      } else {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: sourceTab, value: sourceValue.trim() }),
        });
        const body = (await res.json()) as AnalyzeResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Analysis failed");
        json = body;
      }
      setProfile(json.profile);
      setAnalyzeMeta(json);
      setCampaignName(`${json.profile.name} Campaign`);
      // pre-select suggestions (respecting the differentiator: suggested languages)
      setLanguages((prev) => (prev.length ? prev : [json.profile.primaryLanguage, ...json.profile.suggestedLanguages].slice(0, 3)));
      setTone((prev) => prev || json.profile.suggestedTones[0] || "casual");
      if (json.note) toast({ title: "Heads up", description: json.note });
    } catch (err) {
      toast({ title: "Analysis failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  function waitForResearchJob(jobId: string): Promise<AnalyzeResponse> {
    return new Promise((resolve, reject) => {
      const timer = window.setInterval(async () => {
        try {
          const res = await fetch(`/api/research/${jobId}`);
          const json = (await res.json()) as { job?: ResearchJobDTO; error?: string };
          if (!res.ok || !json.job) throw new Error(json.error ?? "Could not read the research job");
          setAnalyzeElapsed(json.job.elapsedSec);
          if (json.job.status === "done" && json.job.result) {
            window.clearInterval(timer);
            if (researchPollRef.current === timer) researchPollRef.current = null;
            resolve(json.job.result);
          } else if (json.job.status === "failed") {
            window.clearInterval(timer);
            if (researchPollRef.current === timer) researchPollRef.current = null;
            reject(new Error(json.job.error ?? "Deep research failed. Please try again."));
          }
        } catch {
          // Transient poll failure — keep waiting; the server-side
          // sweep fails anything genuinely stuck.
        }
      }, 4000);
      researchPollRef.current = timer;
    });
  }

  function toggleFormat(category: ContentCategory, key: string) {
    setFormats((prev) =>
      prev.some((f) => f.format === key) ? prev.filter((f) => f.format !== key) : [...prev, { category, format: key }],
    );
  }

  function toggleLanguage(code: string) {
    setLanguages((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function generate() {
    if (!profile.name || !profile.description) {
      toast({ title: "Business profile missing", variant: "destructive" });
      setStep(0);
      return;
    }
    setGenerating(true);
    try {
      const fullProfile: ProfileDTO = {
        name: profile.name,
        industry: profile.industry,
        description: profile.description,
        products: profile.products ?? [],
        audience: profile.audience,
        sellingPoints: profile.sellingPoints ?? [],
        differentiators: profile.differentiators ?? [],
        website: profile.website,
        primaryLanguage: profile.primaryLanguage ?? languages[0] ?? "en",
        suggestedLanguages: profile.suggestedLanguages ?? [],
        suggestedTones: profile.suggestedTones ?? [],
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName.trim() || `${fullProfile.name} Campaign`,
          sourceType: analyzeMeta ? (sourceTab === "url" ? "URL" : sourceTab === "idea" ? "IDEA" : "DESCRIPTION") : "BRAND",
          profile: fullProfile,
          objective: objective || "customers",
          customObjective,
          tone: tone || "custom",
          customTone,
          languages,
          formats,
          piecesPerFormat: pieces,
        }),
      });
      const json = (await res.json()) as { jobId?: string; campaignId?: string; error?: string; duplicate?: boolean };
      if (!res.ok || !json.jobId || !json.campaignId) throw new Error(json.error ?? "Failed to start generation");

      if (json.duplicate) {
        toast({ title: "Already generating", description: "Picked up your in-flight campaign instead of creating a duplicate." });
      }

      setJob({ id: json.jobId, campaignId: json.campaignId, status: "QUEUED", total: estimate, done: 0, failed: 0 });
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/generate/${json.jobId}`);
          const j = await r.json();
          if (r.ok) {
            setJob(j.job as JobDTO);
            if (j.job.status === "COMPLETE" || j.job.status === "FAILED") {
              if (pollRef.current) clearInterval(pollRef.current);
              setTimeout(
                () => onCompleted({ campaignId: json.campaignId!, jobId: json.jobId!, name: campaignName }),
                600,
              );
            }
          }
        } catch {
          // transient poll errors are retried on next tick
        }
      }, 1500);
    } catch (err) {
      toast({ title: "Generation failed to start", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setGenerating(false);
    }
  }

  const canNext = (s: number): boolean => {
    switch (s) {
      case 0:
        return Boolean(profile.name && profile.description);
      case 1:
        return Boolean(objective || customObjective.trim());
      case 2:
        return formats.length > 0;
      case 3:
        return languages.length > 0;
      case 4:
        return Boolean(tone || customTone.trim());
      default:
        return true;
    }
  };

  if (generating && job) {
    const pct = job.total > 0 ? Math.round(((job.done + job.failed) / job.total) * 100) : 5;
    return (
      <div className="rounded-2xl border bg-card p-8 sm:p-12 max-w-2xl mx-auto text-center stage-light">
        <div className="mx-auto rounded-2xl bg-primary/10 ember-glow p-4 w-fit mb-6">
          <Rocket className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Your content engine is running</h2>
        <p className="text-muted-foreground mt-2">
          Generating <span className="text-foreground font-semibold">{estimate} pieces</span> across{" "}
          <span className="text-foreground font-semibold">{languages.length} languages</span> — real generation, not placeholders.
        </p>
        <div className="mt-8 mb-3">
          <Progress value={pct} className="h-2.5" />
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {job.currentStep ?? "Warming up the engine…"} ({job.done + job.failed}/{job.total})
        </div>
        {job.failed > 0 ? (
          <div className="mt-4 text-xs text-amber-400 flex items-center justify-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {job.failed} failed so far — failed pieces are never charged.
          </div>
        ) : null}
        {/* Walk the member through the wait (Dave, 2026-11-17):
            what's happening, what memes do, what happens next. */}
        <div className="mt-8">
          <WaitExplainer slides={GENERATE_WAIT_SLIDES} />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground" aria-label="What happens next">
          <div className="rounded-lg bg-secondary/40 px-2 py-2.5">
            <span className="block font-bold text-foreground text-xs">1 · The engine builds</span>
            Your pack, every format × language
          </div>
          <div className="rounded-lg bg-secondary/40 px-2 py-2.5">
            <span className="block font-bold text-foreground text-xs">2 · You review</span>
            Preview, download, regenerate in the workspace
          </div>
          <div className="rounded-lg bg-secondary/40 px-2 py-2.5">
            <span className="block font-bold text-foreground text-xs">3 · It spreads</span>
            Post it, or hand it to your bots and your army
          </div>
        </div>
        <Button variant="ghost" className="mt-8" onClick={() => onCompleted({ campaignId: job.campaignId, jobId: job.id, name: campaignName })}>
          View workspace now
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* step rail */}
      <div className="flex items-center gap-1 sm:gap-2 mb-8 overflow-x-auto scrollbar-thin pb-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-primary/15 text-primary hover:bg-primary/25"
                  : "bg-secondary/60 text-muted-foreground",
            )}
          >
            <span className={cn("rounded-full w-4.5 h-4.5 grid place-items-center text-[10px] font-bold", i === step ? "bg-primary-foreground/20" : i < step ? "bg-primary/25" : "bg-muted")}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* STEP 0 — SOURCE */}
      {step === 0 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">What are we promoting?</h2>
            <p className="text-muted-foreground text-sm mt-1">Start with your brand name and website — P&R deep research reads your site and the web, and builds the profile. (Description and idea still work as fallbacks.)</p>
          </div>

          {initialProfile ? (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-center gap-3 text-sm">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>
                Loaded from brand profile: <b>{initialProfileName}</b>. You can still edit anything below.
              </span>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "url", label: "Brand + Website", icon: Globe, hint: "Deep research" },
                { key: "description", label: "Description", icon: FileText, hint: "Paste your copy" },
                { key: "idea", label: "Start with an Idea", icon: Lightbulb, hint: "Just a concept" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setSourceTab(t.key)}
                className={cn(
                  "rounded-xl border p-3 sm:p-4 text-left transition-all hover:border-primary/50",
                  sourceTab === t.key ? "border-primary bg-primary/10" : "bg-card",
                )}
              >
                <t.icon className={cn("h-5 w-5 mb-2", sourceTab === t.key ? "text-primary" : "text-muted-foreground")} />
                <div className="text-sm font-semibold leading-tight">{t.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {sourceTab === "url" ? (
              <div className="grid gap-2 flex-1">
                <Input
                  placeholder="Brand name (required)"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="h-12 text-base"
                />
                <Input
                  placeholder="https://yourbusiness.com"
                  value={sourceValue}
                  onChange={(e) => setSourceValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && analyze()}
                  inputMode="url"
                  className="h-12 text-base"
                />
              </div>
            ) : (
              <Textarea
                placeholder={
                  sourceTab === "description"
                    ? "Describe your business, product or offer…"
                    : "e.g. A subscription box of hot sauce for people who love extreme heat…"
                }
                value={sourceValue}
                onChange={(e) => setSourceValue(e.target.value)}
                rows={4}
                className="text-base"
              />
            )}
            <Button size="lg" className="h-12 sm:w-44 shrink-0" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {analyzing ? `Researching…${analyzeElapsed ? ` ${analyzeElapsed}s` : ""}` : "Analyze business"}
            </Button>
          </div>

          {profile.name ? (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/15 text-primary border-0 hover:bg-primary/15">
                    <Sparkles className="h-3 w-3 mr-1" /> Business Profile
                  </Badge>
                  {analyzeMeta ? (
                    <Badge variant="outline" className={analyzeMeta.researched ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>
                      {analyzeMeta.researched ? "Live research" : "Unverified — please edit"}
                    </Badge>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setProfile({}); setAnalyzeMeta(null); }}>
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
              {analyzeMeta?.research ? (
                <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 grid gap-2 text-sm">
                  <p className="font-medium">What P&R knows about this brand</p>
                  {analyzeMeta.research.analysisSummary ? (
                    <p className="text-muted-foreground">{analyzeMeta.research.analysisSummary}</p>
                  ) : null}
                  {analyzeMeta.research.pains.length ? (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Customer pains: </span>
                      {analyzeMeta.research.pains.join(" · ")}
                    </p>
                  ) : null}
                  {analyzeMeta.research.angles.length ? (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Angles that land: </span>
                      {analyzeMeta.research.angles.join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-3">
                <LabeledInput label="Business name" value={profile.name ?? ""} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} />
                <LabeledInput label="Industry" value={profile.industry ?? ""} onChange={(v) => setProfile((p) => ({ ...p, industry: v }))} />
              </div>
              <LabeledArea
                label="Description"
                value={profile.description ?? ""}
                onChange={(v) => setProfile((p) => ({ ...p, description: v }))}
                rows={3}
              />
              <LabeledInput
                label="Products / services (comma separated)"
                value={(profile.products ?? []).join(", ")}
                onChange={(v) => setProfile((p) => ({ ...p, products: v.split(",").map((s) => s.trim()).filter(Boolean) }))}
              />
              <LabeledInput label="Target audience" value={profile.audience ?? ""} onChange={(v) => setProfile((p) => ({ ...p, audience: v }))} />
              <LabeledInput
                label="Selling points (comma separated)"
                value={(profile.sellingPoints ?? []).join(", ")}
                onChange={(v) => setProfile((p) => ({ ...p, sellingPoints: v.split(",").map((s) => s.trim()).filter(Boolean) }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* STEP 1 — OBJECTIVE */}
      {step === 1 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Choose your campaign objective</h2>
            <p className="text-muted-foreground text-sm mt-1">This shapes every hook, angle and CTA.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {OBJECTIVES.map((o) => (
              <button
                key={o.key}
                onClick={() => { setObjective(o.key); setCustomObjective(""); }}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all hover:border-primary/50 hover:-translate-y-0.5",
                  objective === o.key && !customObjective ? "border-primary bg-primary/10 ember-glow" : "bg-card",
                )}
              >
                <div className="text-sm font-semibold">{o.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{o.blurb}</div>
              </button>
            ))}
          </div>
          <Input
            placeholder="Custom objective — describe your own goal"
            value={customObjective}
            onChange={(e) => { setCustomObjective(e.target.value); if (e.target.value) setObjective(""); }}
          />
        </div>
      ) : null}

      {/* STEP 2 — FORMATS */}
      {step === 2 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Choose content formats</h2>
            <p className="text-muted-foreground text-sm mt-1">Pick as many as you want. {formats.length} selected.</p>
          </div>
          {FORMAT_CATALOG.reduce<ContentCategory[]>((cats, f) => (cats.includes(f.category) ? cats : [...cats, f.category]), []).map(
            (cat) => (
              <div key={cat} className="rounded-xl border bg-card p-4">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_CATALOG.filter((f) => f.category === cat).map((f) => {
                    const active = formats.some((x) => x.format === f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() => toggleFormat(cat, f.key)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs sm:text-sm font-medium transition-all",
                          active ? "border-primary bg-primary/15 text-primary" : "bg-secondary/40 hover:border-primary/40",
                        )}
                      >
                        {active ? <Check className="inline h-3 w-3 mr-1" /> : null}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}

      {/* STEP 3 — LANGUAGES */}
      {step === 3 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Select languages</h2>
            <p className="text-muted-foreground text-sm mt-1">
              23 markets. Content is <b className="text-foreground">culturally adapted</b> — native copywriting, never word-for-word translation.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search languages…" value={langQuery} onChange={(e) => setLangQuery(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLanguages(LANGUAGES.map((l) => l.code))}>Select all</Button>
              <Button variant="outline" size="sm" onClick={() => setLanguages([])}>Clear</Button>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3 flex items-center gap-2 flex-wrap min-h-12">
            {languages.length === 0 ? (
              <span className="text-xs text-muted-foreground">No languages selected yet — the first one you pick becomes the primary.</span>
            ) : (
              <>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Primary:</span>
                <LangChip code={languages[0]} label={LANGUAGE_MAP[languages[0]]?.label} />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground mx-1">Also:</span>
                {languages.slice(1).map((c) => (
                  <LangChip key={c} code={c} label={LANGUAGE_MAP[c]?.label} />
                ))}
              </>
            )}
          </div>
          <ScrollArea className="h-72 rounded-xl border bg-card">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 p-2 gap-1">
              {filteredLanguages.map((l) => {
                const active = languages.includes(l.code);
                const idx = languages.indexOf(l.code);
                return (
                  <button
                    key={l.code}
                    onClick={() => toggleLanguage(l.code)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      active ? "bg-primary/15 text-primary" : "hover:bg-secondary/60",
                    )}
                  >
                    <span aria-hidden>{l.flag}</span>
                    <span className="truncate">{l.label}</span>
                    {idx === 0 ? <Badge className="ml-auto bg-primary/20 text-primary text-[9px] border-0 h-4 px-1">PRIMARY</Badge> : null}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : null}

      {/* STEP 4 — TONE */}
      {step === 4 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Choose your tone</h2>
            <p className="text-muted-foreground text-sm mt-1">One voice, 23 markets.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {TONES.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTone(t.key); setCustomTone(""); }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all hover:border-primary/50",
                  tone === t.key && !customTone ? "border-primary bg-primary/10" : "bg-card",
                )}
              >
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.hint}</div>
              </button>
            ))}
          </div>
          <Input
            placeholder="Custom tone — e.g. 'conspiratorial barista energy'"
            value={customTone}
            onChange={(e) => { setCustomTone(e.target.value); if (e.target.value) setTone(""); }}
          />
        </div>
      ) : null}

      {/* STEP 5 — REVIEW & GENERATE */}
      {step === 5 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Review & generate</h2>
            <p className="text-muted-foreground text-sm mt-1">One click sends the whole brief to the P&R engine.</p>
          </div>
          <div className="rounded-xl border bg-card divide-y divide-border">
            <ReviewRow label="Business" value={profile.name ?? "—"} />
            <ReviewRow label="Objective" value={customObjective || OBJECTIVES.find((o) => o.key === objective)?.label || "—"} />
            <ReviewRow
              label="Formats"
              value={formats.map((f) => FORMAT_MAP[f.format]?.label ?? f.format).join(", ") || "—"}
            />
            <ReviewRow
              label="Languages"
              value={languages.map((c) => LANGUAGE_MAP[c]?.label ?? c).join(", ") || "—"}
            />
            <ReviewRow label="Tone" value={customTone || TONES.find((t) => t.key === tone)?.label || "—"} />
            <div className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Pieces to generate</div>
                <div className="text-2xl font-bold text-primary">{estimate}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Per format/language:</span>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPieces(n)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-semibold transition-colors",
                      pieces === n ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Campaign name</label>
              <Input className="mt-1.5" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder={`${profile.name ?? "New"} Campaign`} />
            </div>
          </div>
          <Button size="lg" className="w-full h-14 text-base font-bold tracking-wide ember-glow" onClick={generate}>
            <Rocket className="h-5 w-5" /> GENERATE MY CONTENT
          </Button>
        </div>
      ) : null}

      {/* nav */}
      {!generating ? (
        <div className="flex items-center justify-between mt-8">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext(step)}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function LabeledArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <Textarea className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
