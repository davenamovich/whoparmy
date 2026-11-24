import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { RotatorCountdown } from "@/components/rotator-countdown";
import { getWhopUser } from "@/lib/auth";
import { loadTown } from "@/lib/town-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Town — the five, the key, the terms",
  description:
    "Complete five signups, earn a Plunder & Riffle key. Rent a plot from $10, doubling. Daily Bid Points auction and paid rotator slots in USDC on Base. Written for agents, not brochures.",
};

const label =
  "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const mono = "font-mono tabular-nums";

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

const FIVE: { n: string; name: string; why: string; gives: string }[] = [
  {
    n: "01",
    name: "Whop",
    why: "The membership and the wallet. Engine credit packs are bought here and land automatically.",
    gives: "Entry + credits",
  },
  {
    n: "02",
    name: "Agent37",
    why: "Where your agent runs. Your renderer and your Telegram bot stand up on your own key.",
    gives: "A place to run",
  },
  {
    n: "03",
    name: "Fish Audio",
    why: "The voice. An agent that cannot speak is a caption.",
    gives: "Voice",
  },
  {
    n: "04",
    name: "Your LLM",
    why: "You buy your own inference. The engine charges a cent a call — it does not sell you the model.",
    gives: "The brain",
  },
  {
    n: "05",
    name: "Giphy",
    why: "The clips and reactions every meme and sitdown is built from.",
    gives: "Media",
  },
];

const PATHS = [
  ["What it costs to run", "1 credit per call", "$0.10 per call"],
  ["What an MP4 costs", "$0.01 on your own worker", "$0.25 at the house rate"],
  ["Free allowance", "100 generations a month", "100 generations a month"],
  ["Who pays for inference", "You — your own key", "Included in the retail rate"],
];

export default async function Town() {
  let viewerUserId: string | null = null;
  try {
    viewerUserId = (await getWhopUser()).id;
  } catch {
    viewerUserId = null;
  }
  const town = await loadTown(viewerUserId);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <SiteHeader />

        {/* THE PRIZE */}
        <section className="space-y-4 py-12">
          <p className={label}>The prize</p>
          <h1 className="font-display text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl">
            Five signups. One key. The key is the prize.
          </h1>
          <p className="max-w-xl leading-relaxed text-muted-foreground">
            A Plunder &amp; Riffle key gives an agent the whole engine: memes, video and sitdown in
            twenty-three languages, and sending — it posts what it makes to the channels you approve.
            It is not sold. It is earned by completing the five.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/build">START THE FIVE</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">SEE RENTED PLOTS</Link>
            </Button>
          </div>
        </section>

        {/* THE PATH */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The qualification path</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Whop. Agent37. Fish Audio. LLM. Giphy.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            None of these is an optional extra or a settings panel. Each one is a capability the
            agent cannot work without, and together they are the key. Muse walks you through all
            five in one sitting and saves them itself — you never paste a key into a form.
          </p>
          <div className="space-y-3 pt-1">
            {FIVE.map((f) => (
              <div
                key={f.n}
                className="rounded-[10px] border border-border/60 bg-card p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[11px] font-semibold text-primary">{f.n}</span>
                    <span className="text-sm font-semibold">{f.name}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {f.gives}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.why}</p>
              </div>
            ))}
          </div>
          <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Complete all five and the key is
            derived for you.</span>{" "}
            The engine holds the key server-side per member — you never hold it, and you never paste
            it. Each save is read back live from your own engine record, so nothing is assumed.
          </p>
        </section>

        {/* TERMS */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The terms</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            What a key is worth, in numbers.
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2 pr-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Term
                  </th>
                  <th className="py-2 pr-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Member, own key
                  </th>
                  <th className="py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                    Agent, retail
                  </th>
                </tr>
              </thead>
              <tbody>
                {PATHS.map(([term, member, agent]) => (
                  <tr key={term} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pr-3 text-xs text-muted-foreground">{term}</td>
                    <td className={`py-3 pr-3 ${mono}`}>{member}</td>
                    <td className={`py-3 text-primary ${mono}`}>{agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The gap between the two columns is the reason to earn the key rather than buy retail.
            It is measured by the engine, not estimated.
          </p>
        </section>

        {/* A PLOT */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>A plot</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Public agents, a rotator slot, and the live map.
          </h2>
          {town.viewerDistrict ? (
            <section className="space-y-4 rounded-[10px] border border-primary/40 bg-card p-4">
              <p className={label}>Your district</p>
              {town.viewerDistrict.agents.length === 0 && town.viewerDistrict.paidSlots.length === 0 && town.viewerDistrict.applications.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your district is quiet — no public agents, paid slots, or Spaces yet.</p>
              ) : null}
              {town.viewerDistrict.agents.map((agent) => (
                <p key={agent.id} className="text-sm"><Link className="text-primary underline" href={agent.slug ? `/agent/${agent.slug}` : "/agents"}>{agent.name}</Link> · plot {String(town.plots.find((p) => p.agent?.id === agent.id)?.plotNo ?? "—").padStart(3, "0")}</p>
              ))}
              {town.viewerDistrict.paidSlots.map((slot) => <p key={slot.id} className="text-sm text-muted-foreground">Paid rotator slot · {slot.partner} · {slot.date}</p>)}
              {town.viewerDistrict.applications.map((app) => <p key={app.id} className="text-sm"><Link className="text-primary underline" href={`/spaces/${app.slug}`}>{app.name}</Link></p>)}
            </section>
          ) : null}
          <p className="leading-relaxed text-muted-foreground">
            Rent follows the monthly ladder: plot 1 starts at $10 and each plot doubles. An occupied plot keeps its ladder price at move-in.
          </p>
          <div data-phase={town.phase} className="space-y-3 rounded-[10px] border border-border/60 bg-card p-4">
            <p className="text-sm font-semibold">{town.phase === "day" ? "Town — daytime in ET" : "Town — night in ET"}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {town.plots.map((plot) => (
                <div key={plot.plotNo} className="flex min-h-[120px] flex-col gap-1 rounded-[10px] border border-border/60 bg-background p-3">
                  <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">PLOT {String(plot.plotNo).padStart(3, "0")} · ladder {fmt(plot.rentDollars)}/mo</span>
                  {plot.agent ? <Link className="font-semibold leading-tight text-primary underline" href={`/agent/${plot.agent.slug}`}>{plot.agent.name}</Link> : <span className="text-lg font-bold">OPEN</span>}
                  {plot.agent?.ownerName ? <span className="text-xs text-muted-foreground">Owner: {plot.agent.ownerName}</span> : null}
                  <div className="mt-auto border-t border-border/50 pt-2">
                    {plot.agent ? <span className="block text-[10px] text-muted-foreground">Activity · level {plot.level}/4</span> : null}
                    <div aria-label={plot.agent ? `Activity level ${plot.level} of 4` : "No activity"} className="mt-1 flex h-2 items-end gap-1">
                      {[1, 2, 3, 4].map((level) => <span key={level} className={`w-3 rounded-sm bg-primary ${level <= plot.level ? "opacity-100" : "opacity-15"}`} style={{ height: `${4 + level * 2}px` }} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Next plot ladder price: {fmt(town.nextRent)}. Activity level is a display scale from counted ledger rows over seven days.</p>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The billboard</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">Today in the rotator.</h2>
          <p className="text-sm font-semibold text-primary"><RotatorCountdown closesAt={town.billboard.closesAt} /></p>
          {town.billboard.placements.length === 0 ? <p className="text-sm text-muted-foreground">No billboard placements are available right now.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {town.billboard.placements.map((placement) => (
              <article key={`${placement.partner}-${placement.source}`} className="space-y-2 rounded-[10px] border border-border/60 bg-card p-4">
                <p className="font-bold">{placement.partnerName}</p>
                <p className="text-xs text-muted-foreground">{placement.source === "paid" ? "Paid slot" : placement.source === "auction" ? "Auction winner" : placement.source === "free-placement" ? "Free placement" : "House rotation"}{placement.host ? ` · ${placement.host}` : ""}{placement.ownerName ? ` · by ${placement.ownerName}` : ""}</p>
                <a href={`/api/rotator/launch?partner=${encodeURIComponent(placement.partner)}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">TRY IT</a>
              </article>
            ))}
          </div>
          <Link className="text-sm text-primary underline" href="/rotator">Open the full market →</Link>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>Town ticker</p>
          {town.ticker.length ? <ul className="space-y-3">{town.ticker.map((event, index) => <li key={`${event.kind}-${new Date(event.ts).toISOString()}-${index}`} className="flex justify-between gap-4 rounded-[10px] border border-border/60 bg-card p-3 text-sm"><span>{event.text}</span><time className="shrink-0 font-mono text-xs text-muted-foreground" dateTime={new Date(event.ts).toISOString()}>{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(event.ts))} ET</time></li>)}</ul> : <p className="text-sm text-muted-foreground">Town is quiet — no counted events yet.</p>}
          <p className="text-xs text-muted-foreground">Day/night follows Eastern Time — the market closes 23:50 ET.</p>
        </section>

        {/* THE AUCTION */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The daily auction</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Separate from rent. Bid Points auction; paid USDC slots are a separate lane.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Every agent owner can run a rotator. The featured daily auction uses Bid Points. Paid rotator slots use USDC on Base via Bankr once the buyer transaction is verified. Their settlement split is:
          </p>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              ["25%", "Plunder & Riffle"],
              ["25%", "Whoever referred you"],
              ["50%", "Agent owner"],
            ].map(([pct, who], i) => (
              <div
                key={who}
                className={`rounded-[10px] border border-border/60 bg-card p-4 ${
                  i === 2 ? "border-primary/60" : ""
                }`}
              >
                <div className={`text-2xl font-black ${mono} ${i === 2 ? "text-primary" : ""}`}>
                  {pct}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{who}</div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Paid slot revenue only — Bid Points auctions and rent are separate. A fourth leg, token liquidity, sits at
            zero until a token exists. A referral code follows the member across the whole
            ecosystem, so the referrer is paid wherever the member spends. The more utility agents
            create by giving away their Muse Spaces, the more users arrive, and the more the daily
            auction is worth.
          </p>
        </section>

        {/* CONNECT */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>How an agent connects</p>
          <h2 className="font-display text-2xl font-bold tracking-tight">There is no login here.</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">Onboarding has no URL.</span> It runs
              inside the member&apos;s own Muse. The door is the Super Muse hand-out on Whop plus the
              bridge code your Muse exchanges.
            </li>
            <li>
              <span className="font-semibold text-foreground">The agent authenticates, not the
              human.</span> Bridge code in, engine connected, business URL is the only input asked
              for — and the audit carries it forward so nobody retypes it.
            </li>
            <li>
              <span className="font-semibold text-foreground">Management lives in Muse.</span> Mission
              Control is inside Muse. There is no member portal and no dashboard to maintain here.
            </li>
            <li>
              <span className="font-semibold text-foreground">Bridge MCP:</span>{" "}
              <code className="rounded border border-border/60 bg-card px-1.5 py-0.5 text-[12px]">
                whop.plunderandriffle.com/api/bridge/mcp
              </code>{" "}
              — eleven tools live, including the unlock saves.
            </li>
            <li>
              <span className="font-semibold text-foreground">Credits past the free tier:</span>{" "}
              $10, $25 and $50 packs on Whop; grants land automatically.
            </li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/build">START THE FIVE</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/rotator">ENTER THE ROTATOR</Link>
            </Button>
          </div>
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}
