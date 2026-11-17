"use client";

import { useEffect, useState } from "react";
import { Trophy, Flame, Zap, Target, Award, Lock, Check, Swords } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { GameState } from "@/lib/game";

/**
 * WAR ROOM — the gamified Bifrost layer (HQ screen).
 * XP comes only from real work (packs, campaigns). Energy is the
 * plan's monthly allowance read against real usage — the same numbers
 * the billing gate uses. Model tiers teach the Starimg routing rule:
 * Scout is ~10x cheaper than Flagship and ~200x cheaper than Claude QA.
 */
export function WarRoom() {
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        War Room failed to load: {error}
      </div>
    );
  }
  if (!game) {
    return <div className="text-sm text-muted-foreground py-10 text-center">Loading your War Room…</div>;
  }

  const xpPct = game.nextRank
    ? Math.round(((game.xp - game.rank.minXp) / (game.nextRank.minXp - game.rank.minXp)) * 100)
    : 100;
  const energyPct = game.energy.limit > 0 ? Math.min(100, Math.round((game.energy.used / game.energy.limit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Swords className="h-6 w-6 text-primary" /> War Room
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your rank in the Meme Army. XP is earned by shipping real content — never by clicking around.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Rank
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{game.rank.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{game.xp} XP lifetime</div>
            {game.nextRank ? (
              <div className="mt-3">
                <Progress value={xpPct} className="h-2" />
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  {game.xpToNext} XP to {game.nextRank.name}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-primary mt-3 font-semibold">Top rank. The army salutes you.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" /> Energy — {game.energy.planName} plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">
              {game.energy.used} <span className="text-sm font-medium text-muted-foreground">/ {game.energy.limit} items</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Generations used this month. Failed runs never count.</div>
            <div className="mt-3">
              <Progress value={energyPct} className="h-2" />
              <div className="text-[11px] text-muted-foreground mt-1.5">
                With the Bridge (Phase 2), Energy becomes your live model-token budget.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-primary" /> Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">
              {game.streakDays} <span className="text-sm font-medium text-muted-foreground">day{game.streakDays === 1 ? "" : "s"}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {game.counts.packs} packs · {game.counts.campaigns} campaigns · {game.counts.packsToday} pack{game.counts.packsToday === 1 ? "" : "s"} today
            </div>
            <div className="text-[11px] text-muted-foreground mt-3">Earn XP on consecutive days to grow the streak.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Missions
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" /> Badges
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
                    {b.earned ? "Earned" : "Locked"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Model tiers — pick your weapon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {game.tiers.map((t) => (
              <div key={t.key} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{t.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t.model} · x{t.coefficient} · ~{t.typicalWeightedTokens.toLocaleString()} tokens a job
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.blurb}</p>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Routing rule: volume on Scout, everyday work on Balanced, the line that ships on Flagship, Claude QA
              only when it is worth ~200x. Costs verified in a live run, 2026-11-16.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
