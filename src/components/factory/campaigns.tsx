"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarDays,
  Copy,
  FileText,
  Layers,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { CampaignDTO } from "@/lib/types";
import { EmptyState, LangChip, SectionHeader } from "./shared";
import { PublicCampaignsTeaser } from "./public-campaigns";

function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETE") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shrink-0">
        Complete
      </Badge>
    );
  }
  if (status === "PARTIAL") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/25 shrink-0">
        Partial
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/25 animate-pulse shrink-0">
      <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating
    </Badge>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-5 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="h-4 w-1/3 rounded bg-muted mt-2" />
      <div className="h-4 w-1/2 rounded bg-muted mt-4" />
      <div className="flex gap-1.5 mt-4">
        <div className="h-5 w-16 rounded bg-muted" />
        <div className="h-5 w-16 rounded bg-muted" />
        <div className="h-5 w-16 rounded bg-muted" />
      </div>
      <div className="h-9 rounded bg-muted mt-5" />
    </div>
  );
}

export function CampaignsView({
  onOpen,
  onNewCampaign,
}: {
  onOpen: (campaignId: string) => void;
  onNewCampaign: () => void;
}) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignDTO[] | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignDTO | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        const res = await fetch("/api/campaigns");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load campaigns");
        setCampaigns(json.campaigns as CampaignDTO[]);
      } catch (err) {
        if (!opts?.silent) {
          toast({
            title: "Could not load campaigns",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          });
        }
      }
    },
    [toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is still generating, stop as soon as it settles.
  const hasGenerating = (campaigns ?? []).some((c) => c.status === "GENERATING");
  useEffect(() => {
    if (!hasGenerating) return;
    const timer = setInterval(() => {
      void load({ silent: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [hasGenerating, load]);

  async function duplicate(campaign: CampaignDTO) {
    setDuplicatingId(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/duplicate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Duplicate failed");
      toast({ title: "Campaign duplicated", description: `"${json.campaign?.name ?? campaign.name}" is ready.` });
      await load({ silent: true });
    } catch (err) {
      toast({
        title: "Duplicate failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDuplicatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast({ title: "Campaign deleted", description: `"${deleteTarget.name}" was removed.` });
      setDeleteTarget(null);
      await load({ silent: true });
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
        eyebrow="Content Factory"
        title="My Campaigns"
        subtitle="Every content campaign you've generated — reopen one to browse, edit and download its assets."
        actions={
          <Button size="lg" className="font-semibold" onClick={onNewCampaign}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      <div className="mb-6">
        <PublicCampaignsTeaser />
      </div>

      {campaigns === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No campaigns yet"
          body="Describe your business once and the factory generates a full multi-language content pack — memes, posts, scripts and marketing copy."
          action={
            <Button size="lg" className="font-semibold" onClick={onNewCampaign}>
              <Plus className="h-4 w-4" /> Create your first campaign
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const counts = c.assetCounts;
            const piecesEstimate = c.formats.length * c.piecesPerFormat * Math.max(c.languages.length, 1);
            return (
              <div
                key={c.id}
                className="rounded-xl border bg-card p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug break-words">{c.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{c.businessName}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2 min-w-0">
                    <Target className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{c.objective}</span>
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{c.tone}</span>
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {c.languages.map((l) => (
                    <LangChip key={l.code} code={l.code} label={l.label} />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-sm font-semibold">{c.formats.length}</div>
                    <div className="text-[11px] text-muted-foreground">formats</div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-sm font-semibold">≈ {piecesEstimate}</div>
                    <div className="text-[11px] text-muted-foreground">pieces planned</div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-2 py-2">
                    <div className="text-sm font-semibold">
                      {counts ? `${counts.done}/${counts.total}` : "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">assets done</div>
                  </div>
                </div>

                {counts && counts.failed > 0 ? (
                  <div className="text-xs text-destructive">
                    {counts.failed} generation{counts.failed > 1 ? "s" : ""} failed — not charged
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {format(new Date(c.createdAt), "MMM d, yyyy")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={`Duplicate ${c.name}`}
                      disabled={duplicatingId === c.id}
                      onClick={() => void duplicate(c)}
                    >
                      {duplicatingId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" className="h-10 px-4 font-semibold" onClick={() => onOpen(c.id)}>
                      <FileText className="h-4 w-4" /> Open
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this campaign?</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.name}&quot; and all of its generated assets will be permanently removed. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hasGenerating ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-6">
          <Layers className="h-3.5 w-3.5 animate-pulse text-primary" />
          Generation in progress — this list refreshes automatically every few seconds.
        </div>
      ) : null}
    </div>
  );
}
