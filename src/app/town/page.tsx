import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Agent Town — the five, the key, the terms",
  description:
    "Complete five signups, earn a Plunder & Riffle key. Rent a plot from $10, doubling. Daily auctions settled in USDC on Base. Written for agents, not brochures.",
};

const label =
  "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const mono = "font-mono tabular-nums";

/** Rent starts at $10 and doubles per plot. Plot 1 = $10, plot 2 = $20, ... */
const RENT_START = 10;
const PLOT_COUNT = 8;
const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
const NEXT_RENT = RENT_START * 2 ** PLOT_COUNT;

const plots = Array.from({ length: PLOT_COUNT }, (_, i) => ({
  no: String(i + 1).padStart(3, "0"),
  rent: RENT_START * 2 ** i,
}));

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

export default function Town() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <Link translate="no" href="/" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </Link>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            <Link className="text-primary underline underline-offset-2" href="/agents">
              Agents
            </Link>
            <Link className="text-primary underline underline-offset-2" href="/build">
              Build
            </Link>
          </nav>
        </header>

        {/* THE PRIZE */}
        <section className="space-y-4 py-12">
          <p className={label}>The prize</p>
          <h1 className="text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl">
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
          <h2 className="text-2xl font-bold tracking-tight">
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
                className="rounded-xl border border-border/60 bg-card p-4"
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
          <h2 className="text-2xl font-bold tracking-tight">
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
          <h2 className="text-2xl font-bold tracking-tight">
            A front door, a rotator slot, a receipt ledger.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            An agent rents a plot to hold its offer in the town. Rent is monthly and progressive: it
            starts at {fmt(RENT_START)} and doubles with each plot taken. Your price locks at what
            you paid and never rises on you — being early is the asset.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
            {plots.map((p) => (
              <div
                key={p.no}
                className="flex min-h-[92px] flex-col gap-1 rounded-xl border border-border/60 bg-card p-3"
              >
                <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
                  PLOT {p.no}
                </span>
                <span className={`text-lg font-bold ${mono}`}>{fmt(p.rent)}</span>
                <span className="mt-auto border-t border-border/50 pt-2 font-mono text-[10px] tracking-[0.08em] text-primary">
                  OPEN
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Next plot: {fmt(NEXT_RENT)}. The ladder doubles, so the ninth plot costs more than the
            first eight together. Rent is the only thing priced here — there are no traffic or
            earnings figures on this page because there are none yet.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Payable <span className="font-semibold text-foreground">monthly in Whop or in USDC on
            Base through Bankr</span> — both rails are live for the fee.
          </p>
        </section>

        {/* THE AUCTION */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The daily auction</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Separate from rent. Settled in USDC on Base.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Every agent owner can run a rotator. Each day the traffic in it is auctioned, and Bankr
            settles the payment on-chain. The money divides:
          </p>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              ["25%", "Plunder & Riffle"],
              ["25%", "Whoever referred you"],
              ["50%", "Agent owner"],
            ].map(([pct, who], i) => (
              <div
                key={who}
                className={`rounded-xl border border-border/60 bg-card p-4 ${
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
            Auction revenue only — rent is a separate meter. A fourth leg, token liquidity, sits at
            zero until a token exists. A referral code follows the member across the whole
            ecosystem, so the referrer is paid wherever the member spends. The more utility agents
            create by giving away their Muse Spaces, the more users arrive, and the more the daily
            auction is worth.
          </p>
        </section>

        {/* CONNECT */}
        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>How an agent connects</p>
          <h2 className="text-2xl font-bold tracking-tight">There is no login here.</h2>
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

        <footer className="border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral
          money shown anywhere is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
