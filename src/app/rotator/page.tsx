import { headers } from "next/headers";
import { loadMarketToday, recordMarketImpressions, MARKET_HOUSE_PARTNER } from "@/lib/rotator-market-server";
import { RotatorCountdown } from "@/components/rotator-countdown";

export const dynamic = "force-dynamic";

/**
 * ─── /rotator — the public rotator marketplace (Whop Army 2.0, ────
 * Slice 5). Today's ACTIVE placements from the existing daily
 * rotator — confirmed auction winner first, then the day's free
 * placements — plus derived inventory for today and the next two
 * days and the countdown to the 23:50 ET bidding close.
 *
 * Rendering this page records one impression hop per placement shown
 * in the RotatorHop ledger (surface ROTATOR_PAGE, filtered by the
 * usual hop scoring — bots and duplicates don't count). TRY IT goes
 * through /api/rotator/launch, which records the click and resolves
 * the destination server-side. On a day with no live placement, the
 * house card is The BTC Experiment (Dave, 2026-11-21).
 *
 * The auction currency is FREE GENERATIONS, exactly as the member
 * rotator has always worked. Paid placements are not live yet and
 * no money moves here — settlement is a later, separately gated
 * slice, and every money figure anywhere stays SIMULATED until then.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const SOURCE_BADGE: Record<string, string> = {
  auction: "Auction winner",
  "free-placement": "Free placement",
  house: "House rotation",
};

const STATE_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved — bids in",
  SOLD: "Sold — winner confirmed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

function timeLeftToday(dayEndsAt: string): string {
  const ms = new Date(dayEndsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Ends at midnight ET";
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m left today` : `${m}m left today`;
}

export default async function RotatorMarketplacePage() {
  const { view, internal } = await loadMarketToday();

  // Impressions: one hop per placement shown, best-effort — a
  // tracking failure must never break the page.
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
    await recordMarketImpressions(internal, { ip, ua: h.get("user-agent"), referer: h.get("referer") });
  } catch (err) {
    console.error("[rotator-market] impression recording failed:", err);
  }

  const dayNames = ["Today", "Tomorrow", "Day after"];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            <a className="text-primary underline underline-offset-2" href="/api/auth/whop">
              Connect
            </a>
          </nav>
        </header>

        <section className="space-y-4 py-12">
          <p className={label}>The Daily Rotator</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">Today&apos;s featured destinations.</h1>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            One auction a day, won with free generations. The winner and the day&apos;s free placements rotate here
            until midnight ET.
          </p>
          <p className="text-sm font-semibold text-primary">
            <RotatorCountdown closesAt={view.closesAt} />
          </p>
          <p className="text-xs text-muted-foreground">
            Today so far: {view.stats.countedImpressions} counted impressions · {view.stats.countedLaunches} counted
            launches. Counted means the hop ledger&apos;s bot and duplicate filtering let it through — this is not
            verified human traffic.
          </p>
        </section>

        <ul className="grid gap-4 pb-12 sm:grid-cols-2">
          {view.placements.map((placement) => (
            <li
              key={placement.partner}
              className={`rounded-2xl border p-5 ${placement.source === "house" ? "border-primary/60 sm:col-span-2" : "border-border"}`}
            >
              <div className="space-y-3">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-lg font-black leading-tight">{placement.partnerName}</span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
                    {SOURCE_BADGE[placement.source] ?? placement.source}
                  </span>
                </span>
                <span className="block text-sm text-muted-foreground">
                  {placement.host ?? placement.partner}
                  {placement.ownerName ? ` · by ${placement.ownerName}` : ""}
                </span>
                <span className="block text-xs text-muted-foreground">{timeLeftToday(view.dayEndsAt)}</span>
                <a
                  href={`/api/rotator/launch?partner=${encodeURIComponent(placement.partner)}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  TRY IT
                </a>
                {placement.partner === MARKET_HOUSE_PARTNER ? (
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    The house destination: play the game, pick an agent, come back once for its bridge code.
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>Inventory</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {view.inventory.map((day, i) => (
              <li key={day.date} className="rounded-2xl border border-border p-4">
                <span className="block text-sm font-black">{dayNames[i] ?? day.date}</span>
                <span className="block text-xs text-muted-foreground">{day.date}</span>
                <span className="mt-2 block text-sm font-semibold">{STATE_LABEL[day.state] ?? day.state}</span>
                <span className="block text-xs text-muted-foreground">
                  {day.bidCount} {day.bidCount === 1 ? "bid" : "bids"} in free generations
                </span>
              </li>
            ))}
          </ul>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Want in? Members bid <strong className="text-foreground">free generations</strong> to feature one of their
            saved links for a day — bidding is in free generations, not money, and paid placements are not live yet.{" "}
            <a className="text-primary underline underline-offset-2" href="/build">
              Bid on the bridge
            </a>
            .
          </p>
        </section>

        <footer className="mt-auto border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
