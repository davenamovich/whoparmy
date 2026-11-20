"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Bitcoin, Briefcase, CheckCircle2, ExternalLink, Gavel, LayoutDashboard, Link2, Loader2, Lock, MousePointerClick, Trophy, Users } from "lucide-react";
import type { AffiliateOverview, AffiliateState, BridgePartner, BridgeState } from "@/lib/bridge";
import type { BtcAddresses } from "@/lib/btc-addresses";
import type { MemberDashboard } from "@/lib/dashboard";
import type { AdminDayView, RotatorState } from "@/lib/rotator";
import { clearStashedRef, readStashedRef, stashRefFromUrl } from "@/lib/ref-stash";

/**
 * ─── THE BRIDGE ──────────────────────────────────────────────────────
 * The simple landing page members arrive on from meme-loop-engine.
 * Modeled on Dave's Global Content Factory page: hero, the partner
 * stack, save your own links — the start of building your own engine.
 * The first save pays the inviter's free generations (lib/bridge.ts).
 */
export default function BridgePage() {
  const { toast } = useToast();
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savingPartner, setSavingPartner] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<null | {
    firstSave: boolean;
    referrerPaid: boolean;
    saverPaid: boolean;
    placementsGranted: string[];
  }>(null);
  const [affiliateRefresh, setAffiliateRefresh] = useState(0);
  // The Whop-connection gate (Dave, 2026-11-17): the bridge's working
  // parts (your links, the rewards, the rotator) unlock only after
  // Connect with Whop. Anonymous visitors get the teaser.
  const [gate, setGate] = useState<"loading" | "teaser" | "open">("loading");
  const [teaserPartners, setTeaserPartners] = useState<BridgePartner[]>([]);
  const attributedRef = useRef(false);

  useEffect(() => {
    // Capture ?ref= BEFORE the gate: an anonymous arrival stashes the
    // code (lib/ref-stash) so attribution survives the Whop connect
    // round trip; a connected arrival applies it right away.
    stashRefFromUrl();
    let alive = true;

    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((session) => {
        if (!alive) return;
        if (!session?.connected) {
          setGate("teaser");
          void fetch("/api/bridge/partners")
            .then((r) => r.json())
            .then((data) => {
              if (alive && Array.isArray(data.partners)) setTeaserPartners(data.partners as BridgePartner[]);
            })
            .catch(() => undefined);
          return;
        }
        setGate("open");
        // Apply attribution once: the URL code wins, else the stash
        // from the pre-connect landing/teaser visit.
        if (!attributedRef.current) {
          attributedRef.current = true;
          const code =
            new URLSearchParams(window.location.search).get("ref") ?? readStashedRef();
          if (code) {
            void fetch("/api/referrals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            })
              .catch(() => undefined)
              .finally(() => clearStashedRef());
          }
        }
        void fetch("/api/bridge/links")
          .then((r) => r.json())
          .then((data) => {
            if (!alive || !data.bridge) return;
            setBridge(data.bridge as BridgeState);
            setDraft(Object.fromEntries((data.bridge as BridgeState).partners.map((p) => [p.key, p.url])));
          })
          .catch(() => undefined);
      })
      .catch(() => {
        // Session check failed — fall back to the teaser rather than
        // exposing member state we cannot attribute to a session.
        if (alive) setGate("teaser");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function applySave(data: {
    bridge?: BridgeState;
    firstSave?: boolean;
    referrerPaid?: boolean;
    saverPaid?: boolean;
    placementsGranted?: string[];
  }) {
    if (data.bridge) {
      setBridge(data.bridge);
      setDraft(Object.fromEntries(data.bridge.partners.map((p) => [p.key, p.url])));
    }
    setJustSaved({
      firstSave: Boolean(data.firstSave),
      referrerPaid: Boolean(data.referrerPaid),
      saverPaid: Boolean(data.saverPaid),
      placementsGranted: Array.isArray(data.placementsGranted) ? data.placementsGranted : [],
    });
    setAffiliateRefresh((n) => n + 1);
    toast({ title: data.firstSave ? "Your stack is live" : "Links saved" });
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/bridge/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await applySave(data);
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  /** Per-offer Save button: saves just this partner's link. */
  async function saveOne(partnerKey: string) {
    setSavingPartner(partnerKey);
    try {
      const res = await fetch("/api/bridge/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: { [partnerKey]: draft[partnerKey] ?? "" } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await applySave(data);
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingPartner(null);
    }
  }

  if (gate === "loading") {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <p className="mx-auto max-w-3xl px-4 py-12 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your connection…
        </p>
      </main>
    );
  }

  if (gate === "teaser") {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
          <header className="text-center space-y-4">
            <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">
              Plunder &amp; Riffle — The Global Content Factory
            </p>
            <h1 className="text-4xl font-black leading-tight">
              Don&apos;t just make content.
              <br />
              Build your own engine.
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              The tools powering the P&amp;R ecosystem have their own referral programs. Save{" "}
              <b className="text-foreground">your</b> links for each one, and your stack is live — every
              meme you make from here can carry the links that pay you. This is step one.
            </p>
          </header>

          <Card className="border-primary/50">
            <CardContent className="py-6 text-center space-y-3">
              <p className="font-bold">Connect with Whop to open your bridge</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Saving your links, the 25 free generations on your first save, and the daily
                rotator all live behind your Whop membership — the free Trial counts.
              </p>
              <Button asChild size="lg">
                {/* Sign-in returns here, not to the gated home page;
                    ?ref= survives in the stash (lib/ref-stash). */}
                <a href="/api/auth/whop?next=%2Fbridge">
                  Connect with Whop <ArrowRight className="h-4 w-4 ml-1.5" />
                </a>
              </Button>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> The links you&apos;ll save
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {teaserPartners.map((p) => (
                <Card key={p.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">{p.blurb}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 text-primary" /> Connect to save your link
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <footer className="text-center space-y-2 pt-4 border-t border-border/60">
            <p className="text-[11px] text-muted-foreground">
              Each referral program has its own terms and payout structure. Commissions aren&apos;t guaranteed.
            </p>
            <p className="text-[11px] text-muted-foreground">Powered by Plunder &amp; Riffle MCP.</p>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-10">
        <header className="text-center space-y-4">
          <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">
            Plunder &amp; Riffle — The Global Content Factory
          </p>
          <h1 className="text-4xl font-black leading-tight">
            Don&apos;t just make content.
            <br />
            Build your own engine.
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The tools powering the P&amp;R ecosystem have their own referral programs. Save{" "}
            <b className="text-foreground">your</b> links for each one, and your stack is live — every
            meme you make from here can carry the links that pay you. This is step one.
          </p>
        </header>

        {justSaved && (justSaved.firstSave || justSaved.placementsGranted.length > 0) ? (
          <Card className="border-primary/50">
            <CardContent className="py-5 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold">{justSaved.firstSave ? "Your stack is live." : "Links saved."}</p>
                <p className="text-sm text-muted-foreground">
                  {justSaved.saverPaid
                    ? "You just earned 25 free generations for saving your links. "
                    : ""}
                  {justSaved.referrerPaid
                    ? "The member who sent you just earned 25 free generations for bringing you in — extra generations that spend automatically once their plan's monthly allowance runs out. When you invite your own people and they save their links, you earn them too."
                    : justSaved.firstSave
                      ? "When you invite your own people and they save their links here, you earn 25 free generations for each one — they spend automatically once your plan's monthly allowance runs out."
                      : ""}{" "}
                  {justSaved.placementsGranted.length > 0
                    ? `You also earned a free day in the rotator tomorrow for: ${justSaved.placementsGranted
                        .map((k) => bridge?.partners.find((p) => p.key === k)?.name ?? k)
                        .join(", ")}. Your link for each one rotates into the day's featured traffic for 24 hours. `
                    : ""}
                  Next: give your engine a brand and let it start creating.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2 pt-1"
                >
                  Start generating <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Your links
          </h2>
          {bridge === null ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your stack…
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {bridge.referrerLabel ? (
                  <>
                    You came in through <b className="text-foreground">{bridge.referrerLabel}</b> — every offer
                    below is pre-loaded with <b className="text-foreground">their</b> sign-up link, so joining
                    credits them. Sign up, then paste your own link and Save — the members you send here will
                    see <b className="text-foreground">your</b> links the same way.
                  </>
                ) : (
                  <>
                    Every offer below carries the <b className="text-foreground">P&amp;R house</b> sign-up link.
                    Sign up, then paste your own link and Save — the members you send here will see{" "}
                    <b className="text-foreground">your</b> links pre-loaded the same way.
                  </>
                )}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {bridge.partners.map((p) => (
                  <Card key={p.key}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{p.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      <p className="text-xs text-muted-foreground">{p.blurb}</p>
                      {p.signupUrl ? (
                        <div className="space-y-1">
                          <Button asChild size="sm" className="w-full">
                            <a href={`/api/bridge/signup?partner=${p.key}`} target="_blank" rel="noreferrer">
                              Sign up for {p.name} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                            </a>
                          </Button>
                          <p className="text-[11px] text-muted-foreground">
                            {p.signupSource === "referrer"
                              ? `Through ${bridge.referrerLabel ?? "your referrer"}'s link — signing up credits them.`
                              : "Through the P&R house link."}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          No sign-up link for this one yet — ask the member who sent you for theirs, then save
                          your own link below.
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <label htmlFor={`link-${p.key}`} className="text-[11px] font-semibold text-muted-foreground">
                          Your {p.name} link
                        </label>
                        <Input
                          id={`link-${p.key}`}
                          value={draft[p.key] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                          placeholder={p.example}
                          className="text-xs"
                          inputMode="url"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveOne(p.key)}
                            disabled={savingPartner === p.key || busy}
                          >
                            {savingPartner === p.key ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Save
                          </Button>
                          {p.url ? (
                            <span className="text-[11px] text-primary flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Saved
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">Not saved yet</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {bridge.linksSavedAt ? "Save links" : "Save my links — light it up"}
                </Button>
                {bridge.linksSavedAt ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Stack live since{" "}
                    {new Date(bridge.linksSavedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Saving your first link{bridge.hasReferrer ? " pays your inviter 25 free generations" : " starts your engine"}.
                  </span>
                )}
              </div>
            </>
          )}
        </section>

        <MemberDashboardSection refreshKey={affiliateRefresh} />

        <BtcAddressesSection />

        <AffiliateManagerSection refreshKey={affiliateRefresh} />
        <RotatorSection />
        <RotatorAdmin />

        <footer className="text-center space-y-2 pt-4 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground">
            Each referral program has its own terms and payout structure. Commissions aren&apos;t guaranteed.
          </p>
          <p className="text-[11px] text-muted-foreground">Powered by Plunder &amp; Riffle MCP.</p>
        </footer>
      </div>
    </main>
  );
}

/**
 * The member dashboard (Dave, 2026-11-19): referrals, rotator access,
 * clicks and BTC wallet activity in one place — all read live from
 * /api/dashboard. Referral earnings stay labeled SIMULATED until
 * payouts run on a real rail; clicks count only what this app served
 * (the sign-up buttons above and the rotator); BTC figures are public
 * on-chain data for the member's saved receive addresses.
 */
function MemberDashboardSection({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [dash, setDash] = useState<MemberDashboard | null>(null);

  useEffect(() => {
    void fetch("/api/dashboard")
      .then((r) => r.json())
      .then((data) => {
        if (data.dashboard) setDash(data.dashboard as MemberDashboard);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  if (!dash) return null;
  const { referrals, rotatorAccess, clicks, btc } = dash;
  const shortAddr = (a: string) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-primary" /> Your dashboard
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Referrals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="text-2xl font-black">{referrals.recruitsCount}</span>
              <span className="text-xs text-muted-foreground">
                recruited · {referrals.conversions} converted ·{" "}
                <b className="text-foreground">${(referrals.earnedCents / 100).toFixed(2)}</b> earned
                {referrals.earningsStatus === "SIMULATED" ? (
                  <span className="ml-1 rounded-full border border-amber-500/50 text-amber-500 px-1.5 py-px text-[10px] font-semibold">
                    SIMULATED
                  </span>
                ) : null}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {referrals.commissionsUnlocked
                ? "Commissions unlocked — you earn 30% when a recruit converts."
                : `Commissions unlock at ${referrals.commissionUnlockAt} converted sign-ups (${referrals.conversions} so far).`}{" "}
              You hold <b className="text-foreground">{referrals.freeGenBalance} free generations</b> — every
              recruit who saves their links pays you {referrals.freeGensPerLinkSave} more.
            </p>
            <div className="flex items-center gap-2">
              <Input value={referrals.link} readOnly className="text-xs" aria-label="Your referral link" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(referrals.link)
                    .then(() => toast({ title: "Referral link copied" }))
                    .catch(() => undefined);
                }}
              >
                Copy
              </Button>
            </div>
            {referrals.recruits.length ? (
              <div className="divide-y divide-border/60">
                {referrals.recruits.slice(0, 5).map((r, i) => (
                  <div key={`${r.label}-${i}`} className="py-1.5 flex items-center gap-2 text-xs">
                    <span className="font-medium truncate">{r.label}</span>
                    <span className="text-muted-foreground">{new Date(r.joinedAt).toLocaleDateString()}</span>
                    {r.converted ? (
                      <span className="ml-auto text-[10px] font-semibold rounded-full border border-primary/40 text-primary px-1.5 py-px">
                        Converted
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] rounded-full border border-border text-muted-foreground px-1.5 py-px">
                        Joined
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No recruits yet — share your link and this fills in.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" /> Rotator access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="text-2xl font-black">{rotatorAccess.liveToday}</span>
              <span className="text-xs text-muted-foreground">of your links live in today&apos;s rotator</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Joined <b className="text-foreground">{rotatorAccess.joinedCount} of {rotatorAccess.offerCount} offers</b>,
              earned <b className="text-foreground">{rotatorAccess.freeDaysEarned} free rotator day{rotatorAccess.freeDaysEarned === 1 ? "" : "s"}</b>.{" "}
              {rotatorAccess.inTodayPool
                ? "You're in today's traffic pool — the rotator below is carrying your link."
                : `Today's pool has ${rotatorAccess.todayPoolSize} link${rotatorAccess.todayPoolSize === 1 ? "" : "s"} rotating (now showing ${rotatorAccess.todayPartnerName}).`}{" "}
              Balance: <b className="text-foreground">{rotatorAccess.myFreeGenBalance} free generations</b> to bid with.
            </p>
            {rotatorAccess.placements.length ? (
              <div className="space-y-1">
                {rotatorAccess.placements.map((pl) => (
                  <p key={`${pl.name}-${pl.date}`} className="text-xs text-muted-foreground">
                    {pl.name} — {pl.live ? <b className="text-primary">live today</b> : `free day ${pl.date}`}
                  </p>
                ))}
              </div>
            ) : null}
            {rotatorAccess.myBids.length ? (
              <div className="space-y-1">
                {rotatorAccess.myBids.map((b) => (
                  <p key={b.date} className="text-xs text-muted-foreground">
                    Bid: {b.amount} gens for {b.date}
                    {b.isWinner ? " — confirmed winner" : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-primary" /> Clicks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-4 flex-wrap">
              <span className="text-2xl font-black">{clicks.total}</span>
              <span className="text-xs text-muted-foreground">
                clicks on your links — {clicks.signup} sign-up · {clicks.rotator} rotator
              </span>
            </div>
            {clicks.byPartner.length ? (
              <div className="space-y-1">
                {clicks.byPartner.map((p) => (
                  <p key={p.partner} className="text-xs text-muted-foreground flex justify-between gap-2">
                    <span>{p.name}</span>
                    <b className="text-foreground">{p.clicks}</b>
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No clicks yet. When a member you sent taps Sign up on their page, or the rotator serves your
                link, it lands here.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Counts only clicks this app serves — the sign-up buttons on Your Links pages and the rotator.
              Clicks anywhere else aren&apos;t tracked, and aren&apos;t invented.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-primary" /> BTC wallet activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {btc.activity.addresses.map((a) => (
              <div key={a.role} className="space-y-0.5">
                <p className="text-xs font-semibold">
                  {a.role === "agent" ? "Agent address" : "Your receive address"}{" "}
                  {a.address ? <span className="font-normal text-muted-foreground">{shortAddr(a.address)}</span> : null}
                </p>
                {a.available ? (
                  <p className="text-xs text-muted-foreground">
                    Balance <b className="text-foreground">{a.balanceBtc} BTC</b> · {a.txCount} transaction
                    {a.txCount === 1 ? "" : "s"} on-chain
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{a.note ?? "No activity to show."}</p>
                )}
              </div>
            ))}
            {btc.activity.recent.length ? (
              <div className="divide-y divide-border/60">
                {btc.activity.recent.map((tx) => (
                  <div key={`${tx.txid}-${tx.role}`} className="py-1.5 flex items-center gap-2 text-xs">
                    <span className={tx.deltaSats >= 0 ? "text-primary font-semibold" : "font-semibold"}>
                      {tx.deltaSats >= 0 ? "+" : "−"}
                      {tx.deltaBtc.replace("-", "")} BTC
                    </span>
                    <span className="text-muted-foreground">{tx.role === "agent" ? "agent" : "receive"}</span>
                    <span className="text-muted-foreground">
                      {tx.confirmed ? (tx.at ? new Date(tx.at).toLocaleDateString() : "confirmed") : "pending"}
                    </span>
                    <a
                      href={`https://mempool.space/tx/${tx.txid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-primary underline underline-offset-2"
                    >
                      tx
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Public on-chain data (mempool.space) for the receive addresses you saved below — Whop Army holds
              no keys and no funds.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/**
 * The BTC Experiment's address book (Flow v2, 2026-11-19): the
 * member's two PUBLIC receive addresses — their own, and a dedicated
 * agent address from their own self-custody wallet (the payout
 * address they enter on DH Media). Receive-only: no wallet is ever
 * generated here, no key is ever held, nothing is custodied.
 */
function BtcAddressesSection() {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [receive, setReceive] = useState("");
  const [agent, setAgent] = useState("");
  const [receiveLabel, setReceiveLabel] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/bridge/btc-addresses")
      .then((r) => r.json())
      .then((data) => {
        if (!data.addresses) return;
        const a = data.addresses as BtcAddresses;
        setReceive(a.btcReceiveAddress);
        setAgent(a.agentBtcAddress);
        setReceiveLabel(a.btcReceiveInfo?.label ?? null);
        setAgentLabel(a.agentBtcInfo?.label ?? null);
        setLoaded(true);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/bridge/btc-addresses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ btcReceiveAddress: receive, agentBtcAddress: agent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const a = data.addresses as BtcAddresses;
      setReceive(a.btcReceiveAddress);
      setAgent(a.agentBtcAddress);
      setReceiveLabel(a.btcReceiveInfo?.label ?? null);
      setAgentLabel(a.agentBtcInfo?.label ?? null);
      toast({ title: "BTC addresses saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Bitcoin className="h-4 w-4 text-primary" /> Your BTC addresses — The BTC Experiment
      </h2>
      <Card>
        <CardContent className="py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            The BTC Experiment runs on <b className="text-foreground">public receive addresses from your own
            wallet</b>. Whop Army never generates wallets, never holds keys, and never custodies funds — these
            are saved here so you and your agent always use the right ones.
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="btc-receive" className="text-sm font-medium">
                Your BTC receive address
              </label>
              <Input
                id="btc-receive"
                value={receive}
                onChange={(e) => setReceive(e.target.value)}
                placeholder="bc1… / 3… / 1…"
                className="text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                The address you use to receive BTC.
                {receiveLabel ? (
                  <>
                    {" "}
                    Saved: <b className="text-foreground">{receiveLabel}</b>.
                  </>
                ) : null}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="btc-agent" className="text-sm font-medium">
                Your agent BTC address
              </label>
              <Input
                id="btc-agent"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="bc1… / 3… / 1…"
                className="text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                A dedicated receive address from your own self-custody wallet, set aside for your agent. This is
                the payout address to enter when you register your DH Media account, so your agent&apos;s earnings
                land in the address set aside for it.
                {agentLabel ? (
                  <>
                    {" "}
                    Saved: <b className="text-foreground">{agentLabel}</b>.
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Whether DH Media lets you change that payout address later is unverified — confirm on dh.media.
          </p>
          <p className="text-xs font-semibold text-foreground">
            Public receive address only. Never enter a seed phrase or private key — we will never ask for one.
          </p>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save addresses
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The Affiliate Manager (Dave, 2026-11-17): tracks ALL offers for the
 * member — which ones they signed up for (link saved), and the free
 * 24-hour rotator placement each signup earned for that offer.
 */
function AffiliateManagerSection({ refreshKey }: { refreshKey: number }) {
  const [affiliate, setAffiliate] = useState<AffiliateState | null>(null);

  useEffect(() => {
    void fetch("/api/affiliate-manager")
      .then((r) => r.json())
      .then((data) => {
        if (data.affiliate) setAffiliate(data.affiliate as AffiliateState);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  if (!affiliate) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" /> Affiliate Manager
      </h2>
      <Card>
        <CardContent className="py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ve joined{" "}
            <b className="text-foreground">
              {affiliate.joinedCount} of {affiliate.offerCount} offers
            </b>{" "}
            and earned{" "}
            <b className="text-foreground">
              {affiliate.freeDaysEarned} free rotator day{affiliate.freeDaysEarned === 1 ? "" : "s"}
            </b>
            {affiliate.liveToday > 0 ? (
              <>
                {" "}
                — <b className="text-foreground">{affiliate.liveToday} of your links are live in today&apos;s rotator.</b>
              </>
            ) : (
              "."
            )}{" "}
            Every offer you sign up for — save your link above — earns 24 hours free in the rotator for that offer.
          </p>
          <div className="divide-y divide-border/60">
            {affiliate.offers.map((o) => (
              <div key={o.key} className="py-2.5 flex items-center gap-3 flex-wrap text-sm">
                <span className="font-medium w-32 shrink-0">{o.name}</span>
                {o.joined ? (
                  <span className="text-[11px] font-semibold rounded-full border border-primary/40 text-primary px-2 py-0.5">
                    Link saved
                  </span>
                ) : (
                  <span className="text-[11px] rounded-full border border-border text-muted-foreground px-2 py-0.5">
                    Not joined
                  </span>
                )}
                {o.placement ? (
                  <span className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                    {o.placement.live ? "Live in today's rotator" : `Free rotator day: ${o.placement.date}`}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The daily rotator: traffic that arrives with no sign-up link goes to
 * one destination a day. Members bid free generations to make it
 * THEIR saved link; an admin confirms the winner (lib/rotator.ts).
 */
function RotatorSection() {
  const { toast } = useToast();
  const [rotator, setRotator] = useState<RotatorState | null>(null);
  const [partner, setPartner] = useState("");
  const [amount, setAmount] = useState("25");
  const [busyDate, setBusyDate] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bridge/rotator")
      .then((r) => r.json())
      .then((data) => {
        if (data.rotator) setRotator(data.rotator as RotatorState);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!partner && rotator?.myPartners.length) setPartner(rotator.myPartners[0].key);
  }, [rotator, partner]);

  async function bid(date: string) {
    setBusyDate(date);
    try {
      const res = await fetch("/api/bridge/rotator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, partner, amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bid failed");
      setRotator(data.rotator as RotatorState);
      toast({ title: "Bid placed", description: "Nothing is deducted unless an admin confirms you the winner." });
    } catch (err) {
      toast({
        title: "Could not bid",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyDate(null);
    }
  }

  if (!rotator) return null;
  const biddable = rotator.days.filter((d) => d.status === "OPEN" || d.status === "UNOPENED");

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Gavel className="h-4 w-4 text-primary" /> The Daily Rotator — auction
      </h2>
      <Card>
        <CardContent className="py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Every day, visitors who arrive <b className="text-foreground">without anyone&apos;s sign-up link</b>{" "}
            are sent to the day&apos;s featured links.{" "}
            {rotator.today.poolSize > 1 ? (
              <>
                Today the rotator rotates hourly among{" "}
                <b className="text-foreground">{rotator.today.poolSize} featured links</b> — right now it&apos;s
                showing{" "}
                <a href={rotator.today.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                  {rotator.today.partnerName}
                </a>
                .
              </>
            ) : (
              <>
                Today that&apos;s{" "}
                <a href={rotator.today.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                  {rotator.today.partnerName}
                </a>{" "}
                —{" "}
                {rotator.today.source === "auction"
                  ? "won at auction by a member"
                  : rotator.today.source === "free"
                    ? "a member's free day, earned by signing up for the offer"
                    : "the house rotation"}
                .
              </>
            )}{" "}
            Bid your free generations to join a day&apos;s pool: your saved link shares that day&apos;s
            unattributed traffic.
          </p>
          <p className="text-xs text-muted-foreground">
            Your balance: <b className="text-foreground">{rotator.myFreeGenBalance} free generations</b>. Bids are
            promises — your generations are only deducted if an admin confirms you the winner.
          </p>
          {rotator.myPartners.length === 0 ? (
            <p className="text-xs text-muted-foreground">Save at least one link above first — the rotator only features saved links.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={partner}
                  onChange={(e) => setPartner(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {rotator.myPartners.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-24 text-sm"
                  inputMode="numeric"
                  aria-label="Bid in free generations"
                />
                <span className="text-xs text-muted-foreground">free generations</span>
              </div>
              {biddable.map((d) => (
                <div key={d.date} className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-medium w-28">{d.date}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.bidCount ? `Top bid ${d.topBid} · ${d.bidCount} bid${d.bidCount > 1 ? "s" : ""}` : "No bids yet"}
                    {d.myBid ? ` · your bid: ${d.myBid.amount}` : ""}
                  </span>
                  <Button size="sm" variant="outline" disabled={busyDate === d.date} onClick={() => void bid(d.date)}>
                    {busyDate === d.date ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {d.myBid ? "Update bid" : "Bid"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** Operator-only: renders nothing unless the admin API answers. */
function RotatorAdmin() {
  const { toast } = useToast();
  const [days, setDays] = useState<AdminDayView[] | null>(null);
  const [overview, setOverview] = useState<AffiliateOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bridge/rotator/admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.days) setDays(data.days as AdminDayView[]);
        if (data?.affiliate) setOverview(data.affiliate as AffiliateOverview);
      })
      .catch(() => undefined);
  }, []);

  async function act(action: "confirm" | "cancel", date: string, userId?: string) {
    setBusy(`${action}:${date}`);
    try {
      const res = await fetch("/api/bridge/rotator/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, date, userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setDays(data.days as AdminDayView[]);
      toast({ title: "Rotator admin", description: data.detail });
    } catch (err) {
      toast({
        title: "Admin action failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  if (!days) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-bold flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" /> Rotator admin
      </h2>
      <Card>
        <CardContent className="py-5 space-y-4">
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No auctions yet — days open automatically when the first bid lands.</p>
          ) : (
            days.map((d) => (
              <div key={d.date} className="space-y-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="font-medium">{d.date}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{d.status}</span>
                  {d.status === "CONFIRMED" ? (
                    <span className="text-xs text-muted-foreground">
                      Winner: {d.winnerUrl} ({d.winningBid} gens)
                    </span>
                  ) : null}
                  {d.status !== "CANCELLED" ? (
                    <Button size="sm" variant="ghost" disabled={busy === `cancel:${d.date}`} onClick={() => void act("cancel", d.date)}>
                      Cancel day
                    </Button>
                  ) : null}
                </div>
                {d.status === "OPEN"
                  ? d.bids.map((b) => (
                      <div key={b.userId} className="flex items-center gap-3 text-xs text-muted-foreground pl-2">
                        <span>
                          {b.partner} — {b.amount} gens — {b.userId.slice(0, 8)}…
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `confirm:${d.date}`}
                          onClick={() => void act("confirm", d.date, b.userId)}
                        >
                          Confirm winner
                        </Button>
                      </div>
                    ))
                  : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      {overview ? (
        <Card>
          <CardContent className="py-5 space-y-4">
            <p className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Affiliate overview
              <span className="text-xs font-normal text-muted-foreground">
                {overview.membersWithLinks} member{overview.membersWithLinks === 1 ? "" : "s"} with saved links
              </span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {overview.offerSignups.map((o) => (
                <span key={o.partner}>
                  {o.name}: <b className="text-foreground">{o.signups}</b>
                </span>
              ))}
            </div>
            {overview.placements.length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Free rotator days (earned by signups)</p>
                {overview.placements.map((pl) => (
                  <p key={`${pl.date}-${pl.userId}-${pl.partner}`} className="text-xs text-muted-foreground">
                    {pl.date} · {pl.partnerName} · {pl.userLabel} ·{" "}
                    {pl.url ? (
                      <a href={pl.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        link
                      </a>
                    ) : (
                      <span className="text-amber-500">link deleted — sits out</span>
                    )}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No free rotator days scheduled yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
