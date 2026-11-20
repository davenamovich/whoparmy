"use client";

import { useEffect, useState, useRef } from "react";
import { stashRefFromUrl } from "@/lib/ref-stash";

const botUrl = "https://t.me/thewhoppbot";
const connectUrl = "/api/auth/whop";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";
const button = `inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full px-5 text-center text-sm font-bold transition-colors ${focus}`;
const textLink = `inline-flex min-h-11 touch-manipulation items-center gap-2 font-semibold text-primary hover:underline underline-offset-4 ${focus}`;
const label = "font-mono text-xs font-semibold tracking-[0.18em] text-primary";

const application = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Plunder & Riffle",
  applicationCategory: "BusinessApplication",
  offers: [
    { "@type": "Offer", name: "Trial", price: 0, priceCurrency: "USD" },
    { "@type": "Offer", name: "Starter", price: 29, priceCurrency: "USD" },
    { "@type": "Offer", name: "Operator", price: 79, priceCurrency: "USD" },
    { "@type": "Offer", name: "Agency", price: 199, priceCurrency: "USD" },
  ],
};

const PROMPT_TEXT = `You're my Muse. Build me the stack I can run tomorrow morning, not a plan.

ABOUT ME
Business: <one sentence. what you sell, to whom>
Customers: <who they are, and where they already find you>
Offer: <what you sell and the price>
Already have: <site / Instagram / nothing>
Time per week: <30 minutes>

WHAT TO DO
1. If anything above is thin, ask me — one question at a time, nine at most. Don't guess.
2. Write my brand profile from my site: my voice, words I'd never use, my offers, three things I'd refuse.
3. Build a standing brief: who I'm talking to, what I post about, what I never post.
4. Make one week of content with the Plunder & Riffle engine: five memes and three short videos about my actual business, each with a caption.
5. Show me all of it for approval. Nothing gets published without my tap.
6. Tell me what to do Monday: what to post, in what order, and what to watch.

RULES
No invented numbers, no testimonials I don't have, no publishing without my yes. If you don't know something, ask me.`;

export function LandingPage() {
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    stashRefFromUrl();
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (promptRef.current) {
        const range = document.createRange();
        range.selectNodeContents(promptRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  };

  return (
    <div className="min-h-screen flex-1 overflow-x-clip bg-zinc-950 font-sans text-zinc-50 [color-scheme:dark]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(application) }} />
      <a href="#main" className="sr-only z-50 rounded-md bg-zinc-950 p-3 text-zinc-50 focus:not-sr-only focus:absolute focus:top-3 focus:left-3">
        Skip to content
      </a>

      <div className="mx-auto max-w-7xl px-5 sm:px-9 lg:px-12">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-white/15">
          <span translate="no" className="text-xs leading-tight font-black tracking-[0.12em] sm:text-sm">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </span>
          <nav aria-label="Main" className="flex shrink-0 items-center gap-3">
            <a href={connectUrl} className={`${button} min-h-11 border border-white/25 px-4 hover:bg-white/10`}>Connect</a>
          </nav>
        </header>

        <main id="main" tabIndex={-1}>
          <section aria-labelledby="hero-title" className="mx-auto max-w-3xl pt-14 pb-16 text-center sm:pt-20 sm:pb-20">
            <p className={label}>THE STACK YOU RUN TOMORROW</p>
            <h1 id="hero-title" className="mt-5 text-6xl leading-[0.93] font-black tracking-[-0.072em] text-balance sm:text-7xl xl:text-[5.75rem]">
              Built by Muse in one session<span className="text-primary">.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-pretty text-zinc-300 sm:text-lg">
              Solo founders and small businesses: copy this prompt into Muse. It asks what it needs to know, then builds a stack you can run tomorrow morning.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={handleCopy} className={`${button} bg-primary text-zinc-950 hover:bg-primary/90`}>
                {copied ? "Copied" : "Copy the prompt"}
              </button>
              <span role="status" aria-live="polite" className="sr-only">{copied ? "Prompt copied to the clipboard" : ""}</span>
              <a href="https://www.plunderandriffle.com/muse-invite" target="_blank" rel="noopener noreferrer" className={`${button} border border-white/25 hover:bg-white/10`}>
                Open Muse <span aria-hidden="true" className="ml-2">↗</span>
              </a>
            </div>
          </section>

          <section aria-labelledby="prompt-title" className="mx-auto max-w-4xl pb-16 sm:pb-24">
            <h2 id="prompt-title" className="sr-only">The prompt</h2>
            <div className="rounded-lg border border-white/15 bg-zinc-900/50 p-6 sm:p-8">
              <pre
                ref={promptRef}
                className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-200 sm:text-sm"
                tabIndex={0}
              >
                {PROMPT_TEXT}
              </pre>
              <button
                onClick={handleCopy}
                className={`mt-6 ${button} w-full border border-white/25 hover:bg-white/10 sm:w-auto`}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-pretty text-zinc-400">
              Paste this into Muse. It will ask you up to nine questions about your business, then build your brand profile, a standing brief, and a week of content made by the Plunder &amp; Riffle engine. Free to start: your first Before pack — a pitch and memes about your business — no card.
            </p>
          </section>

          <section aria-labelledby="builds-title" className="mx-auto max-w-3xl border-t border-white/15 pt-12 pb-16 sm:pt-16 sm:pb-24">
            <h2 id="builds-title" className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">What it builds</h2>
            <ul className="mt-8 space-y-5 text-base leading-relaxed text-zinc-300 sm:text-lg">
              <li className="border-t border-white/10 pt-4">A brand profile written from your site: your voice, your offers, three things you refuse</li>
              <li className="border-t border-white/10 pt-4">A standing brief: who you talk to, what you post about, what you never post</li>
              <li className="border-t border-white/10 pt-4">One week of content made by the engine: five memes and three short videos about your business, each with a caption</li>
              <li className="border-t border-white/10 pt-4">An approval desk where you tap yes before anything goes live</li>
            </ul>
          </section>

          <section aria-labelledby="cost-title" className="mx-auto max-w-3xl border-t border-white/15 pt-12 pb-16 sm:pt-16 sm:pb-24">
            <h2 id="cost-title" className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Cost and commitment</h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-300 sm:text-lg">
              <p>The free tier is an allowance, not a trial you have to remember to cancel. No card to start.</p>
              <p>Nothing publishes without your yes. A human approves every piece, always — yours.</p>
              <p>The prompt is yours to keep and change. It is a text box, not a contract.</p>
            </div>
          </section>

          <section aria-labelledby="cta-title" className="mx-auto max-w-3xl border-t border-white/15 pt-12 pb-16 text-center sm:pt-16 sm:pb-20">
            <h2 id="cta-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">Ready to build your stack?</h2>
            <a href="https://www.plunderandriffle.com/muse-invite" target="_blank" rel="noopener noreferrer" className={`${button} mt-6 bg-primary text-zinc-950 hover:bg-primary/90`}>
              Open Muse <span aria-hidden="true" className="ml-2">↗</span>
            </a>
          </section>
        </main>

        <footer className="border-t border-white/15 py-6 text-xs leading-relaxed text-zinc-400">
          Powered by the <span translate="no">Plunder &amp; Riffle MCP</span> · Referral programs have their own terms; commissions aren't guaranteed.
        </footer>
      </div>
    </div>
  );
}