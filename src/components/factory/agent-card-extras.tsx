"use client";

import { useEffect, useRef, useState } from "react";
import { Rocket, Coins, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  BANKR_LAUNCH_URL,
  maskAddress,
  type AgentCardStats,
  type ProceedsPreference,
} from "@/lib/agent-card-core";

/**
 * Agent card extras (2026-11-21): spots, clicks, a small analytics
 * summary, and the owner-only Bankr token + proceeds options.
 *
 * Rendered ONLY inside the owner's own agents view. Data comes from
 * GET /api/agents/[id]/card, which is session-gated and owner-scoped
 * — a non-owner gets a 404 and this component renders nothing.
 *
 * Clicks are labeled as what they are: clicks on ALL the member's
 * saved links. LinkClick has no per-agent join, so nothing here
 * claims these clicks belong to this agent.
 */
export function AgentCardExtras({ agentId }: { agentId: string }) {
  const { toast } = useToast();
  const [stats, setStats] = useState<AgentCardStats | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [proceeds, setProceeds] = useState<ProceedsPreference>({ enabled: false, pct: 0, target: "BTC" });
  const [busy, setBusy] = useState(false);
  const seededProceeds = useRef(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/agents/${agentId}/card`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AgentCardStats | null) => {
        if (!live || !d) return;
        setStats(d);
        if (!seededProceeds.current) {
          seededProceeds.current = true;
          setProceeds(d.bankr.proceeds);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [agentId]);

  if (!stats) return null;

  async function save(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as AgentCardStats & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      setStats(d);
      setProceeds(d.bankr.proceeds);
      toast({ title: okMsg });
    } catch (err) {
      toast({ title: "That didn't work", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const { spots, clicks, bankr } = stats;
  const hasToken = bankr.tokenAddress !== null;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Spots: {spots.todayUsed} of {spots.todayTotal} used today · {spots.last7DaysUsed} in the last 7 days
      </div>
      <div className="text-[11px] text-muted-foreground">
        Your link clicks — counted across all your saved links, per member (not per agent): {clicks.total} all-time ·{" "}
        {clicks.today} today · {clicks.last7Days} last 7 days · {clicks.last30Days} last 30 days
        {clicks.topLink ? ` · top link: ${clicks.topLink.name} (${clicks.topLink.clicks})` : ""}
      </div>

      <div className="rounded-md border border-border/60 p-3 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bankr token &amp; proceeds — owner only
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Rocket className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Agent token on Bankr</span>
            {hasToken && bankr.tokenChain ? (
              <Badge variant="outline" className="text-[10px]">{bankr.tokenChain}</Badge>
            ) : null}
          </div>
          {hasToken && !editingToken ? (
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-[11px] bg-muted rounded px-1.5 py-0.5">{maskAddress(bankr.tokenAddress!)}</code>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { setTokenInput(bankr.tokenAddress!); setEditingToken(true); }}>
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void save({ tokenAddress: null }, "Token address cleared")}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                className="h-9 text-xs flex-1 min-w-[220px]"
                placeholder="Paste the token contract address (0x… or Solana)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <Button
                size="sm"
                disabled={busy || tokenInput.trim().length === 0}
                onClick={() => void save({ tokenAddress: tokenInput }, "Token address saved").then(() => setEditingToken(false))}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              {editingToken ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingToken(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Launching happens on Bankr, in your own Bankr session — Whop Army never launches for you and never holds
            keys. Paste the contract address here once your token is live.{" "}
            <a
              href={BANKR_LAUNCH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
            >
              Launch a token on Bankr <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Proceeds → buy coin</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={proceeds.enabled}
                onChange={(e) => setProceeds((p) => ({ ...p, enabled: e.target.checked }))}
              />
              On
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              className="h-9 w-20 text-xs"
              value={proceeds.pct}
              onChange={(e) => setProceeds((p) => ({ ...p, pct: Number(e.target.value) }))}
            />
            <span className="text-xs text-muted-foreground">% of proceeds →</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={proceeds.target}
              onChange={(e) => setProceeds((p) => ({ ...p, target: e.target.value as ProceedsPreference["target"] }))}
            >
              <option value="BTC">BTC</option>
              <option value="TOKEN" disabled={!hasToken}>
                My token{hasToken ? "" : " (save a token address first)"}
              </option>
            </select>
            <Button size="sm" disabled={busy} onClick={() => void save({ proceeds }, "Proceeds preference saved")}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This is a recorded instruction on this agent, shown here so you can see your standing preference — nothing
            executes automatically. Any buy happens in Bankr, by your own hand, until a write integration is
            separately approved.
          </p>
        </div>
      </div>
    </div>
  );
}
