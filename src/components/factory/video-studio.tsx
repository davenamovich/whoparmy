"use client";

/**
 * Video Studio (Dave, 2026-11-17): the P&R engine's video formats
 * inside Whoparmy — sitdown clips (best-of / ridiculous / news /
 * present), before packs, funnel videos, and the free scroll +
 * infomercial previews, plus follow-up posts from finished jobs.
 * Everything here makes a PREVIEW page; MP4 rendering stays behind
 * the existing approval rules. Charged steps cost 1 credit each on
 * the bridge (reconciled live 2026-11-17); scroll + infomercial
 * previews are free. Jobs run in the background and land in the
 * library when done.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Clapperboard, ExternalLink, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { LANGUAGES, languageLabel } from "@/lib/languages";

interface VideoJobDTO {
  id: string;
  format: string;
  label: string;
  status: string;
  pageUrl: string | null;
  shareUrl: string | null;
  error: string | null;
  engineJobId: string | null;
  createdAt: string;
}

interface SourceDTO {
  id: string;
  format: string;
  engineJobId: string | null;
  pageUrl: string | null;
}

const FORMAT_INFO: Record<string, { hint: string; cost: string }> = {
  RIDICULOUS: { hint: "A ~30s Jobless Joe reaction episode roasting your topic.", cost: "1 credit" },
  BEST_OF: { hint: "1–5 single meme pages or media links count down in one voiced reel.", cost: "BYOK only — voiced" },
  NEWS: { hint: "Joe News from live sources — desk or TV, 45–120s.", cost: "1 credit" },
  PRESENT: { hint: "A 16:9 Joe presentation on your topic.", cost: "1 credit" },
  BEFORE_PACK: { hint: "Joe's voiced welcome + five custom examples for one business.", cost: "BYOK only — voiced" },
  FUNNEL: { hint: "One offer link becomes voiced content whose CTA is that link.", cost: "BYOK only — voiced" },
  SCROLL: { hint: "A ~20s scroll video of a finished Before pack's examples.", cost: "Free preview" },
  INFOMERCIAL: { hint: "A ~30s retro infomercial of a finished Before pack's memes.", cost: "Free preview" },
  FOLLOWUP: { hint: "Another post rebuilt from a finished job's script — nothing new invented.", cost: "1 credit" },
};

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const labelCls = "text-xs font-medium text-muted-foreground";

/** Voiced formats are BYOK-only (Dave, 2026-11-18) — mirrors
 *  AUDIO_FORMATS in lib/video-jobs.ts, which enforces it server-side. */
const AUDIO_UI_FORMATS = ["BEFORE_PACK", "BEST_OF", "FUNNEL"];

interface BrandLite {
  id: string;
  name: string;
  website: string | null;
}

export function VideoStudio() {
  const [format, setFormat] = useState("RIDICULOUS");
  const [topic, setTopic] = useState("");
  const [links, setLinks] = useState("");
  const [theme, setTheme] = useState("");
  const [newsMode, setNewsMode] = useState("ai");
  const [length, setLength] = useState("short");
  const [packInput, setPackInput] = useState("");
  const [videoStyle, setVideoStyle] = useState("memes");
  const [offerUrl, setOfferUrl] = useState("");
  const [funnelFormat, setFunnelFormat] = useState("captions");
  const [offerDesc, setOfferDesc] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [followFormat, setFollowFormat] = useState("meme");
  const [language, setLanguage] = useState("en");
  const [jobs, setJobs] = useState<VideoJobDTO[]>([]);
  const [sources, setSources] = useState<SourceDTO[]>([]);
  const [starting, setStarting] = useState(false);
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [brandId, setBrandId] = useState("");
  const [keyLinked, setKeyLinked] = useState<boolean | null>(null);
  const [keyCredits, setKeyCredits] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // BYOK indicator state for the voiced-format panel.
  useEffect(() => {
    void fetch("/api/bridge/key-status")
      .then((r) => r.json())
      .then((d: { linked?: boolean; credits?: number | null }) => {
        setKeyLinked(d.linked ?? false);
        setKeyCredits(d.credits ?? null);
      })
      .catch(() => undefined);
  }, []);

  // Brand profile over the studio (Dave, 2026-11-18): the member's
  // saved brand drives the studio's business inputs instead of
  // retyping them per format.
  useEffect(() => {
    void fetch("/api/brands")
      .then((r) => r.json())
      .then((d: { brands?: BrandLite[] }) => setBrands(d.brands ?? []))
      .catch(() => undefined);
  }, []);

  function applyBrand(id: string) {
    setBrandId(id);
    const b = brands.find((x) => x.id === id);
    if (!b) return;
    setPackInput(b.website ?? b.name);
    if (b.website) setOfferUrl(b.website);
    toast.success(`Brand profile on: ${b.name} — the studio's business fields are filled from it.`);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/video-jobs");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: VideoJobDTO[]; sources: SourceDTO[] };
      setJobs(data.jobs);
      setSources(data.sources);
    } catch {
      // panel is best-effort
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (jobs.some((j) => j.status === "RUNNING")) {
      pollRef.current = setInterval(() => void load(), 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobs, load]);

  const packSources = sources.filter((s) => s.format === "BEFORE_PACK");
  const anySources = sources;

  function buildParams(): Record<string, unknown> | null {
    const lang = language !== "en" ? { language: languageLabel(language) } : {};
    switch (format) {
      case "RIDICULOUS":
        if (!topic.trim()) return null;
        return { topic: topic.trim(), ...lang };
      case "BEST_OF": {
        const list = links.split("\n").map((s) => s.trim()).filter(Boolean);
        if (!list.length) return null;
        return { links: list, ...(theme.trim() ? { theme: theme.trim() } : {}), ...lang };
      }
      case "NEWS":
        return { mode: newsMode, length, ...lang };
      case "PRESENT":
        if (!topic.trim()) return null;
        return { topic: topic.trim(), length, template: "marketing", ...lang };
      case "BEFORE_PACK":
        if (!packInput.trim()) return null;
        return { input: packInput.trim(), video_style: videoStyle, ...lang };
      case "FUNNEL":
        if (!offerUrl.trim()) return null;
        return {
          url: offerUrl.trim(),
          format: funnelFormat,
          ...(offerDesc.trim() ? { description: offerDesc.trim() } : {}),
        };
      case "SCROLL":
      case "INFOMERCIAL":
        if (!sourceId) return null;
        return { sourceJobId: sourceId };
      case "FOLLOWUP":
        if (!sourceId) return null;
        return { sourceJobId: sourceId, format: followFormat };
      default:
        return null;
    }
  }

  async function start() {
    const params = buildParams();
    if (!params) {
      toast.error("Fill in the required field for this format first.");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, params }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not start the video job.");
      toast.success("Video job started — the preview lands in your library when it's done.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the video job.");
    } finally {
      setStarting(false);
    }
  }

  const info = FORMAT_INFO[format];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clapperboard className="h-5 w-5 text-primary" />
          Video Studio — engine formats
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Sitdown clips, funnels and more from the P&amp;R engine. Every job makes a preview page first —
          rendering an MP4 stays behind approval, exactly as before.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {brands.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
            <div className="space-y-1">
              <p className={labelCls}>Brand profile — drives this studio</p>
              <select className={selectCls} value={brandId} onChange={(e) => applyBrand(e.target.value)}>
                <option value="">Pick your brand profile…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground pb-2 max-w-md">
              Picking your brand fills the business fields below (Before pack business, funnel offer
              link) from the profile — no retyping.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className={labelCls}>Format</p>
            <select className={selectCls} value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.keys(FORMAT_INFO).map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className={labelCls}>Language</p>
            <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.flag} {l.native}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground pb-2">
            {info.hint} <span className="font-medium text-foreground">{info.cost}.</span>
          </p>
        </div>

        {format === "RIDICULOUS" || format === "PRESENT" ? (
          <Input
            placeholder={format === "RIDICULOUS" ? "Topic to roast — a subject, a link, a business…" : "Presentation topic…"}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        ) : null}

        {format === "BEST_OF" ? (
          <div className="space-y-2">
            <Textarea
              placeholder={"One link per line — single meme pages (/m/…) or direct .mp4/.gif/.png (1–5)"}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={3}
            />
            <Input placeholder="Theme (optional) — e.g. job hunt fails" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
        ) : null}

        {format === "NEWS" ? (
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <p className={labelCls}>Desk</p>
              <select className={selectCls} value={newsMode} onChange={(e) => setNewsMode(e.target.value)}>
                {["general", "ai", "crypto", "business", "internet", "conspiracy"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <p className={labelCls}>Length</p>
              <select className={selectCls} value={length} onChange={(e) => setLength(e.target.value)}>
                <option value="short">Short ≈45s</option>
                <option value="standard">Standard ≈90s</option>
                <option value="deep">Deep ≈2 min</option>
              </select>
            </div>
          </div>
        ) : null}

        {format === "PRESENT" ? (
          <div className="space-y-1">
            <p className={labelCls}>Length</p>
            <select className={selectCls} value={length} onChange={(e) => setLength(e.target.value)}>
              <option value="short">Short</option>
              <option value="long">Long</option>
            </select>
          </div>
        ) : null}

        {format === "BEFORE_PACK" ? (
          <div className="flex flex-wrap items-end gap-3">
            <Input
              className="flex-1 min-w-[220px]"
              placeholder="Business website, or a sentence about the business…"
              value={packInput}
              onChange={(e) => setPackInput(e.target.value)}
            />
            <div className="space-y-1">
              <p className={labelCls}>Welcome video style</p>
              <select className={selectCls} value={videoStyle} onChange={(e) => setVideoStyle(e.target.value)}>
                <option value="memes">Memes</option>
                <option value="stickman">Stickman</option>
                <option value="captions">Captions</option>
                <option value="joe">Joe</option>
              </select>
            </div>
          </div>
        ) : null}

        {format === "FUNNEL" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                className="flex-1 min-w-[220px]"
                placeholder="Offer link — kept exactly, referral params untouched"
                value={offerUrl}
                onChange={(e) => setOfferUrl(e.target.value)}
              />
              <div className="space-y-1">
                <p className={labelCls}>Funnel format</p>
                <select className={selectCls} value={funnelFormat} onChange={(e) => setFunnelFormat(e.target.value)}>
                  <option value="captions">Captions</option>
                  <option value="memes">Memes</option>
                  <option value="stickfigures">Stick figures</option>
                  <option value="bestof">Best of (a full day + share page)</option>
                </select>
              </div>
            </div>
            <Input
              placeholder="Description (only if the page can't be read) — what the offer is and who it's for"
              value={offerDesc}
              onChange={(e) => setOfferDesc(e.target.value)}
            />
          </div>
        ) : null}

        {format === "SCROLL" || format === "INFOMERCIAL" || format === "FOLLOWUP" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className={labelCls}>Source — a finished job of yours</p>
              <select className={selectCls} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Pick a source…</option>
                {(format === "FOLLOWUP" ? anySources : packSources).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.format.replace(/_/g, " ")} — {s.id.slice(0, 8)}…
                  </option>
                ))}
              </select>
            </div>
            {format === "FOLLOWUP" ? (
              <div className="space-y-1">
                <p className={labelCls}>Output</p>
                <select className={selectCls} value={followFormat} onChange={(e) => setFollowFormat(e.target.value)}>
                  <option value="meme">Meme</option>
                  <option value="slideshow">Slideshow</option>
                  <option value="hottake">Hot take</option>
                  <option value="imessage">iMessage thread</option>
                </select>
              </div>
            ) : null}
            {(format === "FOLLOWUP" ? anySources : packSources).length === 0 ? (
              <p className="text-xs text-muted-foreground pb-2">
                No finished sources yet — run a {format === "FOLLOWUP" ? "video job" : "Before pack"} first.
              </p>
            ) : null}
          </div>
        ) : null}

        {AUDIO_UI_FORMATS.includes(format) ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold">Voiced format — BYOK only</p>
            <p className="text-sm text-muted-foreground">
              This format generates a voice track, and audio costs more than the 1-credit house lane
              covers — so voiced formats run on your own key. Your Muse can make it today: connect
              once, then just ask it for a Before pack, a best-of reel or a funnel.
            </p>
            {keyLinked === true ? (
              <p className="text-sm">
                <span className="inline-block rounded-full bg-emerald-600 text-white text-xs font-semibold px-2 py-0.5 mr-2">
                  BYOK active
                </span>
                Your P&amp;R key is linked
                {typeof keyCredits === "number" ? <> — {keyCredits.toLocaleString()} credits on it</> : null}
                . Your Muse spends from that balance.
              </p>
            ) : keyLinked === false ? (
              <p className="text-sm text-muted-foreground">
                No P&amp;R key linked yet — it links automatically from your Whop account the first
                time your Muse connects. See Account → Your P&amp;R key for status.
              </p>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href="/muse-week">Open the Muse connection</a>
            </Button>
          </div>
        ) : (
          <Button onClick={() => void start()} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Start video job
          </Button>
        )}

        {jobs.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            {jobs.slice(0, 8).map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{j.label}</span>
                <span className="text-xs text-muted-foreground">{new Date(j.createdAt).toLocaleString()}</span>
                {j.status === "RUNNING" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> generating…
                  </span>
                ) : j.status === "DONE" ? (
                  <>
                    {j.pageUrl ? (
                      <a href={j.pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                        Watch preview <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    {j.shareUrl ? (
                      <a href={j.shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                        Share page <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-destructive">{j.error ?? "Failed"}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
