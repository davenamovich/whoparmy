"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/shell/site-footer";
import { readStashedRef, stashRefFromUrl } from "@/lib/ref-stash";
import { validateIntakeInput, type IntakeIntent } from "@/lib/intake";

type Session = { connected: boolean; admin: boolean; user: { name: string | null; whopUsername: string | null } | null };
type FieldErrors = { name?: string; businessName?: string; websiteUrl?: string; intent?: string };
const CONNECT_URL = "/api/auth/whop";
const labelClass = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";
const INTENTS: { value: IntakeIntent; title: string }[] = [
  { value: "content_pack", title: "Content pack" },
  { value: "seo_audit", title: "SEO audit" },
  { value: "ceo_experience", title: "CEO Experience — $997 one-time" },
  { value: "just_agent", title: "Just my agent" },
];

function StarterPromptPanel() {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function showPrompt() {
    setBusy(true); setError(null); setCopied(false);
    try {
      const res = await fetch("/api/blueprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup" }) });
      const data = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!res.ok || !data.prompt) throw new Error(data.error ?? "Could not make your prompt. Try again.");
      setPrompt(data.prompt);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not make your prompt. Try again."); }
    finally { setBusy(false); }
  }
  async function copyPrompt() {
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); setCopied(true); }
    catch { setError("Copy failed — select the prompt text and copy it by hand."); }
  }
  if (!prompt) return <div><Button size="lg" onClick={() => void showPrompt()} disabled={busy}>{busy ? "Making your prompt…" : "Show my starter prompt"}</Button>{error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}</div>;
  return <div><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-card p-4 text-left text-xs leading-relaxed">{prompt}</pre><div className="mt-3 flex flex-wrap items-center gap-3"><Button size="lg" onClick={() => void copyPrompt()}>Copy prompt</Button>{copied ? <span className="text-sm font-medium text-primary">Copied</span> : null}</div>{error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}</div>;
}

export default function BetaPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState(""); const [businessName, setBusinessName] = useState(""); const [websiteUrl, setWebsiteUrl] = useState("");
  const [noWebsite, setNoWebsite] = useState(false); const [intent, setIntent] = useState<IntakeIntent | "">("");
  const [errors, setErrors] = useState<FieldErrors>({}); const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [submittedIntent, setSubmittedIntent] = useState<IntakeIntent | null>(null);

  useEffect(() => {
    stashRefFromUrl();
    void fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).then((s: Session) => setSession(s)).catch(() => setSession({ connected: false, admin: false, user: null }));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setFormError(null);
    const candidate = { name, businessName, websiteUrl, noWebsite, intent, refCode: readStashedRef() };
    const check = validateIntakeInput(candidate);
    if (!check.ok) {
      const msg = check.error; const lower = msg.toLowerCase(); const next: FieldErrors = {};
      if (lower.includes("name") && !lower.includes("business")) next.name = msg;
      else if (lower.includes("business")) next.businessName = msg;
      else if (lower.includes("website")) next.websiteUrl = msg;
      else if (lower.includes("pick")) next.intent = msg;
      else setFormError(msg);
      setErrors(next); return;
    }
    setErrors({}); setBusy(true);
    try {
      const res = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...candidate, source: "beta" }) });
      const data = (await res.json().catch(() => ({}))) as { intake?: { id: string; intent: IntakeIntent }; error?: string };
      if (!res.ok || !data.intake) throw new Error(data.error ?? "Something went wrong. Try again.");
      try { window.localStorage.setItem("wa_intake_claimed", data.intake.intent); } catch { /* best effort */ }
      setSubmittedIntent(data.intake.intent);
    } catch (err) { setFormError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3"><a href="/" translate="no" className="font-display text-xs font-extrabold tracking-[0.14em]">PLUNDER <span className="text-primary">&amp;</span> RIFFLE</a><nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium"><a href="#how" className="text-muted-foreground transition-colors hover:text-foreground">How it works</a><a className="font-semibold text-primary underline underline-offset-2" href={CONNECT_URL}>Sign in</a></nav></header>
    <section aria-labelledby="beta-heading" className="py-14 sm:py-20"><p className={labelClass}>Plunder &amp; Riffle — Open Beta</p><h1 id="beta-heading" className="mt-4 max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">Your Muse, creating on Day 0.</h1><p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Built for the 1% of the 1% — the owners already moving. We are the test: Plunder &amp; Riffle itself is the offer under test.</p>
      <div className="mt-8 rounded-[10px] border border-border bg-card p-5 sm:p-6"><h2 className="text-2xl font-bold tracking-tight">Bounty for a completed test</h2><dl className="mt-5 divide-y divide-border/60">{[["Bounty for a completed test","10M-token carve"],["A completed test means","Your first test finished and verified by your Muse's report"],["Paid by","Plunder & Riffle, in seeded fuel — not cash"],["Your starting seed","1M tokens, carved for you when you connect"]].map(([term, value]) => <div key={term} className="grid gap-1 py-3 sm:grid-cols-[1fr_1.5fr]"><dt className="font-mono text-xs font-semibold uppercase tracking-wide text-primary">{term}</dt><dd className="leading-relaxed">{value}</dd></div>)}</dl></div>
      {submittedIntent ? <div className="mt-10 max-w-2xl rounded-[10px] border border-border bg-card p-5 sm:p-6">{session?.connected ? <><h2 className="text-2xl font-bold tracking-tight">Your starter prompt</h2><div className="mt-5"><StarterPromptPanel /></div></> : <><h2 className="text-2xl font-bold tracking-tight">Your claim is saved</h2><p className={labelClass + " mt-5"}>Step 2 required</p><p className="mt-3 leading-relaxed text-muted-foreground">Log in with Whop to get your prompt. It is minted to your account — that is what makes it yours.</p><Button asChild size="lg" className="mt-4"><a href={CONNECT_URL}>Log in with Whop</a></Button></>}{submittedIntent === "ceo_experience" ? <p className="mt-4 leading-relaxed text-muted-foreground">CEO Experience ($997) — your Muse walks you through that step next.</p> : null}</div> : <form onSubmit={(e) => void submit(e)} noValidate className="mt-10 max-w-2xl rounded-[10px] border border-border bg-card p-5 sm:p-6"><div className="space-y-5"><div className="space-y-2"><Label htmlFor="beta-name">Your name</Label><Input id="beta-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={Boolean(errors.name)} />{errors.name ? <p role="alert" className="text-sm text-destructive">{errors.name}</p> : null}</div><div className="space-y-2"><Label htmlFor="beta-business">Business name</Label><Input id="beta-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" aria-invalid={Boolean(errors.businessName)} />{errors.businessName ? <p role="alert" className="text-sm text-destructive">{errors.businessName}</p> : null}</div><div className="space-y-2"><Label htmlFor="beta-website">Your website</Label><Input id="beta-website" type="url" inputMode="url" placeholder="yourbusiness.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} disabled={noWebsite} aria-invalid={Boolean(errors.websiteUrl)} /><div className="flex items-center gap-2"><Checkbox id="beta-no-website" checked={noWebsite} onCheckedChange={(v) => setNoWebsite(v === true)} /><Label htmlFor="beta-no-website" className="font-normal">No website yet</Label></div>{errors.websiteUrl ? <p role="alert" className="text-sm text-destructive">{errors.websiteUrl}</p> : null}</div><fieldset className="space-y-2"><legend className="text-sm font-medium">What do you want first?</legend><div className="grid gap-2 sm:grid-cols-2">{INTENTS.map((pick) => <button key={pick.value} type="button" aria-pressed={intent === pick.value} onClick={() => setIntent(pick.value)} className={`rounded-[10px] border p-4 text-left text-sm font-semibold transition-colors ${intent === pick.value ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background hover:border-primary/60"}`}>{pick.title}</button>)}</div>{errors.intent ? <p role="alert" className="text-sm text-destructive">{errors.intent}</p> : null}</fieldset>{formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}<Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Saving your claim…" : "Join the beta"}</Button></div></form>}
    </section>
    <section id="how" aria-labelledby="how-heading" className="border-t border-border/60 py-12"><h2 id="how-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2><ol className="mt-8 grid gap-3 md:grid-cols-2">{[["Set up Muse Mail first","Nothing starts before this. Your Muse Mail is where your starter prompt lands, where your API key is delivered, and where bounty notices arrive."],["Claim your spot here","Your name, your business, your website — or just name + city in the business field if you have no site yet. One claim, nothing else to fill in."],["Get your starter prompt here","Log in with Whop and your prompt is served on this page — built from research on YOUR business. Paste it into your Muse; onboarding happens there, not on a website."],["Connect, get seeded, run the test","Your Muse connects through the bridge and you start on a 1M seed. Finish your first test and the 10M bounty carve unlocks. Your first purchase, when you choose it, is your own cheap-API access; top-ups after that live in Mission Control."]].map(([title, body], index) => <li key={title} className="rounded-[10px] border border-border bg-card p-5"><h3 className="text-lg font-bold">{index}. {title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p></li>)}</ol></section>
    <p className="mb-8 text-sm leading-relaxed text-muted-foreground">No promise of views or income. Confirmed revenue to date is $0. Stop any time.</p><SiteFooter />
  </div></main>;
}
