"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Library, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LANGUAGES } from "@/lib/languages";
import { CATEGORY_LABELS, type ContentCategory } from "@/lib/formats";
import type { AssetDTO } from "@/lib/types";
import { AssetCard, EmptyState, SectionHeader } from "./shared";

const ALL_LANGS = LANGUAGES.map((l) => ({ code: l.code, label: l.label }));

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "ALL", label: "All types" },
  ...(Object.keys(CATEGORY_LABELS) as ContentCategory[]).map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  })),
];

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card overflow-hidden animate-pulse">
          <div className={i % 3 === 0 ? "aspect-square bg-muted" : "h-6"} />
          <div className="p-4 flex flex-col gap-3">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-16 rounded bg-muted" />
            <div className="h-9 w-24 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LibraryView() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [language, setLanguage] = useState("ALL");
  const [assets, setAssets] = useState<AssetDTO[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (q: string, t: string, lang: string) => {
      setRefreshing(true);
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (q.trim()) params.set("q", q.trim());
        if (t !== "ALL") params.set("type", t);
        if (lang !== "ALL") params.set("language", lang);
        const res = await fetch(`/api/assets?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load library");
        setAssets(json.assets as AssetDTO[]);
      } catch (err) {
        toast({
          title: "Could not load the library",
          description: err instanceof Error ? err.message : undefined,
          variant: "destructive",
        });
      } finally {
        setRefreshing(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load(debouncedSearch, type, language);
  }, [load, debouncedSearch, type, language]);

  return (
    <div>
      <SectionHeader
        eyebrow="Content Library"
        title="Content Library"
        subtitle="Everything you've generated — searchable, exportable, yours."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles and content…"
            className="h-11 pl-9"
            aria-label="Search assets"
          />
        </div>
        <div className="flex gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Filter by type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-11 w-full sm:w-[180px]" aria-label="Filter by language">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="ALL">All languages</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.native}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden sm:flex items-center justify-center w-6">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
          </div>
        </div>
      </div>

      {assets === null ? (
        <SkeletonGrid />
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nothing here yet"
          body={
            search || type !== "ALL" || language !== "ALL"
              ? "No assets match these filters. Try clearing the search or switching the type or language."
              : "Generate your first campaign and every asset lands here — ready to copy, download or rewrite."
          }
          action={
            search || type !== "ALL" || language !== "ALL" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setType("ALL");
                  setLanguage("ALL");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              allLanguages={ALL_LANGS}
              onUpdated={(updated) =>
                setAssets((prev) => (prev ?? []).map((a) => (a.id === updated.id ? updated : a)))
              }
              onDeleted={(id) => setAssets((prev) => (prev ?? []).filter((a) => a.id !== id))}
            />
          ))}
        </div>
      )}

      {refreshing && assets !== null ? (
        <div className="sm:hidden flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing…
        </div>
      ) : null}
    </div>
  );
}
