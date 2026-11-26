"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { readStashedRef, stashRefFromUrl } from "@/lib/ref-stash";
import { validateIntakeInput, type IntakeIntent } from "@/lib/intake";
import { ReferralLinkCard } from "@/components/referral-link-card";

/**
 * ─── / — Whop Army 2.0, Slice 1 (Dave's tap, 2026-11-21) ───────────
 *
 * "Remove most of /" — the one-time door's sections are gone. What
 * remains is the 2.0 front door and nothing else:
 *
 *   WHOP ARMY — Agents that do things.
 *   EXPLORE SPACES · BUILD AN AGENT · ENTER THE ROTATOR
 *
 * Destinations are existing surfaces only, in layer order:
 *   - SPACES            -> /spaces (working products and kits on the
 *                          engine)
 *   - BUILD AN AGENT    -> /build (the Build-an-Agent flow)
 *   - ENTER THE ROTATOR -> /rotator (the public rotator)
 *   - AGENT TOWN        -> /town (where agents live)
 *   - DISCOVER AGENTS   -> /agents (the public agent directory)
 *
 * The session probe survives only so operators keep their /admin
 * door in the header. Member rooms and their APIs are untouched —
 * members live in their own agent, reached via /bridge.
 *
 * Referral link card (Dave, 2026-11-24): the main page also hands a
 * connected member their referral link directly (components/
 * referral-link-card.tsx, fed by GET /api/referrals).
 *
 * Design Engine redo (2026-11-24): shared shell, In→Out engine strip
 * as the signature, crew row, destination cards. Same destinations,
 * same copy facts, same probe — visual/layout only.
 *
 * Intake homepage (SITE-REDO-SPEC-2026-11-26 §4, H1): the LOGGED-OUT
 * homepage is now the intake — one phone-first claim form (POST
 * /api/intake) that records the claim and hands the visitor to their
 * Muse with the real starter prompt. Connected members keep the
 * front door above, plus a starter-prompt section so a member who
 * claimed while logged out can mint their prompt after sign-in.
 * Onboarding itself never happens here — it happens in Muse.
 */

const DISCOVER_URL = "/agents";
const SPACES_URL = "/spaces";
const ROTATOR_URL = "/rotator";
const BUILD_URL = "/build";
const TOWN_URL = "/town";
const CONNECT_URL = "/api/auth/whop";

type Session = { connected: boolean; admin: boolean; user: { name: string | null; whopUsername: string | null } | null };

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const CREW = [
  { name: "Lead", job: "Routes requests." },
  { name: "Scout", job: "Finds trends." },
  { name: "Maker", job: "Makes your content." },
  { name: "Promoter", job: "Asks before posting." },
  { name: "Analyst", job: "Tracks results." },
];

const DESTINATIONS = [
  {
    href: SPACES_URL,
    title: "Spaces",
    body: "Live tools and kits.",
  },
  {
    href: BUILD_URL,
    title: "Build an agent",
    body: "Build your business agent.",
  },
  {
    href: ROTATOR_URL,
    title: "Enter the rotator",
    body: "Claim today's rotation spot.",
  },
  {
    href: TOWN_URL,
    title: "Agent Town",
    body: "Meet agents. See activity.",
  },
  {
    href: DISCOVER_URL,
    title: "Discover agents",
    body: "Browse agents and traffic.",
  },
];

const INTENTS: { value: IntakeIntent; title: string }[] = [
  { value: "content_pack", title: "Content pack" },
  { value: "seo_audit", title: "SEO audit" },
  { value: "ceo_experience", title: "CEO Experience — $997 one-time" },
  { value: "just_agent", title: "Just my agent" },
];

/** Signature: the In → Out engine strip (shared by both views). */
function EngineStrip() {
  return (
    <div
      className="mt-14 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]"
      aria-label="How the engine works: inputs in, work out"
    >
      <div className="rounded-[10px] border border-border bg-card p-5">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-primary">IN</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li>Your website</li>
          <li>Your ideas</li>
          <li>Your voice</li>
        </ul>
      </div>
      <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">
        →
      </div>
      <div className="rounded-[10px] border border-accent bg-card p-5 text-center">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-accent">ENGINE</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Lead · Scout · Maker · Promoter · Analyst
        </p>
      </div>
      <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">
        →
      </div>
      <div className="rounded-[10px] border border-border bg-card p-5">
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-primary">OUT</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li>Memes</li>
          <li>Videos</li>
          <li>Social posts</li>
          <li>Audio</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * The real starter prompt, minted ONLY on the member's explicit tap
 * (POST /api/blueprint {action:"setup"} retires older unused bridge
 * codes — never call it on page load).
 */
function StarterPromptPanel() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function showPrompt() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!res.ok || !data.prompt) throw new Error(data.error ?? "Could not make your prompt. Try again.");
      setPrompt(data.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make your prompt. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setError("Copy failed — select the prompt text and copy it by hand.");
    }
  }

  if (!prompt) {
    return (
      <div>
        <Button size="lg" onClick={() => void showPrompt()} disabled={busy}>
          {busy ? "Making your prompt…" : "Show my starter prompt"}
        </Button>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-card p-4 text-left text-xs leading-relaxed">
        {prompt}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => void copyPrompt()}>
          Copy prompt
        </Button>
        {copied ? <span className="text-sm font-medium text-primary">Copied</span> : null}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type FieldErrors = { name?: string; businessName?: string; websiteUrl?: string; intent?: string };

function IntakeView({ connected, onEngage }: { connected: boolean; onEngage?: () => void }) {
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [noWebsite, setNoWebsite] = useState(false);
  const [intent, setIntent] = useState<IntakeIntent | "">("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submittedIntent, setSubmittedIntent] = useState<IntakeIntent | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const candidate = { name, businessName, websiteUrl, noWebsite, intent, refCode: readStashedRef() };
    const check = validateIntakeInput(candidate);
    if (!check.ok) {
      // Mirror the server rules; pin the message to its field.
      const msg = check.error;
      const m = msg.toLowerCase();
      const next: FieldErrors = {};
      if (m.includes("name") && !m.includes("business")) next.name = msg;
      else if (m.includes("business")) next.businessName = msg;
      else if (m.includes("website")) next.websiteUrl = msg;
      else if (m.includes("pick")) next.intent = msg;
      else setFormError(msg);
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const source = new URLSearchParams(window.location.search).get("source");
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...candidate, source }),
      });
      const data = (await res.json().catch(() => ({}))) as { intake?: { id: string; intent: IntakeIntent }; error?: string };
      if (!res.ok || !data.intake) throw new Error(data.error ?? "Something went wrong. Try again.");
      // The Whop login that follows the claim lands on the member
      // homepage — this flag tells it to surface the starter prompt.
      try {
        window.localStorage.setItem("wa_intake_claimed", data.intake.intent);
      } catch {
        // storage unavailable — the prompt section is on the page anyway
      }
      setSubmittedIntent(data.intake.intent);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <a href="/" translate="no" className="font-display text-xs font-extrabold tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </a>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
            <a className="text-muted-foreground transition-colors hover:text-foreground" href="#how">
              How it works
            </a>
            <a className="font-semibold text-primary underline underline-offset-2" href={CONNECT_URL}>
              Sign in
            </a>
          </nav>
        </header>

        <section className="py-14 sm:py-20">
          <p className={label}>Whop Army</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Claim your Muse.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Your business, marketed while you run it.
          </p>

          {submittedIntent ? (
            <div className="mt-10 max-w-2xl rounded-[10px] border border-border bg-card p-5 sm:p-6">
              {connected ? (
                <>
                  <h2 className="text-2xl font-bold tracking-tight">Now open Muse and paste this.</h2>
                  <div className="mt-5">
                    <StarterPromptPanel />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold tracking-tight">Your claim is saved.</h2>
                  <p className="mt-4 font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                    Step 2 — required
                  </p>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    Log in with Whop to get your prompt. It is minted to your account — that is what makes it yours.
                  </p>
                  <Button asChild size="lg" className="mt-4">
                    <a href={CONNECT_URL}>Log in with Whop</a>
                  </Button>
                </>
              )}
              {submittedIntent === "ceo_experience" ? (
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  CEO Experience ($997) — your Muse walks you through that step next.
                </p>
              ) : null}
              <p className="mt-4 font-medium">Your Muse takes it from here.</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => void submit(e)}
              onChange={onEngage}
              onClickCapture={onEngage}
              noValidate
              className="mt-10 max-w-2xl rounded-[10px] border border-border bg-card p-5 sm:p-6"
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="intake-name">Your name</Label>
                  <Input
                    id="intake-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.name}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="intake-business">Business name</Label>
                  <Input
                    id="intake-business"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    autoComplete="organization"
                    aria-invalid={Boolean(errors.businessName)}
                  />
                  {errors.businessName ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.businessName}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="intake-website">Your website</Label>
                  <Input
                    id="intake-website"
                    type="url"
                    inputMode="url"
                    placeholder="yourbusiness.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    disabled={noWebsite}
                    aria-invalid={Boolean(errors.websiteUrl)}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="intake-no-website"
                      checked={noWebsite}
                      onCheckedChange={(v) => setNoWebsite(v === true)}
                    />
                    <Label htmlFor="intake-no-website" className="font-normal">
                      No website yet
                    </Label>
                  </div>
                  {errors.websiteUrl ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.websiteUrl}
                    </p>
                  ) : null}
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">What do you want first?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {INTENTS.map((pick) => (
                      <button
                        key={pick.value}
                        type="button"
                        aria-pressed={intent === pick.value}
                        onClick={() => setIntent(pick.value)}
                        className={`rounded-[10px] border p-4 text-left text-sm font-semibold transition-colors ${
                          intent === pick.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background hover:border-primary/60"
                        }`}
                      >
                        {pick.title}
                      </button>
                    ))}
                  </div>
                  {errors.intent ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.intent}
                    </p>
                  ) : null}
                </fieldset>

                {formError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {formError}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? "Saving your claim…" : "Claim your Muse"}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  No promise of views or income. Stop any time.
                </p>
              </div>
            </form>
          )}
        </section>

        <section id="how" aria-labelledby="how-heading" className="border-t border-border/60 py-12">
          <h2 id="how-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <article className="rounded-[10px] border border-border bg-card p-5">
              <h3 className="text-lg font-bold">Claim</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Two minutes. Your name, your business, your website.
              </p>
            </article>
            <article className="rounded-[10px] border border-border bg-card p-5">
              <h3 className="text-lg font-bold">Open Muse</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Log in with Whop, get one prompt, paste it into your Muse.
              </p>
            </article>
            <article className="rounded-[10px] border border-border bg-card p-5">
              <h3 className="text-lg font-bold">Your Muse onboards you</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                It connects the engine and makes your first content. You approve each step.
              </p>
            </article>
          </div>

          <EngineStrip />
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  // Once a visitor starts the claim form, keep the intake mounted even
  // if the session probe then resolves connected — swapping views
  // mid-form would throw away what they typed. Their hand-off then
  // shows the starter-prompt panel instead of the sign-in step.
  const [intakeEngaged, setIntakeEngaged] = useState(false);

  useEffect(() => {
    stashRefFromUrl();
    // OAuth return: drop ?welcome / ?auth_error from the address bar.
    const params = new URLSearchParams(window.location.search);
    if (params.has("welcome") || params.has("auth_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Session) => setSession(s))
      .catch(() => setSession({ connected: false, admin: false, user: null }));
  }, []);

  // Arriving from the intake's required Whop login: bring the starter
  // prompt into view (it sits above the referral card) and clear the
  // flag so later visits land normally.
  useEffect(() => {
    if (!session?.connected) return;
    try {
      if (!window.localStorage.getItem("wa_intake_claimed")) return;
      window.localStorage.removeItem("wa_intake_claimed");
      document.getElementById("starter-prompt-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // storage unavailable — nothing to surface
    }
  }, [session?.connected]);

  // Visitors are the common case: while the session probe is in
  // flight (and for anyone not connected) the homepage is the intake.
  // A connected member may see the form for that one probe.
  if (!session?.connected || intakeEngaged) {
    return (
      <IntakeView connected={Boolean(session?.connected)} onEngage={() => setIntakeEngaged(true)} />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8">
        <SiteHeader
          ctaHref={CONNECT_URL}
          extra={
            session?.admin ? (
              <a className="font-semibold text-primary underline underline-offset-2" href="/admin">
                Admin
              </a>
            ) : null
          }
        />

        <section className="py-14 sm:py-20">
          <p className={label}>Whop Army</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Agents that do things.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Agents, tools, live spaces.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={SPACES_URL}>EXPLORE SPACES</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={BUILD_URL}>BUILD AN AGENT</a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={ROTATOR_URL}>ENTER THE ROTATOR</a>
            </Button>
          </div>

          <EngineStrip />
        </section>

        <section aria-labelledby="crew-heading" className="border-t border-border/60 py-12">
          <h2 id="crew-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Five teammates. One always-on agent.
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            You approve everything that goes out.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CREW.map((member) => (
              <article key={member.name} className="rounded-[10px] border border-border bg-card p-4">
                <h3 className="text-base font-bold">{member.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{member.job}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="go-heading" className="border-t border-border/60 py-12">
          <h2 id="go-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Where to go
          </h2>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {DESTINATIONS.map((dest) => (
              <a
                key={dest.href}
                href={dest.href}
                className="group rounded-[10px] border border-border bg-card p-5 transition-colors hover:border-primary/60"
              >
                <h3 className="text-lg font-bold group-hover:text-primary">{dest.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{dest.body}</p>
              </a>
            ))}
          </div>
        </section>

        <section id="starter-prompt-section" aria-labelledby="starter-prompt-heading" className="border-t border-border/60 py-12">
          <h2 id="starter-prompt-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Your starter prompt
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            Paste it into your Muse. Your Muse onboards you.
          </p>
          <div className="mt-6">
            <StarterPromptPanel />
          </div>
        </section>

        <section aria-labelledby="referral-heading" className="border-t border-border/60 py-12">
          <h2 id="referral-heading" className="sr-only">
            Your referral link
          </h2>
          <ReferralLinkCard ready={session !== null} connected={Boolean(session?.connected)} />
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
