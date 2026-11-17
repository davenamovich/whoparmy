"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Pencil, RefreshCw, Trash2, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard, downloadMeme, downloadTextFile, safeFilename } from "@/lib/client-utils";
import { LANGUAGE_MAP } from "@/lib/languages";
import { CATEGORY_LABELS, type ContentCategory } from "@/lib/formats";
import type { AssetDTO } from "@/lib/types";

// ─── small shared primitives used across every section ──────────────

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-1.5">{eyebrow}</div>
        ) : null}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm sm:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 py-14">
      <div className="rounded-2xl bg-primary/10 p-4 mb-4">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

const TYPE_STYLES: Record<string, string> = {
  MEMES: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  SOCIAL: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  VIDEO: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25",
  AUDIO: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  MARKETING: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={`${TYPE_STYLES[type] ?? "bg-muted text-muted-foreground"} text-[11px] font-semibold`}>
      {CATEGORY_LABELS[type as ContentCategory] ?? type}
    </Badge>
  );
}

export function LangChip({ code, label }: { code: string; label?: string }) {
  const def = LANGUAGE_MAP[code];
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
      <span aria-hidden>{def?.flag ?? "🌐"}</span>
      {label ?? def?.label ?? code}
    </span>
  );
}

export function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "icon" }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size={size === "sm" ? "sm" : "icon"}
      onClick={async () => {
        const ok = await copyToClipboard(text);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } else {
          toast({ title: "Copy failed", description: "Your browser blocked clipboard access. Select the text manually.", variant: "destructive" });
        }
      }}
      aria-label="Copy content"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      {size === "sm" ? <span>{copied ? "Copied" : "Copy"}</span> : null}
    </Button>
  );
}

// ─── Asset card (results workspace, library, meme studio) ───────────

const VARIATIONS = [
  { key: "funnier", label: "Make it funnier" },
  { key: "shorter", label: "Make it shorter" },
  { key: "persuasive", label: "Make it more persuasive" },
  { key: "controversial", label: "Make it more controversial" },
  { key: "stronger_cta", label: "Add a stronger CTA" },
  { key: "natural", label: "Make it more natural" },
  { key: "new_audience", label: "Rewrite for a different audience" },
];

export function AssetCard({
  asset,
  onUpdated,
  onDeleted,
  allLanguages,
}: {
  asset: AssetDTO;
  onUpdated: (asset: AssetDTO) => void;
  onDeleted: (id: string) => void;
  allLanguages?: { code: string; label: string }[];
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(asset.title);
  const [draftBody, setDraftBody] = useState(asset.type === "MEMES" ? asset.topText ?? "" : asset.body);
  const [draftBottom, setDraftBottom] = useState(asset.bottomText ?? "");
  const [busy, setBusy] = useState<null | "regen" | "save" | "delete" | string>(null);
  const isMeme = asset.type === "MEMES";

  const fullText = isMeme ? `TOP: ${asset.topText ?? ""}\nBOTTOM: ${asset.bottomText ?? ""}` : asset.body;

  async function patch(body: Record<string, string>) {
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Update failed");
    onUpdated(json.asset as AssetDTO);
  }

  async function runRegenerate(variation?: string, language?: string) {
    setBusy(variation ?? "regen");
    try {
      const res = await fetch(`/api/assets/${asset.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variation, language }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Regeneration failed");
      onUpdated(json.asset as AssetDTO);
      toast({ title: variation ? "Variation ready" : language ? `Rewritten in ${LANGUAGE_MAP[language]?.label ?? language}` : "Regenerated" });
    } catch (err) {
      toast({ title: "Regeneration failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:border-primary/40 transition-colors">
      {isMeme ? (
        <div className="relative">
          {asset.imageUrl ? (
            asset.pageUrl ? (
              <a href={asset.pageUrl} target="_blank" rel="noreferrer" title="Open the share page">
                <img src={asset.imageUrl} alt={asset.title || "Generated meme"} className="w-full aspect-[9/16] object-cover" />
              </a>
            ) : (
              <img src={asset.imageUrl} alt={asset.title || "Generated meme"} className="w-full aspect-[9/16] object-cover" />
            )
          ) : (
            <div className="w-full aspect-[9/16] bg-muted/50 flex items-center justify-center text-muted-foreground text-sm">
              {asset.status === "GENERATING" || asset.status === "PENDING" ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating image…</span>
              ) : asset.status === "FAILED" ? (
                <span className="text-destructive text-xs px-4 text-center">Image generation failed — no charge applied</span>
              ) : (
                "No image"
              )}
            </div>
          )}
          {asset.imageUrl && (asset.topText || asset.bottomText) ? (
            <>
              {asset.topText ? (
                <div className="meme-font absolute top-[3%] left-1/2 -translate-x-1/2 w-[92%] text-center text-[clamp(0.9rem,2.4vw,1.6rem)]">
                  {asset.topText}
                </div>
              ) : null}
              {asset.bottomText ? (
                <div className="meme-font absolute bottom-[3%] left-1/2 -translate-x-1/2 w-[92%] text-center text-[clamp(0.9rem,2.4vw,1.6rem)]">
                  {asset.bottomText}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="p-4 flex flex-col gap-3 grow">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={asset.type} />
          <LangChip code={asset.language} />
          <span className="text-[11px] text-muted-foreground ml-auto">{asset.formatLabel}</span>
        </div>

        {asset.status === "FAILED" ? (
          <div className="text-xs text-destructive">{asset.error ?? "Generation failed — you were not charged."}</div>
        ) : null}

        {editing ? (
          <div className="flex flex-col gap-2">
            <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Title" className="text-sm" />
            {isMeme ? (
              <>
                <Input value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder="Top text" maxLength={90} />
                <Input value={draftBottom} onChange={(e) => setDraftBottom(e.target.value)} placeholder="Bottom text" maxLength={90} />
              </>
            ) : (
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={Math.min(14, Math.max(5, Math.ceil(draftBody.length / 60)))}
                className="text-sm scrollbar-thin"
              />
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={busy === "save"}
                onClick={async () => {
                  setBusy("save");
                  try {
                    if (isMeme) {
                      await patch({ title: draftTitle, topText: draftBody, bottomText: draftBottom });
                    } else {
                      await patch({ title: draftTitle, body: draftBody });
                    }
                    setEditing(false);
                    toast({ title: "Saved" });
                  } catch (err) {
                    toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-semibold text-sm leading-snug">{asset.title || asset.formatLabel}</div>
            <div className={`text-sm text-foreground/85 whitespace-pre-wrap grow ${isMeme ? "text-muted-foreground text-xs" : "scrollbar-thin"}`}>
              {fullText}
            </div>
          </>
        )}

        <div className="flex items-center gap-1.5 pt-1 border-t/50 mt-auto flex-wrap">
          <CopyButton text={fullText} />
          {isMeme && asset.imageUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadMeme({
                  imageUrl: asset.imageUrl!,
                  assetId: asset.id,
                  topText: asset.topText,
                  bottomText: asset.bottomText,
                  filename: `meme-${safeFilename(asset.title || asset.formatLabel)}-${asset.language}.png`,
                }).catch(() => toast({ title: "Download failed", variant: "destructive" }))
              }
            >
              <Download className="h-4 w-4" /> <span>PNG</span>
            </Button>
          ) : null}
          {isMeme && asset.pageUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={asset.pageUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> <span>Share page</span>
              </a>
            </Button>
          ) : null}
          {!isMeme && asset.status === "DONE" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadTextFile(fullText, `${safeFilename(asset.title || asset.formatLabel)}-${asset.language}.txt`)}
            >
              <Download className="h-4 w-4" /> <span>.txt</span>
            </Button>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => {
              setDraftTitle(asset.title);
              setDraftBody(isMeme ? asset.topText ?? "" : asset.body);
              setDraftBottom(asset.bottomText ?? "");
              setEditing(true);
            }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Regenerate or vary" disabled={busy !== null}>
                  {busy !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Regenerate</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => runRegenerate()}>
                  <RefreshCw className="h-4 w-4" /> Fresh version
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Variations</DropdownMenuLabel>
                {VARIATIONS.map((v) => (
                  <DropdownMenuItem key={v.key} onClick={() => runRegenerate(v.key)}>
                    {v.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Switch language</DropdownMenuLabel>
                {(allLanguages ?? [])
                  .filter((l) => l.code !== asset.language)
                  .slice(0, 8)
                  .map((l) => (
                    <DropdownMenuItem key={l.code} onClick={() => runRegenerate(undefined, l.code)}>
                      {l.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label="Delete"
              disabled={busy === "delete"}
              onClick={async () => {
                setBusy("delete");
                try {
                  const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
                  if (!res.ok) throw new Error((await res.json()).error);
                  onDeleted(asset.id);
                  toast({ title: "Deleted" });
                } catch (err) {
                  toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
