"use client";

import { useEffect, useState } from "react";
import { Trophy, Flame, Zap, Target, Award, Lock, Check, Swords, Users, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { GameState } from "@/lib/game";
import type { ReferralState } from "@/lib/referrals";
import { useTranslations } from "next-intl";
import { DoorsGame } from "./doors-game";

/**
 * WAR ROOM — the gamified Bifrost layer (HQ screen).
 * XP comes only from real work (packs, campaigns). Energy is the
 * plan's monthly allowance read against real usage — the same numbers
 * the billing gate uses. Model tiers teach the Starimg routing rule:
 * Scout is ~10x cheaper than Flagship and ~200x cheaper than Claude QA.
 */
export function WarRoom() {
  const t = useTranslations("warRoom");
  const tr = useTranslations("referral");
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/war-room")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (alive) setGame(data.game as GameState);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load War Room");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/referrals")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setReferrals(data.referrals as ReferralState);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {t("failed")}: {error}
      </div>
    );
  }
  if (!game) {
    return <div className="text-sm text-muted-foreground py-10 text-center">{t("loading")}</div>;
  }

  const xpPct = game.nextRank
    ? Math.round(((game.xp - game.rank.minXp) / (game.nextRank.minXp - game.rank.minXp)) * 100)
    : 100;
  const energyPct = game.energy.limit > 0 ? Math.min(100, Math.round((game.energy.used / game.energy.limit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Swords className="h-6 w-6 text-primary" /> {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" /> {t("rank")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{game.rank.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("xpLifetime", { xp: game.xp })}</div>
            {game.nextRank ? (
              <div className="mt-3">
                <Progress value={xpPct} className="h-2" />
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  {t("xpToNext", { xp: game.xpToNext, rank: game.nextRank.name })}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-primary mt-3 font-semibold">{t("topRank")}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" /> {t("energyPlan", { plan: game.energy.planName })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">
              {game.energy.used} <span className="text-sm font-medium text-muted-foreground">/ {game.energy.limit} {t("items")}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{t("generationsNote")}</div>
            <div className="mt-3">
              <Progress value={energyPct} className="h-2" />
              <div className="text-[11px] text-muted-foreground mt-1.5">{t("bridgeNote")}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-primary" /> {t("streakTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{t("days", { count: game.streakDays })}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("countsLine", {
                packs: game.counts.packs,
                campaigns: game.counts.campaigns,
                packsToday: game.counts.packsToday,
              })}
            </div>
            <div className="text-[11px] text-muted-foreground mt-3">{t("streakHint")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> {t("missions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {game.missions.map((m) => (
            <div key={m.key} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
              <span
                className={
                  "mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 " +
                  (m.done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")
                }
              >
                {m.locked ? <Lock className="h-3 w-3" /> : m.done ? <Check className="h-3 w-3" /> : null}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{m.title}</span>
                  {m.rewardXp > 0 ? <Badge className="bg-primary/15 text-primary border-0 text-[10px]">+{m.rewardXp} XP</Badge> : null}
                  {m.locked ? <Badge variant="outline" className="text-[10px]">{m.locked}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                {!m.locked ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Progress value={Math.round((m.progress / m.target) * 100)} className="h-1.5 flex-1" />
                    <span className="text-[11px] text-muted-foreground">
                      {m.progress}/{m.target}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <DoorsGame />

      {referrals ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> {tr("titleWithRate")}
              <Badge variant="outline" className="text-[10px] ml-auto">{tr("simulated")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{tr("bodyFull")}</p>
            <p className="text-xs text-muted-foreground">{tr("freeGensNote", { count: referrals.freeGensPerLinkSave })}</p>
            {!referrals.commissionsUnlocked ? (
              <p className="text-xs text-muted-foreground">
                {tr("unlockNote", {
                  need: referrals.commissionUnlockAt,
                  have: referrals.conversions,
                })}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input readOnly value={referrals.link} className="text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(referrals.link).catch(() => {});
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> {copied ? tr("copied") : tr("copyLink")}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{referrals.recruitsCount}</div>
                <div className="text-[11px] text-muted-foreground">{tr("recruits")}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{referrals.conversions}</div>
                <div className="text-[11px] text-muted-foreground">{tr("converted")}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">${(referrals.earnedCents / 100).toFixed(2)}</div>
                <div className="text-[11px] text-muted-foreground">{tr("earned")}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-lg font-black">{referrals.freeGenBalance}</div>
                <div className="text-[11px] text-muted-foreground">{tr("freeGens")}</div>
              </div>
            </div>
            {referrals.recruits.length > 0 ? (
              <div className="space-y-1">
                {referrals.recruits.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{r.whopUsername ?? r.name ?? tr("member")}</span>
                    <Badge variant="outline" className="text-[10px]">{r.plan}</Badge>
                    <span className="text-muted-foreground ml-auto">{r.converted ? tr("rentedBot") : tr("joined")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{tr("empty")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" /> {t("badges")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {game.badges.map((b) => (
                <div
                  key={b.key}
                  className={
                    "rounded-lg border p-3 " +
                    (b.earned ? "border-primary/40 bg-primary/5" : "border-border/60 opacity-55")
                  }
                >
                  <div className="text-sm font-semibold">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{b.description}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mt-1.5 text-primary">
                    {b.earned ? t("earned") : t("locked")}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> {t("modelTiers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {game.tiers.map((tier) => (
              <div key={tier.key} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{tier.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {tier.model} · {t("fuel")}: {tier.fuel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{tier.blurb}</p>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">{t("routingNote")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
