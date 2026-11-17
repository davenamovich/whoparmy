"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type ContentCategory } from "@/lib/formats";
import type { AssetDTO, CampaignDTO } from "@/lib/types";
import { AssetCard, LangChip, TypeBadge } from "./shared";

export function ResultsWorkspace({
  campaignId,
  onBack,
}: {
  campaignId: string;
  onBack?: () => void;
}) {
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<CampaignDTO | null>(null);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (!res.ok) {
      toast({ title: "Campaign not found", variant: "destructive" });
      setLoading(false);
      return;
    }
    const json = await res.json();
    setCampaign(json.campaign as CampaignDTO);
    setAssets(json.assets as AssetDTO[]);
    setLoading(false);
    return json;
  }, [campaignId, toast]);

  // initial load + poll while a job is running
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      await load();
      // find a running job for this campaign
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok || cancelled) return;
      const j = await res.json();
      if ((j.campaign as CampaignDTO).status === "GENERATING") {
        interval = setInterval(async () => {
          if (cancelled) return;
          await load();
          const still = await fetch(`/api/campaigns/${campaignId}`);
          if (still.ok) {
            const jj = await still.json();
            if ((jj.campaign as CampaignDTO).status !== "GENERATING") {
              if (interval) clearInterval(interval);
            }
          }
        }, 2500);
      }
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [campaignId, load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) map.set(a.type, (map.get(a.type) ?? 0) + 1);
    return map;
  }, [assets]);

  const pending = assets.filter((a) => a.status === "PENDING" || a.status === "GENERATING").length;
  const failed = assets.filter((a) => a.status === "FAILED").length;
  const generating = campaign?.status === "GENERATING" || pending > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" /> Loading workspace…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        Campaign not found.
        {onBack ? <div className="mt-4"><Button variant="outline" onClick={onBack}>Back to campaigns</Button></div> : null}
      </div>
    );
  }

  const languagesForMenu = campaign.languages.map((l) => ({ code: l.code, label: l.label }));

  return (
    <div>
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      ) : null}

      <div className="rounded-2xl border bg-card p-5 sm:p-6 mb-6 stage-light">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge variant={campaign.status === "GENERATING" ? "secondary" : "default"} className={campaign.status === "GENERATING" ? "animate-pulse" : "bg-primary/15 text-primary border-0"}>
                {campaign.status === "GENERATING" ? "Generating…" : campaign.status === "PARTIAL" ? "Complete with failures" : "Complete"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              <span className="font-medium text-foreground/80">{campaign.businessName}</span>
              <span>•</span>
              <span>{campaign.objective}</span>
              <span>•</span>
              <span>{campaign.tone}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              {campaign.languages.map((l) => (
                <LangChip key={l.code} code={l.code} label={l.label} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-center rounded-xl border bg-secondary/40 px-4 py-2.5">
              <div className="text-xl font-bold">{assets.filter((a) => a.status === "DONE").length}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ready</div>
            </div>
            <div className="text-center rounded-xl border bg-secondary/40 px-4 py-2.5">
              <div className="text-xl font-bold text-primary">{pending}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">In engine</div>
            </div>
            {failed > 0 ? (
              <div className="text-center rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5">
                <div className="text-xl font-bold text-destructive">{failed}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Failed (free)</div>
              </div>
            ) : null}
          </div>
        </div>
        {generating ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> The engine is still writing — results stream in live. Failed pieces are never charged.
          </div>
        ) : null}
      </div>

      <Tabs defaultValue={assets.some((a) => a.type === "MEMES") ? "MEMES" : "ALL"} className="w-full">
        <TabsList className="mb-5 flex-wrap h-auto gap-1 bg-secondary/50">
          <TabsTrigger value="ALL" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> All <Badge variant="secondary" className="ml-1 text-[10px]">{assets.length}</Badge>
          </TabsTrigger>
          {(["MEMES", "SOCIAL", "VIDEO", "AUDIO", "MARKETING"] as ContentCategory[])
            .filter((c) => counts.get(c))
            .map((c) => (
              <TabsTrigger key={c} value={c} className="gap-1.5">
                {CATEGORY_LABELS[c]} <Badge variant="secondary" className="ml-1 text-[10px]">{counts.get(c)}</Badge>
              </TabsTrigger>
            ))}
        </TabsList>

        <TabsContent value="ALL">
          <AssetGrid assets={assets} languagesForMenu={languagesForMenu} setAssets={setAssets} />
        </TabsContent>
        {(["MEMES", "SOCIAL", "VIDEO", "AUDIO", "MARKETING"] as ContentCategory[])
          .filter((c) => counts.get(c))
          .map((c) => (
            <TabsContent key={c} value={c}>
              <AssetGrid assets={assets.filter((a) => a.type === c)} languagesForMenu={languagesForMenu} setAssets={setAssets} />
            </TabsContent>
          ))}
      </Tabs>
    </div>
  );
}

function AssetGrid({
  assets,
  languagesForMenu,
  setAssets,
}: {
  assets: AssetDTO[];
  languagesForMenu: { code: string; label: string }[];
  setAssets: React.Dispatch<React.SetStateAction<AssetDTO[]>>;
}) {
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
        <Sparkles className="h-6 w-6 mx-auto mb-2 text-primary/60" />
        Nothing here yet.
      </div>
    );
  }
  return (
    <div className={cn("grid gap-4", assets.some((a) => a.type === "MEMES") ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {assets.map((a) => (
        <div key={a.id} className={a.type === "MEMES" ? "" : "contents sm:block"}>
          <AssetCard
            asset={a}
            allLanguages={languagesForMenu}
            onUpdated={(updated) => setAssets((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
            onDeleted={(id) => setAssets((prev) => prev.filter((x) => x.id !== id))}
          />
        </div>
      ))}
    </div>
  );
}
