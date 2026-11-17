"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  Facebook,
  Instagram,
  Linkedin,
  Link2,
  Music2,
  Twitter,
  TriangleAlert,
  Users,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SectionHeader } from "./shared";

const PLATFORMS = [
  { name: "Facebook", icon: Facebook },
  { name: "Instagram", icon: Instagram },
  { name: "X (Twitter)", icon: Twitter },
  { name: "LinkedIn", icon: Linkedin },
  { name: "TikTok", icon: Music2 },
  { name: "YouTube", icon: Youtube },
];

const WORKING_NOW = [
  { icon: Copy, text: "Copy any asset with one tap — Content Library" },
  { icon: Download, text: "Download memes as PNG" },
  { icon: Download, text: "Download text as .txt" },
  { icon: Users, text: "Meme Army members share through their own accounts" },
];

export function PublishingView() {
  const [draft, setDraft] = useState("");

  return (
    <div>
      <SectionHeader
        eyebrow="Publishing"
        title="Publishing"
        subtitle="Push generated content to your connected social accounts."
      />

      {/* Honest state: no provider connected in this build */}
      <Alert className="border-amber-500/40 bg-amber-500/10 mb-6">
        <TriangleAlert className="h-4 w-4 text-amber-400" />
        <AlertTitle>No publishing provider connected</AlertTitle>
        <AlertDescription>
          Connect Upload-Post to enable scheduling and publishing. Until then, every asset still works via one-tap
          Copy or Download.
        </AlertDescription>
      </Alert>

      {/* Platform grid — all honestly disconnected */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {PLATFORMS.map((p) => (
          <div key={p.name} className="rounded-xl border bg-card p-5 flex flex-col items-center text-center gap-3">
            <div className="rounded-xl bg-secondary/60 p-3">
              <p.icon className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="font-semibold text-sm">{p.name}</div>
            <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border text-[11px]">
              Not connected
            </Badge>
            <Button variant="outline" className="w-full" disabled>
              <Link2 className="h-4 w-4" /> Connect
            </Button>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Available after connecting Upload-Post
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* What works right now */}
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">What works right now</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Publishing is not wired up in this build — but nothing blocks you from shipping content today.
          </p>
          <ul className="flex flex-col gap-3">
            {WORKING_NOW.map((w) => (
              <li key={w.text} className="flex items-start gap-3 text-sm">
                <span className="rounded-lg bg-primary/10 p-1.5 shrink-0">
                  <w.icon className="h-4 w-4 text-primary" aria-hidden />
                </span>
                <span className="pt-0.5">{w.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            Copy and download never fail silently — you always get the real asset.
          </div>
        </div>

        {/* Caption preview — a genuinely useful stopgap while publishing is offline */}
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold mb-1">Caption preview</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Paste a caption to see how it reads before you copy it into a platform.
          </p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Paste or type a caption…"
            className="scrollbar-thin"
            aria-label="Caption draft"
          />
          <div className="rounded-xl border bg-secondary/30 p-4 mt-3">
            {draft.trim() ? (
              <p className="text-sm whitespace-pre-wrap break-words scrollbar-thin max-h-48 overflow-y-auto">
                {draft}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Your caption preview appears here.</p>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>{draft.length.toLocaleString()} characters</span>
            <span>Reference: X posts cap at 280</span>
          </div>
        </div>
      </div>
    </div>
  );
}
