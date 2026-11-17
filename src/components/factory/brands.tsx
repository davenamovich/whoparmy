"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Globe, Loader2, Megaphone, Plus, Trash2, Users } from "lucide-react";
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
import type { BrandDTO, ProfileDTO } from "@/lib/types";
import { EmptyState, LangChip, SectionHeader } from "./shared";

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

function brandToProfile(b: BrandDTO): ProfileDTO {
  return {
    name: b.name,
    industry: b.industry ?? undefined,
    description: b.description ?? "",
    products: (b.products ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    audience: b.audience ?? undefined,
    sellingPoints: [],
    differentiators: [],
    website: b.website ?? undefined,
    primaryLanguage: b.languages[0] ?? "en",
    suggestedLanguages: b.languages,
    suggestedTones: [],
  };
}

export function BrandsView({
  onUseInCampaign,
}: {
  onUseInCampaign: (profile: ProfileDTO, brandName: string) => void;
}) {
  const { toast } = useToast();
  const [brands, setBrands] = useState<BrandDTO[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BrandDTO | null>(null);
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrandDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(b: BrandDTO) {
    setEditing(b);
    setForm(formFromBrand(b));
    setDialogOpen(true);
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
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        website: form.website.trim() || undefined,
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
                  onClick={() => onUseInCampaign(brandToProfile(b), b.name)}
                >
                  Use in campaign
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
              Only the name is required — everything else sharpens the generated content.
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
                <Label htmlFor="brand-website">Website</Label>
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
          &quot;Use in campaign&quot; pre-fills the campaign brief with this profile&apos;s details.
        </p>
      ) : null}
    </div>
  );
}
