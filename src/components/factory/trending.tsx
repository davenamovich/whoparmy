"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Flame, RefreshCcw, ExternalLink, Zap, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * TRENDING — the day's default topics.
 *
 * Topics (Google Trends + Google News) with a viral headline written
 * for each, settled once per day server-side: the first read of the
 * day builds the set and every refresh serves that same snapshot,
 * so the wire never reloads under a member. One click creates: the
 * headline becomes a meme job on the member's first active bot.
 * No bot yet → the click routes to the Army to rent one. The viral3
 * Scout's weekly deep-scan batches (Video Studio) stay the curated
 * layer; this is the daily wire.
 */

interface TrendTopic {
  title: string;
  traffic: string | null;
  source: string;
  link: string;
  publishedAt: string | null;
  headline: string;
  hook: string;
}

export function TrendingView({ onGoAgents }: { onGoAgents: () => void }) {
  const locale = useLocale();
  const [topics, setTopics] = useState<TrendTopic[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/trends?lang=${encodeURIComponent(locale)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setTopics(json.topics as TrendTopic[]);
      setUpdatedAt(json.updatedAt as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trending");
    } finally {
      setRefreshing(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createFromTrend(topic: TrendTopic, idx: number) {
    setBusyIdx(idx);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load your bots");
      const hire = (json.hires as { id: string; status: string }[]).find((h) => h.status === "ACTIVE");
      if (!hire) {
        toast.info("Rent a bot first — then every headline here is one-click creation.");
        onGoAgents();
        return;
      }
      const brief = `TRENDING NOW: "${topic.title}"${topic.traffic ? ` (${topic.traffic} searches today)` : ""}. Headline angle: ${topic.headline}${topic.hook ? `. Hook: ${topic.hook}` : ""}. Ride this trend for the business — timely, native, shareable.`;
      const jobRes = await fetch(`/api/agents/${hire.id}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "MEME", brief, pieces: 3, language: locale }),
      });
      const jobJson = await jobRes.json();
      if (!jobRes.ok) throw new Error(jobJson.error ?? "Job failed to start");
      toast.success("Your bot is on it — memes from this headline are being created. Watch the Agents board.");
      onGoAgents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setBusyIdx(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <Flame className="h-6 w-6 text-primary" /> Trending now
            <Badge className="bg-red-500/15 text-red-500 border-0 text-[10px]">TODAY</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            What's moving today, a viral headline written for each — and one click turns any of them into
            memes from your bot. Today's topics are set once for the day, so every refresh shows the same
            wire. A fresh set lands tomorrow.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" disabled={refreshing} onClick={() => void load()}>
          <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {updatedAt ? (
        <p className="text-[11px] text-muted-foreground">Today's topics set {new Date(updatedAt).toLocaleTimeString()} · Sources: Google Trends + Google News · Headlines by the Scout tier</p>
      ) : null}

      {error ? (
        <Card><CardContent className="py-10 text-center">
          <p className="text-sm font-semibold">The wire is down</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </CardContent></Card>
      ) : topics === null ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Reading the wire…</CardContent></Card>
      ) : topics.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No topics came back — hit Refresh in a moment.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {topics.map((t, i) => (
            <Card key={`${t.title}-${i}`} className={i < 3 ? "border-primary/40" : undefined}>
              <CardContent className="py-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-black text-foreground/60">#{i + 1}</span>
                  {t.traffic ? (
                    <Badge className="bg-red-500/15 text-red-500 border-0 text-[10px]">{t.traffic} searches</Badge>
                  ) : null}
                  <span>{t.source}</span>
                  {t.publishedAt ? <span>· {new Date(t.publishedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
                  <a href={t.link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
                    Topic <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-[13px] text-muted-foreground">{t.title}</p>
                <p className="text-base font-black leading-snug">{t.headline}</p>
                {t.hook ? <p className="text-xs text-muted-foreground">{t.hook}</p> : null}
                <Button size="sm" className="w-full" disabled={busyIdx === i} onClick={() => void createFromTrend(t, i)}>
                  {busyIdx === i ? <RefreshCcw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                  Create memes from this headline
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Bot className="h-3.5 w-3.5" />
        Deeper cuts: the viral3 Scout's weekly trend batches feed the Video Studio — this wire is the daily layer on top.
      </p>
    </div>
  );
}
