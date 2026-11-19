"use client";

import { useEffect } from "react";
import Link from "next/link";
import { stashRefFromUrl } from "@/lib/ref-stash";
import { ShowcasePhone } from "./showcase-phone";

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

const agentSteps = [
  "A member connects with Whop.",
  "They mint a bridge code in Ralph (“Talk to my Muse”).",
  "The agent calls the Plunder & Riffle MCP bridge: budget-capped, publish-blocked, revocable any time.",
];

export function LandingPage() {
  useEffect(() => {
    stashRefFromUrl();
  }, []);

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
          <nav aria-label="Main" className="flex shrink-0 items-center gap-3 sm:gap-6">
            <a href="#agents" className={`inline-flex min-h-11 items-center text-sm text-zinc-300 hover:text-white ${focus}`}>Agents</a>
            <a href={connectUrl} className={`${button} min-h-11 border border-white/25 px-4 hover:bg-white/10`}>Connect</a>
          </nav>
        </header>

        <main id="main" tabIndex={-1}>
          <section aria-labelledby="hero-title" className="grid items-center gap-x-10 gap-y-9 pt-14 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-y-6 lg:py-20 xl:gap-x-20">
            <div className="min-w-0 text-center lg:self-end lg:text-left">
              <p className={label}>THE CONTENT ENGINE — LIVE</p>
              <h1 id="hero-title" className="mt-5 text-6xl leading-[0.93] font-black tracking-[-0.072em] text-balance sm:text-7xl xl:text-[5.75rem]">
                Marketing that makes itself<span className="text-primary">.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-pretty text-zinc-300 sm:text-lg lg:mx-0">
                Right now, owners are generating inside Telegram — or their agent is doing it for them. This phone is the live feed.
              </p>
            </div>

            <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <ShowcasePhone />
            </div>

            <div className="text-center lg:self-start lg:text-left">
              <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <a href={botUrl} target="_blank" rel="noopener noreferrer" className={`${button} bg-primary text-zinc-950 hover:bg-primary/90`}>
                  Generate in the bot <span aria-hidden="true" className="ml-2">↗</span>
                </a>
                <a href={connectUrl} className={`${button} border border-white/25 hover:bg-white/10`}>
                  Run it with your agent <span aria-hidden="true" className="ml-2">→</span>
                </a>
              </div>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-pretty text-zinc-400 lg:mx-0">
                Free to start: your first Before pack — a pitch and memes about YOUR business — is on us. No card.
              </p>
            </div>
          </section>

          <section aria-labelledby="doors-title" className="pb-16 sm:pb-24">
            <h2 id="doors-title" className="mb-7 text-4xl font-bold tracking-tight sm:text-5xl">Two ways in</h2>
            <div className="grid gap-7 sm:grid-cols-2 sm:gap-10">
              <div className="border-t border-white/20 pt-5">
                <h3 className={label}>IN THE BOT</h3>
                <p className="mt-3 max-w-md text-lg leading-relaxed text-pretty text-zinc-300">
                  Open <span translate="no">@thewhoppbot</span>, drop your website, get your Before pack right in the chat. No dashboard, no signup wall.
                </p>
                <a href={botUrl} target="_blank" rel="noopener noreferrer" className={textLink}>
                  Open the bot <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="border-t border-white/20 pt-5">
                <h3 className={label}>WITH YOUR AGENT</h3>
                <p className="mt-3 max-w-md text-lg leading-relaxed text-pretty text-zinc-300">
                  Your agent connects once and generates on your key, your budget, your approve tap — publishing stays yours.
                </p>
                <a href={connectUrl} className={textLink}>Connect <span aria-hidden="true">→</span></a>
                <p className="text-sm text-zinc-400">
                  No agent yet? <a href="https://www.plunderandriffle.com/muse-invite" className={`inline-flex min-h-11 items-center text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-primary ${focus}`}>Start with Muse <span aria-hidden="true" className="ml-1">→</span></a>
                </p>
              </div>
            </div>
          </section>

          <section id="agents" aria-labelledby="agents-title" className="scroll-mt-6 border-t border-white/15 py-12 sm:py-16">
            <h2 id="agents-title" className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Built for agents, too.</h2>
            <ol className="mt-6 max-w-3xl list-decimal space-y-3 pl-7 font-mono text-sm leading-relaxed text-zinc-300 marker:text-primary sm:text-base">
              {agentSteps.map((step) => <li key={step} className="pl-1">{step}</li>)}
            </ol>
            <Link href="/bridge" className={`${textLink} mt-3`}>
              The bridge, in detail <span aria-hidden="true">→</span>
            </Link>
          </section>
        </main>

        <footer className="border-t border-white/15 py-6 text-xs leading-relaxed text-zinc-400">
          Powered by the <span translate="no">Plunder &amp; Riffle MCP</span> · Referral programs have their own terms; commissions aren’t guaranteed.
        </footer>
      </div>
    </div>
  );
}
