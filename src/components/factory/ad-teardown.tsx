"use client";

import { useState } from "react";
import { Crosshair, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * The teardown card (Dave, 2026-11-19): paste a competitor's post
 * or ad link → the app reads it, tears down why it works, spins
 * angles for the member's business, and hands back ONE command
 * for their agent. Generation stays in the agent (agent-led).
 */

interface TeardownData {
  source: { kind: string; label: string; url: string };
  teardown: {
    hook: string;
    angle: string;
    mechanism: string;
    cta: string;
    angles: { title: string; hook: string; format: string }[];
  };
  command: string;
}

export function AdTeardownCard() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<TeardownData | null>(null);

  async function run() {
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.error("Paste a full link to the post or ad page.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ad-teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as TeardownData & { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Teardown failed — try another link.");
        return;
      }
      setData(json);
    } catch {
      toast.error("Teardown failed — try another link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.command);
      toast.success("Command copied — give it to your agent.");
    } catch {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  }

  const t = data?.teardown;

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary/10 grid place-items-center text-primary shrink-0">
          <Crosshair className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">Steal the angles from an ad that's working</h2>
          <p className="text-sm text-muted-foreground">
            Paste a competitor's post or ad. We read it, tear down why it works, spin the angles for
            your business — and hand you one command your agent runs the whole thing from.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          className="flex-1"
          placeholder="A competitor's post or ad link (X posts read best)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
        />
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />}
          Tear it down
        </Button>
      </div>

      {data && t ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hook</p><p>{t.hook}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Angle</p><p>{t.angle}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mechanism</p><p>{t.mechanism}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CTA</p><p>{t.cta}</p></div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Your angles, from their mechanism</p>
            {t.angles.map((a, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{i + 1}. {a.title}</span>{" "}
                <span className="rounded border px-1 py-0.5 text-[10px] uppercase tracking-wide">{a.format}</span>{" "}
                {a.hook}
              </p>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">The one command for your agent</p>
              <Button size="sm" variant="outline" onClick={() => void copyCommand()}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
              </Button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">{data.command}</pre>
            <p className="text-xs text-muted-foreground">
              Your agent generates from these angles on your key, quotes the cost first, and brings
              everything back here for your approve tap — it never posts on its own.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
