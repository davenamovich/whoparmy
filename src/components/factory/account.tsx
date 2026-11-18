"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Check,
  Crown,
  FileCheck2,
  Languages,
  Loader2,
  LogOut,
  RefreshCcw,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ARMY_PLANS, PLANS, USAGE_NOTE } from "@/lib/plans";
import type { UsageSummaryDTO } from "@/lib/types";
import { useWhopSession, WhopCheckoutButton, type WhopCheckoutUrls } from "./whop-auth";
import { useTranslations } from "next-intl";
import { SectionHeader, StatCard } from "./shared";

const KIND_LABELS: Record<string, string> = {
  TEXT: "Text generations",
  IMAGE: "Meme images",
  FAILED: "Failed attempts",
};

const PLAN_SOURCE_LABELS: Record<string, string> = {
  whop_membership: "Managed by your Whop subscription",
  whop_access: "Verified against your Whop access",
  manual: "Local preview — not a Whop subscription",
  default: "Default tier",
};

function WhopConnection() {
  const { toast } = useToast();
  const { session, loading, reload } = useWhopSession();
  const [syncing, setSyncing] = useState(false);

  async function syncEntitlements() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whop/sync-entitlements", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      toast({
        title: `Plan synced: ${json.planName}`,
        description: "Verified against your live Whop access (API v1 access check).",
      });
      await reload();
    } catch (err) {
      toast({
        title: "Entitlement sync failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/whop/logout", { method: "POST" });
    await reload();
    toast({ title: "Signed out" });
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-card p-5 sm:p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Resolving session…
      </div>
    );
  }

  if (session?.mode === "whop") {
    const u = session.user;
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 rounded-full bg-primary grid place-items-center text-primary-foreground text-base font-black shrink-0">
              {(u.whopUsername ?? u.name ?? "W").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{u.whopUsername ?? u.name}</span>
                <Badge className="bg-primary text-primary-foreground border-0 text-[10px] font-bold">{u.planName}</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {u.whopId ? `${u.whopId} · ` : ""}{PLAN_SOURCE_LABELS[u.planSource] ?? ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => void syncEntitlements()} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5 mr-1" />}
              Sync entitlements
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-3.5 w-3.5 mr-1" /> Sign out
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-primary" /> OAuth identity</span>
          <span className="inline-flex items-center gap-1">
            {session.whop.apiConfigured ? <Check className="h-3 w-3 text-primary" /> : <AlertTriangle className="h-3 w-3 text-amber-400" />}
            API key (entitlement checks &amp; webhooks)
          </span>
          <span className="inline-flex items-center gap-1">
            {session.whop.webhookConfigured ? <Check className="h-3 w-3 text-primary" /> : <AlertTriangle className="h-3 w-3 text-amber-400" />}
            Webhook receiver (live plan updates)
          </span>
          <Badge variant="outline" className="text-[10px]">{session.whop.apiEnv}</Badge>
        </div>
      </div>
    );
  }

  // No "Whop connection" card (Dave, 2026-11-17: deleted from Account
  // & Usage). Signed-in members get the identity header above; anyone
  // else signs in from the landing's Connect with Whop — this view
  // shows nothing here.
  return null;
}

export function AccountView() {
  const { toast } = useToast();
  const tPlans = useTranslations("plans");
  const tCommon = useTranslations("common");
  // Entitlement tiers still arrive in the legacy Whop vocabulary
  // (FREE / CREATOR / PRO / AGENCY) until the billing pass migrates them;
  // map them onto the bot-rental plan names for display.
  const TIER_TO_PLAN: Record<string, "trial" | "starter" | "operator" | "agency"> = {
    free: "trial",
    trial: "trial",
    creator: "starter",
    starter: "starter",
    pro: "operator",
    operator: "operator",
    agency: "agency",
  };
  const planName = (key: string) => tPlans(TIER_TO_PLAN[key.toLowerCase()] ?? "trial");
  const featureText = (f: string): string => {
    const memes = f.match(/^([\d,]+) memes \/ month$/);
    if (memes) return tPlans("memesPerMonth", { count: Number(memes[1].replace(/,/g, "")) });
    const bots = f.match(/^(\d+) rented bots$/);
    if (bots) return tPlans("rentedBots", { count: Number(bots[1]) });
    if (f === "1 trial bot") return tPlans("oneTrialBot");
    if (f === "1 rented meme bot") return tPlans("rentedMemeBot");
    if (f === "All 23 languages") return tPlans("allLanguages");
    if (f === "Full format catalog") return tPlans("fullCatalog");
    if (f === "Campaign marketplace — post and claim") return tPlans("marketplacePostClaim");
    if (f === "Advanced variations") return tPlans("advancedVariations");
    if (f === "Client brands and workspaces") return tPlans("clientBrands");
    if (f === "Campaign marketplace priority") return tPlans("marketplacePriority");
    if (f.startsWith("BYOK upgrade")) return tPlans("byokUpgrade");
    if (f.startsWith("Previews only")) return tPlans("previewsOnly");
    return f;
  };
  const [usage, setUsage] = useState<UsageSummaryDTO | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const { session, reload: reloadSession } = useWhopSession();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load usage");
      setUsage(json as UsageSummaryDTO);
    } catch (err) {
      toast({
        title: "Could not load usage",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function switchPlan(planKey: string, planName: string) {
    setSwitching(planKey);
    try {
      const res = await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Plan switch failed");
      toast({
        title: `Plan set to ${planName}`,
        description: "Preview plan entitlements — billing is handled by Whop subscriptions.",
      });
      await load();
      await reloadSession();
    } catch (err) {
      toast({
        title: "Plan switch failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSwitching(null);
    }
  }

  const usedPct = usage && usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0;

  return (
    <div>
      <SectionHeader
        eyebrow="Account"
        title="Account & Usage"
        subtitle="What you've generated this month, what's left on your plan, and where every item went."
      />

      <WhopConnection />

      {usage === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading usage…
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="This month"
              value={`${usage.used} / ${usage.limit}`}
              icon={Zap}
              hint={`${usage.planName} plan generations`}
            />
            <StatCard label="Ready assets" value={usage.totals.assets} icon={FileCheck2} hint="Generated & DONE" />
            <StatCard label="Campaigns" value={usage.totals.campaigns} icon={Users} hint="All time" />
            <StatCard
              label="Languages used"
              value={usage.totals.languagesUsed}
              icon={Languages}
              hint="Distinct languages shipped"
            />
            <StatCard
              label="Failed"
              value={usage.totals.failed}
              icon={AlertTriangle}
              hint="Failed generations are never charged."
            />
          </div>

          {/* Usage meter */}
          <div className="rounded-2xl border bg-card p-5 sm:p-6 mt-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
              <div>
                <h2 className="font-semibold">Monthly usage</h2>
                <p className="text-sm text-muted-foreground">
                  {usage.used.toLocaleString()} of {usage.limit.toLocaleString()} items used —{" "}
                  <span className="text-primary font-medium">{usage.remaining.toLocaleString()} remaining</span>
                </p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 w-fit">
                <Crown className="h-3 w-3 mr-1" /> {usage.planName}
              </Badge>
            </div>
            <Progress value={usedPct} className="h-3" aria-label={`Usage ${usage.used} of ${usage.limit}`} />

            <Separator className="my-5" />

            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Recent activity
            </h3>
            {usage.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet — generate your first campaign.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60 max-h-64 overflow-y-auto scrollbar-thin">
                {usage.recent.map((r, i) => (
                  <li key={`${r.kind}-${r.createdAt}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm min-w-0">
                      {r.kind === "FAILED" ? (
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      ) : (
                        <Zap className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <span className="truncate">{KIND_LABELS[r.kind] ?? r.kind}</span>
                      {r.kind === "FAILED" ? (
                        <span className="text-[11px] text-muted-foreground shrink-0">(not charged)</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3 shrink-0 text-sm">
                      <span className="font-semibold">× {r.count}</span>
                      <span className="text-xs text-muted-foreground w-24 text-right">
                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Plans */}
          <div className="mt-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{tPlans("title")}</h2>
                <p className="text-sm text-muted-foreground">{tPlans("subtitle")}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((p) => {
                const isCurrent = usage.plan === p.key;
                const checkoutUrl = (session?.whop.checkoutUrls as WhopCheckoutUrls | undefined)?.[p.key as keyof WhopCheckoutUrls] ?? null;
                return (
                  <div
                    key={p.key}
                    className={cn(
                      "rounded-xl border bg-card p-5 flex flex-col gap-4 relative",
                      isCurrent && "ring-2 ring-primary border-primary/40",
                    )}
                  >
                    {isCurrent ? (
                      <Badge className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[11px]">
                        {tCommon("currentPlan")}
                      </Badge>
                    ) : null}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{planName(p.key)}</h3>
                        {p.highlight && !isCurrent ? (
                          <Badge variant="outline" className="bg-secondary/60 text-[11px]">
                            {tPlans("popular")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-2xl font-bold tracking-tight mt-1">{p.price}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {tPlans("itemsPerMonth", { count: p.monthlyItems })}
                      </div>
                    </div>
                    <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground grow">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{featureText(f)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-2">
                      {isCurrent ? (
                        <Button variant="outline" className="w-full font-semibold" disabled>
                          {tCommon("currentPlan")}
                        </Button>
                      ) : checkoutUrl ? (
                        <WhopCheckoutButton url={checkoutUrl} label={tPlans("getOnWhop", { name: planName(p.key) })} />
                      ) : (
                        <Button
                          variant="default"
                          className="w-full font-semibold bg-primary hover:bg-primary/90"
                          disabled={switching !== null}
                          onClick={() => void switchPlan(p.key, p.name)}
                        >
                          {switching === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {tPlans("previewEntitlements")}
                        </Button>
                      )}
                      {!isCurrent && p.key !== "FREE" ? (
                        <p className="text-[11px] text-muted-foreground text-center">
                          {checkoutUrl
                            ? tPlans("checkoutNote")
                            : tPlans("checkoutNotConfigured", { env: `WHOP_CHECKOUT_URL_${p.key}` })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4 max-w-3xl">{tPlans("entitlementsNote")}</p>
          </div>

          {/* Meme Army upsell strip */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6 mt-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
              P&amp;R Meme Army — Turn your followers into your distribution network.
            </h2>
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {ARMY_PLANS.map((ap) => (
                <div key={ap.key} className="rounded-xl border bg-card p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold">{ap.name}</h3>
                    <span className="text-sm font-semibold text-primary">
                      {ap.setup} <span className="text-muted-foreground font-normal">+</span> {ap.monthly}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{ap.blurb}</p>
                  <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                    {ap.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-col gap-2">
                    <WhopCheckoutButton
                      url={session?.whop.checkoutUrls?.[ap.key === "CUSTOM" ? "ARMY_CUSTOM" : "ARMY_AGENCY"] ?? null}
                      label={ap.key === "CUSTOM" ? "Get Custom Bot on Whop" : "Get Agency Bot on Whop"}
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {USAGE_NOTE} Meme Army is billed separately from your Content Factory plan.
            </p>
          </div>

        </>
      )}
    </div>
  );
}
