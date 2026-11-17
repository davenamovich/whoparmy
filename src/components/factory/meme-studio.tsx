"use client";

import { useState } from "react";
import { ImagePlus, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LANGUAGES } from "@/lib/languages";
import { FORMAT_CATALOG } from "@/lib/formats";
import type { AssetDTO } from "@/lib/types";
import { AssetCard, SectionHeader } from "./shared";

const HUMOR_STYLES = [
  { key: "funny_meme", label: "Funny" },
  { key: "relatable_meme", label: "Relatable" },
  { key: "promotional_meme", label: "Promotional" },
];

export function MemeStudio() {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("funny_meme");
  const [language, setLanguage] = useState("en");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [memes, setMemes] = useState<AssetDTO[]>([]);

  async function generate() {
    if (!topic.trim()) {
      toast({ title: "Tell us what to meme about", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // meme-only generation reuses the same real pipeline
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "description", value: topic.trim() }),
      });
      const analyzeJson = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeJson.error ?? "Could not build the brief");

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Meme Studio — ${topic.trim().slice(0, 40)}`,
          sourceType: "DESCRIPTION",
          profile: analyzeJson.profile,
          objective: "entertainment",
          tone: "funny",
          languages: [language],
          formats: [{ category: "MEMES", format: style }],
          piecesPerFormat: count,
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok || !genJson.campaignId) throw new Error(genJson.error ?? "Generation failed to start");

      toast({ title: "Meme engine fired up", description: `${count} meme${count > 1 ? "s" : ""} incoming — this involves real image generation, usually 15-40s.` });

      // poll until campaign completes
      const poll = setInterval(async () => {
        const r = await fetch(`/api/campaigns/${genJson.campaignId}`);
        if (!r.ok) return;
        const j = await r.json();
        if (j.campaign.status !== "GENERATING") {
          clearInterval(poll);
          const assets = (j.assets as AssetDTO[]).filter((a) => a.type === "MEMES");
          setMemes((prev) => [...assets, ...prev]);
          setBusy(false);
        }
      }, 2000);
    } catch (err) {
      toast({ title: "Meme generation failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Meme Studio"
        title="Built to be shared"
        subtitle="Generate real memes — concept, image and captions — in any of 23 languages. Download and post anywhere."
      />

      <div className="rounded-2xl border bg-card p-5 sm:p-6 max-w-3xl">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What are we memeing about?</label>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            placeholder="A product, business, offer or topic…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            className="h-12 text-base"
          />
          <Button size="lg" className="h-12 sm:w-40 shrink-0 font-semibold" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Humor style</label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {HUMOR_STYLES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyle(s.key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    style === s.key ? "border-primary bg-primary/15 text-primary" : "bg-secondary/40 hover:border-primary/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 w-full h-9 rounded-lg border bg-secondary/40 px-2.5 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variations</label>
            <div className="flex gap-1.5 mt-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cn(
                    "w-9 h-9 rounded-lg text-sm font-semibold transition-colors",
                    count === n ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Each meme = one real AI image + native captions. More variations = more wait time.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        {memes.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <ImagePlus className="h-8 w-8 mx-auto text-primary/60 mb-3" />
            <h3 className="font-semibold">No memes generated yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Drop a topic above and the meme division goes to work. Every image is generated fresh — no stock placeholders.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memes.map((m) => (
              <AssetCard
                key={m.id}
                asset={m}
                allLanguages={LANGUAGES.map((l) => ({ code: l.code, label: l.label }))}
                onUpdated={(updated) => setMemes((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                onDeleted={(id) => setMemes((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
