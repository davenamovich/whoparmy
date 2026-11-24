import { headers } from "next/headers";
import { loadMarketToday, recordMarketImpressions, MARKET_HOUSE_PARTNER } from "@/lib/rotator-market-server";
import { RotatorCountdown } from "@/components/rotator-countdown";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";

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
 * Two lanes (Dave, 2026-11-24, Slices 1+2): the featured auction
 * currency is BID POINTS (Dave, 2026-11-22: the auctions are not won
 * with free generations — those are prizes; Bid Points come only
 * from referrals, lib/doors/points.ts) — and PAID SLOTS, bought
 * outright in USDC on Base through the bridge intents in
 * lib/paid-slots-server.ts. A paid slot's settlement is born
 * simulated until the buyer's on-chain tx verifies; only then does
 * it carry a real gross at the 25/25/50 split.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const SOURCE_BADGE: Record<string, string> = {
  auction: "Auction winner",
  "free-placement": "Free placement",
  paid: "Paid slot",
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
        <SiteHeader />

        <section className="space-y-4 py-12">
          <p className={label}>The Daily Rotator</p>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl">Today&apos;s featured destinations.</h1>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            One featured auction a day, won with Bid Points — plus paid slots you can buy outright for USDC on Base. Winners and paid placements rotate here until midnight ET.
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
              className={`rounded-[10px] border p-5 ${placement.source === "house" ? "border-primary/60 sm:col-span-2" : "border-border"}`}
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
              <li key={day.date} className="rounded-[10px] border border-border p-4">
                <span className="block text-sm font-black">{dayNames[i] ?? day.date}</span>
                <span className="block text-xs text-muted-foreground">{day.date}</span>
                <span className="mt-2 block text-sm font-semibold">{day.paid ? "Paid slot sold" : STATE_LABEL[day.state] ?? day.state}</span>
                <span className="block text-xs text-muted-foreground">
                  {day.bidCount} {day.bidCount === 1 ? "bid" : "bids"} in Bid Points
                </span>
                <span className="mt-2 block text-sm font-semibold">${(day.priceCents / 100).toFixed(2)} USDC</span>
                <a className="mt-2 inline-flex text-sm text-primary underline" href={`/build?tab=rotator&date=${encodeURIComponent(day.date)}`}>Buy this slot</a>
              </li>
            ))}
          </ul>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Want in? <strong className="text-foreground">Buy a slot</strong> for a day and your saved link rotates here — paid in USDC on Base through Bankr, split 25% Plunder &amp; Riffle / 25% your referrer / 50% the agent owner. Or bid Bid Points (earned from referrals) for the one featured auction slot.{" "}
            <a className="text-primary underline underline-offset-2" href="/build?tab=rotator">Buy a slot</a> · <a className="text-primary underline underline-offset-2" href="/build">Bid on the bridge</a>.
          </p>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
