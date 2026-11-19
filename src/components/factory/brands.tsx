"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Globe, Loader2, Megaphone, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";
import type { AnalyzeResponse, BrandDTO, ResearchJobDTO, ResearchSummary } from "@/lib/types";
import { EmptyState, LangChip, SectionHeader } from "./shared";
import { WaitExplainer, RESEARCH_WAIT_SLIDES } from "./wait-explainer";

interface BrandForm {
  name: string;
  website: string;
  industry: string;
  description: string;
  products: string;
  audience: string;
  voice: string;
  cta: string;
  links: string;
  languages: string[];
}

const EMPTY_FORM: BrandForm = {
  name: "",
  website: "",
  industry: "",
  description: "",
  products: "",
  audience: "",
  voice: "",
  cta: "",
  links: "",
  languages: ["en"],
};

function formFromBrand(b: BrandDTO): BrandForm {
  return {
    name: b.name,
    website: b.website ?? "",
    industry: b.industry ?? "",
    description: b.description ?? "",
    products: b.products ?? "",
    audience: b.audience ?? "",
    voice: b.voice ?? "",
    cta: b.cta ?? "",
    links: b.links ?? "",
    languages: b.languages.length ? b.languages : ["en"],
  };
}

export function BrandsView({
  onBriefAgents,
}: {
  onBriefAgents: () => void;
}) {
  const { toast } = useToast();
  const [brands, setBrands] = useState<BrandDTO[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BrandDTO | null>(null);
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrandDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [research, setResearch] = useState<ResearchSummary | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchElapsed, setResearchElapsed] = useState(0);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load brands");
      setBrands(json.brands as BrandDTO[]);
    } catch (err) {
      toast({
        title: "Could not load brand profiles",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    stopPolling();
    setResearching(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setResearch(null);
    setDialogOpen(true);
  }

  function stopPolling() {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  function applyResearchResult(json: AnalyzeResponse) {
    const p = json.profile;
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      industry: p.industry ?? f.industry,
      description: p.description || f.description,
      products: p.products.length ? p.products.join(", ") : f.products,
      audience: p.audience ?? f.audience,
      voice: json.research?.voice ? json.research.voice.slice(0, 400) : f.voice,
      languages: p.suggestedLanguages?.length ? p.suggestedLanguages : f.languages,
    }));
    setResearch(json.research ?? null);
    toast({
      title: json.research ? "Deep research complete" : "Profile built from a standard scan",
      description: json.research ? "Here's what P&R knows about your brand — review and save." : json.note,
    });
  }

  function pollJob(jobId: string) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/research/${jobId}`);
        const json = (await res.json()) as { job?: ResearchJobDTO; error?: string };
        if (!res.ok || !json.job) throw new Error(json.error ?? "Could not read the research job");
        setResearchElapsed(json.job.elapsedSec);
        if (json.job.status === "done" && json.job.result) {
          stopPolling();
          setResearching(false);
          applyResearchResult(json.job.result);
        } else if (json.job.status === "failed") {
          stopPolling();
          setResearching(false);
          toast({
            title: "Deep research failed",
            description: json.job.error ?? "Please try again.",
            variant: "destructive",
          });
        }
      } catch {
        // Transient poll failure — keep polling; the job server-side
        // sweep fails anything genuinely stuck.
      }
    }, 4000);
  }

  async function runResearch() {
    if (!form.name.trim() || !form.website.trim()) {
      toast({ title: "Brand name and website are both required for deep research", variant: "destructive" });
      return;
    }
    setResearching(true);
    setResearchElapsed(0);
    try {
      // Research runs as a background job (~2 min) — the dialog stays
      // usable and the job survives the dialog closing.
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: form.name.trim(), website: form.website.trim() }),
      });
      const json = (await res.json()) as { job?: ResearchJobDTO; error?: string };
      if (!res.ok || !json.job) throw new Error(json.error ?? "Could not start research");
      if (json.job.status === "done" && json.job.result) {
        setResearching(false);
        applyResearchResult(json.job.result);
        return;
      }
      pollJob(json.job.id);
    } catch (err) {
      setResearching(false);
      toast({
        title: "Deep research failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  function openEdit(b: BrandDTO) {
    setEditing(b);
    setForm(formFromBrand(b));
    setResearch(b.research ?? null);
    setDialogOpen(true);
    // If research for this brand's site is already running in the
    // background, reattach to it instead of leaving the member blind.
    if (b.website) {
      // Capture the narrowed string: parameter narrowing does not
      // survive into the async closure below (b.website rewidens to
      // string | null | undefined there).
      const website = b.website;
      void (async () => {
        try {
          const res = await fetch(`/api/research/latest?website=${encodeURIComponent(website)}`);
          const json = (await res.json()) as { job?: ResearchJobDTO | null };
          if (json.job?.status === "running") {
            setResearching(true);
            setResearchElapsed(json.job.elapsedSec);
            pollJob(json.job.id);
          }
        } catch {
          // Resume is best-effort; the Research button always works.
        }
      })();
    }
  }

  function toggleLanguage(code: string) {
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((c) => c !== code)
        : [...f.languages, code],
    }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ title: "Brand name is required", variant: "destructive" });
      return;
    }
    if (!form.website.trim()) {
      toast({ title: "Website is required — deep research starts from your site", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        website: form.website.trim(),
        research: research ?? undefined,
        industry: form.industry.trim() || undefined,
        description: form.description.trim() || undefined,
        products: form.products.trim() || undefined,
        audience: form.audience.trim() || undefined,
        voice: form.voice.trim() || undefined,
        cta: form.cta.trim() || undefined,
        links: form.links.trim() || undefined,
        languages: form.languages.length ? form.languages : ["en"],
      };
      const res = await fetch(editing ? `/api/brands/${editing.id}` : "/api/brands", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast({ title: editing ? "Brand updated" : "Brand saved", description: json.brand?.name });
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({
        title: "Could not save brand",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/brands/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast({ title: "Brand deleted", description: `"${deleteTarget.name}" was removed.` });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Brand Profiles"
        title="Brand Profiles"
        subtitle="Save your business info once — every campaign can start from it."
        actions={
          <Button size="lg" className="font-semibold" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New brand
          </Button>
        }
      />

      {brands === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
              <div className="h-5 w-1/2 rounded bg-muted" />
              <div className="h-4 w-1/3 rounded bg-muted mt-2" />
              <div className="h-16 rounded bg-muted mt-4" />
              <div className="h-9 rounded bg-muted mt-5" />
            </div>
          ))}
        </div>
      ) : brands.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No brand profiles yet"
          body="Add your business details, products and audience — then reuse them in any campaign with one tap."
          action={
            <Button size="lg" className="font-semibold" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create your first brand profile
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border bg-card p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors"
            >
              <div>
                <h3 className="font-semibold leading-snug break-words">{b.name}</h3>
                <div className="flex items-center gap-2 flex-wrap mt-1 text-sm text-muted-foreground">
                  {b.industry ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" /> {b.industry}
                    </span>
                  ) : null}
                  {b.website ? (
                    <span className="flex items-center gap-1 min-w-0">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{b.website.replace(/^https?:\/\//, "")}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {b.description ? (
                <p className="text-sm text-muted-foreground line-clamp-2">{b.description}</p>
              ) : null}

              {b.research?.analysisSummary ? (
                <Badge variant="outline" className="w-fit text-emerald-400 border-emerald-500/30">
                  <Sparkles className="h-3 w-3 mr-1" /> Deep research on file
                </Badge>
              ) : null}

              <div className="flex flex-wrap gap-1">
                {b.languages.map((code) => (
                  <LangChip key={code} code={code} />
                ))}
              </div>

              {b.audience ? (
                <div className="text-sm flex items-start gap-2 min-w-0">
                  <Users className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground line-clamp-2">{b.audience}</span>
                </div>
              ) : null}
              {b.voice ? (
                <div className="text-sm flex items-start gap-2 min-w-0">
                  <Megaphone className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground line-clamp-2">{b.voice}</span>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 mt-auto pt-2">
                <Button
                  className="w-full font-semibold"
                  onClick={() => onBriefAgents()}
                >
                  Brief my agents
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(b)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(b)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit "${editing.name}"` : "New brand profile"}</DialogTitle>
            <DialogDescription>
              Name and website are required — P&R deep research starts from your site and fills in the rest.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="brand-name">Name *</Label>
              <Input
                id="brand-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Coffee Co."
                className="h-11"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="brand-website">Website *</Label>
                <Input
                  id="brand-website"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="acmecoffee.com"
                  className="h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brand-industry">Industry</Label>
                <Input
                  id="brand-industry"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="Specialty coffee"
                  className="h-11"
                />
              </div>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 grid gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Sparkles className="h-4 w-4 text-primary" /> P&R deep research
                </div>
                <Button type="button" onClick={runResearch} disabled={researching} className="font-semibold">
                  {researching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Researching… {researchElapsed}s
                    </>
                  ) : research ? (
                    "Re-run research"
                  ) : (
                    "Research my brand"
                  )}
                </Button>
              </div>
              {researching ? (
                <div className="grid gap-2">
                  <WaitExplainer slides={RESEARCH_WAIT_SLIDES} />
                  <p className="text-xs text-muted-foreground">
                    It runs in the background — you can close this dialog and keep working. Come back to
                    this brand and the results will be waiting.
                  </p>
                </div>
              ) : null}
              {research ? (
                <div className="grid gap-2 text-sm">
                  <p className="font-medium">What we know about your brand</p>
                  {research.analysisSummary ? (
                    <p className="text-muted-foreground">{research.analysisSummary}</p>
                  ) : null}
                  {research.pains.length ? (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Customer pains: </span>
                      {research.pains.join(" · ")}
                    </p>
                  ) : null}
                  {research.angles.length ? (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Angles that land: </span>
                      {research.angles.join(" · ")}
                    </p>
                  ) : null}
                  {research.competitors.length ? (
                    <p className="text-muted-foreground">
                      <span className="text-foreground font-medium">Competitors spotted: </span>
                      {research.competitors.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Enter your brand name and website, then run research — P&R reads your site and the web,
                  and fills this profile with what it finds. The fields below update automatically.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="brand-description">Description</Label>
              <Textarea
                id="brand-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What the business does, who it serves, what makes it different…"
                rows={3}
                className="scrollbar-thin"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="brand-products">Products / offers</Label>
              <Input
                id="brand-products"
                value={form.products}
                onChange={(e) => setForm((f) => ({ ...f, products: e.target.value }))}
                placeholder="Comma separated — e.g. Cold brew subscription, Beans, Merch"
                className="h-11"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="brand-audience">Target audience</Label>
                <Input
                  id="brand-audience"
                  value={form.audience}
                  onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                  placeholder="Remote workers, 25-40"
                  className="h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brand-voice">Brand voice</Label>
                <Input
                  id="brand-voice"
                  value={form.voice}
                  onChange={(e) => setForm((f) => ({ ...f, voice: e.target.value }))}
                  placeholder="Warm, witty, no jargon"
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="brand-cta">Default CTA</Label>
                <Input
                  id="brand-cta"
                  value={form.cta}
                  onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
                  placeholder="Start your free trial"
                  className="h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="brand-links">Links</Label>
                <Input
                  id="brand-links"
                  value={form.links}
                  onChange={(e) => setForm((f) => ({ ...f, links: e.target.value }))}
                  placeholder="Landing page, store, socials…"
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Languages</Label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => {
                  const active = form.languages.includes(l.code);
                  return (
                    <button
                      type="button"
                      key={l.code}
                      onClick={() => toggleLanguage(l.code)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors min-h-[36px]",
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "bg-secondary/40 hover:border-primary/40",
                      )}
                    >
                      {l.native}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="font-semibold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this brand profile?</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.name}&quot; will be removed. Campaigns already generated with it are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {brands !== null && brands.length > 0 ? (
        <p className="text-xs text-muted-foreground mt-4">
          <Badge variant="outline" className="mr-2 bg-secondary/60">
            Tip
          </Badge>
          Your agents already work from your saved brand profiles — &quot;Brief my agents&quot; takes you to the floor to hand them the job.
        </p>
      ) : null}
    </div>
  );
}
