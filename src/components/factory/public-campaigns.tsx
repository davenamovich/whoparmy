"use client";

import { useState } from "react";
import {
  Bot,
  Globe2,
  Languages,
  Loader2,
  Megaphone,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Public Campaigns — "Coming Soon" teaser.
 * A public campaign is one the owner opens to the network: other P&R Meme Army
 * bots and their community members can pick up the brief and submit localized
 * content (memes, posts, scripts) straight into the campaign for review.
 */

const STEPS = [
  {
    icon: Megaphone,
    title: "Open a campaign to the network",
    body: "Flip any campaign from Private to Public and set the bounty, formats and languages you want back.",
  },
  {
    icon: Bot,
    title: "Meme Armies pick up the brief",
    body: "Other Whop owners' bots push your brief to their communities as daily missions — members create and submit.",
  },
  {
    icon: Languages,
    title: "Localized content lands in your inbox",
    body: "Submissions arrive in your campaign, tagged by language and contributor — approve, request edits or reward.",
  },
];

export function PublicCampaignsTeaser({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={
          compact
            ? "rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-4 sm:p-5"
            : "rounded-2xl border border-dashed border-primary/35 bg-primary/[0.05] p-5 sm:p-7 ember-glow relative overflow-hidden"
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="rounded-xl bg-primary/12 grid place-items-center p-3 shrink-0">
              <Globe2 className={compact ? "h-5 w-5 text-primary" : "h-6 w-6 text-primary"} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold tracking-tight text-base sm:text-lg">Public Campaigns</h3>
                <Badge variant="outline" className="bg-primary/12 text-primary border-primary/30 text-[10px] font-bold tracking-wider">
                  <span className="relative flex h-1.5 w-1.5 mr-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  COMING SOON
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
                {compact
                  ? "Open a campaign to the network — other Meme Army bots and their communities will submit localized memes and posts straight into it."
                  : "Open any campaign to the P&R network. Other Meme Army bots and their community members pick up your brief and submit localized memes, posts and scripts for your review — you approve what ships and reward the best armies."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary shrink-0 font-semibold"
            onClick={() => setOpen(true)}
          >
            <Megaphone className="h-4 w-4" /> How it will work
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <Globe2 className="h-5 w-5 text-primary" /> Public Campaigns
              <Badge variant="outline" className="bg-primary/12 text-primary border-primary/30 text-[10px] font-bold tracking-wider">
                COMING SOON
              </Badge>
            </DialogTitle>
            <DialogDescription>
              One brief. Every army. Content in every language your market speaks — submitted by real
              communities, reviewed by you.
            </DialogDescription>
          </DialogHeader>

          <ol className="flex flex-col gap-4 my-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-3.5 rounded-xl border bg-card p-4">
                <div className="relative shrink-0">
                  <span className="rounded-lg bg-primary/12 grid place-items-center p-2.5">
                    <s.icon className="h-5 w-5 text-primary" />
                  </span>
                  <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{s.title}</div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-xl bg-secondary/50 border p-3.5 flex items-start gap-2.5">
            <Upload className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Submissions are content only — posting stays on each member&apos;s own accounts. Bounties are
              held in escrow and only released on approved work. Opt-in for every army, always.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)} className="font-semibold">
              <Loader2 className="h-4 w-4 hidden" /> Got it — can&apos;t wait
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
