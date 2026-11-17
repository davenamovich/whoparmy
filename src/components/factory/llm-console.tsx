"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Cpu, RefreshCcw, Server, Sparkles, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * LLM CONTROL — the operator console for Bifrost + LLM management.
 *
 * Operator-only (the API 403s everyone else). Shows the providers as
 * they actually are — Starimg's live catalog, the Bifrost gateway
 * probe (local plumbing, honestly labeled when unreachable) — the
 * tier routing policy with per-tier model overrides that the agent
 * runner picks up on the next job, and real usage from the job
 * ledger: weighted tokens and dollar cost at the operator's rates.
 */

interface TierRow {
  key: string;
  label: string;
  model: string;
  defaultModel: string;
  overridden: boolean;
  coefficient: number;
  typicalWeightedTokens: number;
  fuel: string;
  blurb: string;
}

interface ConsoleData {
  providers: {
    starimg: {
      keySet: boolean;
      baseUrl: string | null;
      catalogOk: boolean;
      catalogCount: number;
      catalog: string[];
      catalogError: string | null;
    };
    bifrost: { url: string; reachable: boolean; version?: string; note: string };
  };
  tiers: TierRow[];
  usage: {
    jobsTotal: number;
    jobsDone: number;
    jobsFailed: number;
    weightedTokensTotal: number;
    estCostUsdBulk: number;
    estCostUsdPack: number;
    byTier: { tier: string; jobs: number; weightedTokens: number }[];
    byModel: { model: string; jobs: number; weightedTokens: number }[];
    factoryItemsThisMonth: number;
  };
}

const fmt = (n: number) => n.toLocaleString();
const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

export function LlmConsole() {
  const [data, setData] = useState<ConsoleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/llm-console", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json.console as ConsoleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load LLM console");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setTierModel(tier: string, model: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/llm-console", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setData((d) => (d ? { ...d, tiers: json.tiers as TierRow[] } : d));
      toast.success(`${tier} tier now routes to ${model} — live on the next job`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetTier(tier: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/llm-console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      setData((d) => (d ? { ...d, tiers: json.tiers as TierRow[] } : d));
      toast.success(`${tier} tier back to its default model`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm font-semibold">LLM console unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Reading the LLM layer…</CardContent>
      </Card>
    );
  }

  const { starimg, bifrost } = data.providers;
  const u = data.usage;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" /> LLM Control
          <Badge variant="outline" className="text-[10px]">Operator only</Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bifrost and the LLM layer, managed from one place: providers, the tier routing policy the bot runner
          actually uses, and what the army has really spent.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI STAR / Starimg
              <Badge className={starimg.keySet && starimg.catalogOk ? "bg-emerald-500/15 text-emerald-500 border-0 text-[10px] ml-auto" : "bg-red-500/15 text-red-500 border-0 text-[10px] ml-auto"}>
                {starimg.keySet ? (starimg.catalogOk ? "Live" : "Key set, catalog failing") : "No key in env"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Base: <span className="text-foreground">{starimg.baseUrl ?? "—"}</span></p>
            <p>Live catalog: <span className="text-foreground">{starimg.catalogOk ? `${starimg.catalogCount} models` : "unreachable"}</span></p>
            {starimg.catalogError ? <p className="text-red-400">{starimg.catalogError}</p> : null}
            <p>The production lane. Bot jobs route through Starimg today; the catalog churns, so the console reads it live and never hardcodes it.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" /> Bifrost gateway
              <Badge className={bifrost.reachable ? "bg-emerald-500/15 text-emerald-500 border-0 text-[10px] ml-auto" : "bg-amber-500/15 text-amber-500 border-0 text-[10px] ml-auto"}>
                {bifrost.reachable ? `Up${bifrost.version ? ` · ${bifrost.version}` : ""}` : "Not reachable from here"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>URL: <span className="text-foreground">{bifrost.url}</span></p>
            <p>{bifrost.note}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Routing policy — who does the work
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.tiers.map((t) => (
            <div key={t.key} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{t.label}</span>
                <Badge variant="outline" className="text-[10px]">{t.key}</Badge>
                <Badge variant="outline" className="text-[10px]">fuel: {t.fuel}</Badge>
                {t.overridden ? (
                  <Badge className="bg-primary/15 text-primary border-0 text-[10px]">Operator override</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Default</Badge>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto">~{fmt(t.typicalWeightedTokens)} weighted tokens a job at default</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{t.blurb}</p>
              <div className="flex gap-2">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  value={t.model}
                  disabled={busy || !starimg.catalogOk}
                  onChange={(e) => void setTierModel(t.key, e.target.value)}
                >
                  {!starimg.catalog.includes(t.model) ? <option value={t.model}>{t.model} (not in live catalog)</option> : null}
                  {starimg.catalog.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {t.overridden ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void resetTier(t.key)}>
                    <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                ) : null}
              </div>
              {t.overridden ? (
                <p className="text-[11px] text-muted-foreground">Default was {t.defaultModel}. The override is tried first; the proven defaults stay on the ladder behind it.</p>
              ) : null}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Changes apply to the next job the runner picks up — no redeploy. Costs reconcile to actual weighted
            tokens for models with a known coefficient; a model without one keeps its order-time estimate.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Usage — the job ledger, real numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-lg font-black">{fmt(u.jobsDone)}</div>
              <div className="text-[11px] text-muted-foreground">Jobs done ({fmt(u.jobsFailed)} failed, refunded)</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-lg font-black">{fmt(u.weightedTokensTotal)}</div>
              <div className="text-[11px] text-muted-foreground">Weighted tokens burned</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-lg font-black">{usd(u.estCostUsdBulk)}</div>
              <div className="text-[11px] text-muted-foreground">Est. cost at $100 / 2B rate</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-lg font-black">{fmt(u.factoryItemsThisMonth)}</div>
              <div className="text-[11px] text-muted-foreground">Factory items this month (all members)</div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold mb-2">By tier</p>
              {u.byTier.length === 0 ? <p className="text-[11px] text-muted-foreground">No completed jobs yet.</p> : u.byTier.map((r) => (
                <div key={r.tier} className="flex items-center gap-2 text-xs py-1">
                  <span className="font-medium">{r.tier}</span>
                  <span className="text-muted-foreground ml-auto">{fmt(r.jobs)} jobs · {fmt(r.weightedTokens)} weighted</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold mb-2">By model</p>
              {u.byModel.length === 0 ? <p className="text-[11px] text-muted-foreground">No completed jobs yet.</p> : u.byModel.map((r) => (
                <div key={r.model} className="flex items-center gap-2 text-xs py-1">
                  <span className="font-medium">{r.model}</span>
                  <span className="text-muted-foreground ml-auto">{fmt(r.jobs)} jobs · {fmt(r.weightedTokens)} weighted</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dollar figures are estimates at Dave's Starimg rates ($28 / 250M pack, $100 / 2B bulk — bulk shown above;
            pack rate would be {usd(u.estCostUsdPack)}). Failed jobs are refunded in full and excluded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
