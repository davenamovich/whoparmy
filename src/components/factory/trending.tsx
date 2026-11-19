"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Flame, RefreshCcw, ExternalLink, Zap, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReplyGuyButton } from "./reply-guy";
import { handBriefToMemeSmith } from "./agent-handoff";

const X_POST_RE = /^https:\/\/(x\.com|twitter\.com)\/[^/]+\/status\/\d+/;

/**
 * TRENDING — the day's default topics.
 *
 * Topics (Google Trends + Google News) with a viral headline written
 * for each, settled once per day server-side: the first read of the
 * day builds the set and every refresh serves that same snapshot,
 * so the wire never reloads under a member. One click hands off:
 * the headline becomes a meme job for the member's own Meme Smith
 * (Dave, 2026-11-19 — no manual studios; agents create). No Meme
 * Smith yet → the click routes to the Agents floor to set one up.
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

export function TrendingView({ onGoToAgents }: { onGoToAgents: () => void }) {
  const locale = useLocale();
  const [topics, setTopics] = useState<TrendTopic[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Dave, 2026-11-19: the manual studios are gone — a headline
  // becomes a job handed to the member's own Meme Smith, never a
  // form the member fills in. No Meme Smith yet → the Agents floor.
  const [handingOff, setHandingOff] = useState<string | null>(null);
  async function createFromTrend(topic: TrendTopic) {
    const brief = `TRENDING NOW: "${topic.title}"${topic.traffic ? ` (${topic.traffic} searches today)` : ""}. Headline angle: ${topic.headline}${topic.hook ? `. Hook: ${topic.hook}` : ""}. Ride this trend for my business — timely, native, shareable.`;
    setHandingOff(topic.title);
    const result = await handBriefToMemeSmith(brief);
    setHandingOff(null);
    if (result.ok) {
      toast.success(result.message);
    } else if (result.noAgent) {
      toast.error(result.message);
      onGoToAgents();
    } else {
      toast.error(result.message);
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
            What's moving today, a viral headline written for each — and one click loads any of them into
            Create a Meme, ready to generate. On X posts, Reply Guy goes further: it reads the post, writes
            your reply, makes the meme, and posts the reply in one click. Today's topics are set once for
            the day, so every refresh shows the same wire. A fresh set lands tomorrow.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" disabled={refreshing} onClick={() => void load()}>
          <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>
      {updatedAt ? (
        <p className="text-[11px] text-muted-foreground">
          Today's topics set {new Date(updatedAt).toLocaleTimeString()} ·{" "}
          {topics?.some((t) => t.source.startsWith("X"))
            ? "Sources: X posts, read and verified · Reply Guy rides them with a meme"
            : "Sources: Google Trends + Google News · Headlines by the Scout tier"}
        </p>
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
                    <Badge className="bg-red-500/15 text-red-500 border-0 text-[10px]">{t.source.startsWith("X") ? t.traffic : `${t.traffic} searches`}</Badge>
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
                <Button size="sm" className="w-full" disabled={handingOff === t.title} onClick={() => void createFromTrend(t)}>
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  {handingOff === t.title ? "Handing to your Meme Smith…" : "Hand to my Meme Smith"}
                </Button>
                {X_POST_RE.test(t.link) ? <ReplyGuyButton topic={t} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Bot className="h-3.5 w-3.5" />
        Deeper cuts: the viral3 Scout's weekly trend batches feed your agents' research — this wire is the daily layer on top.
      </p>
    </div>
  );
}
