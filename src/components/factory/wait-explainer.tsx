"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface WaitSlide {
  title: string;
  body: string;
}

/**
 * ─── WAIT EXPLAINER — keep the member oriented during long runs ────
 *
 * Dave's direction (2026-11-17): a bare progress bar is not enough.
 * While the engine works, walk the member through what is about to
 * happen, what the output is for, and what they can do with it —
 * rotating panels, one idea at a time, so the wait teaches the
 * product instead of testing patience.
 */
export function WaitExplainer({ slides, intervalMs = 6500 }: { slides: WaitSlide[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(t);
  }, [slides.length, intervalMs]);
  const slide = slides[Math.min(idx, slides.length - 1)];
  if (!slide) return null;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 text-left">
      <div key={idx} className="min-h-[76px]">
        <div className="text-sm font-bold text-foreground">{slide.title}</div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{slide.body}</p>
      </div>
      {slides.length > 1 ? (
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <span
              key={s.title}
              className={cn("h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-primary" : "w-1.5 bg-primary/30")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Create-wizard generation: what the engine is doing + what memes do. */
export const GENERATE_WAIT_SLIDES: WaitSlide[] = [
  {
    title: "Deep work first",
    body: "Before anything is drawn, the engine studies your business — your offer, your audience, the angle that makes a stranger stop scrolling. That homework is why the memes land instead of reading like ads.",
  },
  {
    title: "What a meme actually does",
    body: "A meme is the one ad format people forward on purpose. It rides into group chats and feeds carrying your name and your links — attention you don't have to buy twice.",
  },
  {
    title: "Built for any business",
    body: "Plumber or coach, coffee shop or SaaS — if your customers scroll, this works. Every piece is written for YOUR business and rendered in your customers' languages.",
  },
  {
    title: "What's being made right now",
    body: "Every format you picked, written and rendered piece by piece in every language you chose. Real generation — when a piece fails, it is retried or refunded, never faked.",
  },
  {
    title: "What you can do with the pack",
    body: "Post it yourself, hand it to your rented bots, or let your Meme Army spread it. Pieces can carry your referral links — the ones you saved on the bridge — so shares can pay you back.",
  },
  {
    title: "What happens next",
    body: "When the bar fills you'll land in your workspace: preview every piece, download the pack, regenerate anything that's off. Nothing ever posts without you.",
  },
];

/** Brand deep research: what the engine is reading and why. */
export const RESEARCH_WAIT_SLIDES: WaitSlide[] = [
  {
    title: "Deep research, not a quick scan",
    body: "P&R is reading your website and the wider web right now — your offer, your reviews, your competitors — and turning it into a working profile of your business.",
  },
  {
    title: "Why it matters",
    body: "Memes built on real customer pains outperform generic jokes every time. This research is where those pains — and the angles that answer them — come from.",
  },
  {
    title: "What you'll get",
    body: "A filled-in brand profile: your voice, your customers' pains, angles that land, competitors spotted. Every campaign you run from here starts with this homework already done.",
  },
  {
    title: "Works for any business",
    body: "Local services, shops, creators, online stores — if it has customers, the engine can learn it. One research pass powers every meme, hook and campaign you make after.",
  },
];
