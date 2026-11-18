"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * /clips — the review desk. The one screen a human must use.
 *
 * Everything else in the Clipper can be driven by Muse or the Agent37
 * worker. This page is where `approved` is written, and it is the only
 * place it can be written from. There is deliberately no "approve all".
 */

interface ClipPageDTO {
  id: string;
  name: string;
  handle: string;
  niche: string;
  disclosure: string | null;
}

interface ClipDTO {
  id: string;
  pageId: string;
  status: string;
  sourceUrl: string;
  sourceHost: string;
  clipSeconds: number;
  hook: string | null;
  caption: string | null;
  creditWho: string | null;
  pageUrl: string | null;
  mp4Url: string | null;
  warnings: string[];
  blockedReason: string | null;
  error: string | null;
}

interface DeskState {
  pages: ClipPageDTO[];
  clips: ClipDTO[];
  usage: { used: number; limit: number; plan: string };
}

const STATE_COPY: Record<string, string> = {
  draft: "draft",
  queued: "waiting for the worker",
  rendering: "rendering",
  ready: "ready to review",
  approved: "approved",
  exported: "exported",
  failed: "failed",
  blocked: "blocked",
};

export default function ClipsPage() {
  const [state, setState] = useState<DeskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState("");
  const [pageId, setPageId] = useState<string>("");
  const [newPage, setNewPage] = useState({ name: "", handle: "", niche: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/clips");
    const data = (await res.json()) as DeskState & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not load the queue.");
      return;
    }
    setState(data);
    setError(null);
    if (!pageId && data.pages[0]) setPageId(data.pages[0].id);
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/clips/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newPage),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not create the page.");
      setNewPage({ name: "", handle: "", niche: "" });
      setNotice("Page created. Now paste some links.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the page.");
    } finally {
      setBusy(false);
    }
  }

  async function queueLinks() {
    if (!pageId) {
      setError("Create a page first — a clip needs a page to belong to.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const parsed = links
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          // "https://x.com/… | @creator https://x.com/creator/status/…"
          const [url, credit, creditUrl] = line.split("|").map((p) => p.trim());
          return { url, credit: credit || undefined, creditUrl: creditUrl || undefined };
        });

      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pageId, links: parsed }),
      });
      const data = (await res.json()) as {
        error?: string;
        created?: number;
        refused?: Array<{ url: string; reason: string }>;
        left?: number | null;
      };

      if (!res.ok) {
        const refused = data.refused?.map((r) => `${r.url} — ${r.reason}`).join("\n");
        throw new Error([data.error, refused].filter(Boolean).join("\n\n") || "That batch did not go in.");
      }

      const refusedText = data.refused?.length
        ? `\n\n${data.refused.length} refused:\n${data.refused.map((r) => `• ${r.url} — ${r.reason}`).join("\n")}`
        : "";
      setNotice(
        `${data.created ?? 0} queued. Nothing renders until the worker picks them up, and nothing exports until you approve it.${refusedText}`,
      );
      setLinks("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That batch did not go in.");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clips/${id}/approve`, { method: "POST" });
      const data = (await res.json()) as { error?: string; exportToken?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not approve.");
      setNotice(
        data.exportToken
          ? "Approved. The export token is minted — send it with the export call within 24 hours."
          : "Approved.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setBusy(false);
    }
  }

  const usage = state?.usage;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">The Clipper</h1>
        <p className="text-sm text-muted-foreground">
          Clips get queued here, rendered by the engine, and leave only after you approve them. Previews are
          previews — nothing posts itself.
        </p>
        {usage ? (
          <p className="text-sm text-muted-foreground">
            {usage.used} of {usage.limit} clips this month on {usage.plan}.
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="whitespace-pre-wrap rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {!state?.pages.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Set up a page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Page name — e.g. GTA 6 Daily"
              value={newPage.name}
              onChange={(e) => setNewPage({ ...newPage, name: e.target.value })}
            />
            <Input
              placeholder="Handle — @gtadaily6"
              value={newPage.handle}
              onChange={(e) => setNewPage({ ...newPage, handle: e.target.value })}
            />
            <Input
              placeholder="The one angle this page runs"
              value={newPage.niche}
              onChange={(e) => setNewPage({ ...newPage, niche: e.target.value })}
            />
            <Button onClick={createPage} disabled={busy || !newPage.name || !newPage.handle || !newPage.niche}>
              Create page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paste links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {state.pages.map((p) => (
                <Button
                  key={p.id}
                  variant={p.id === pageId ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPageId(p.id)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
            <Textarea
              rows={4}
              placeholder={
                "One link per line.\nhttps://youtu.be/…\nhttps://youtu.be/… | @creator https://x.com/creator/status/…"
              }
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Up to 25 links. Add the creator credit on the same line, or the clip will queue fine and refuse to
              leave until it has one.
            </p>
            <Button onClick={queueLinks} disabled={busy || !links.trim()}>
              Queue them
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Queue {state ? `(${state.clips.length})` : ""}
        </h2>
        {state?.clips.length ? (
          state.clips.map((clip) => (
            <Card key={clip.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={clip.status === "blocked" || clip.status === "failed" ? "destructive" : "secondary"}>
                    {STATE_COPY[clip.status] ?? clip.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{clip.sourceHost}</span>
                  <span className="truncate text-xs text-muted-foreground">{clip.sourceUrl}</span>
                  <span className="text-xs text-muted-foreground">{clip.clipSeconds}s</span>
                </div>

                {clip.hook ? <p className="text-sm font-medium">{clip.hook}</p> : null}
                {clip.caption ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{clip.caption}</p>
                ) : null}

                <p className="text-xs">
                  {clip.creditWho ? (
                    <span className="text-muted-foreground">credit: {clip.creditWho}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      no creator credit — this clip cannot be approved until it has one
                    </span>
                  )}
                </p>

                {clip.warnings.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {clip.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}

                {clip.blockedReason || clip.error ? (
                  <p className="text-xs text-destructive">{clip.blockedReason ?? clip.error}</p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  {clip.pageUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={clip.pageUrl} target="_blank" rel="noreferrer">
                        Preview
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => approve(clip.id)}
                    disabled={busy || clip.status !== "ready"}
                    title={
                      clip.status === "ready"
                        ? "Approve this clip and mint its one-time export token"
                        : "Only a rendered clip can be approved"
                    }
                  >
                    Approve
                  </Button>
                  {clip.mp4Url ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={clip.mp4Url} target="_blank" rel="noreferrer">
                        MP4
                      </a>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nothing queued yet.</p>
        )}
      </section>
    </div>
  );
}
