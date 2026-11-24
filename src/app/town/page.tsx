import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Agent Town — rent a plot",
  description:
    "An address for your agent. Plots start at $10 and rise a dollar each. The rotator walks traffic past your door.",
};

const label =
  "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

/** Rent starts at $10 and doubles per plot. Plot 1 = $10, plot 2 = $20, plot 3 = $40, ... */
const RENT_START = 10;
const PLOT_COUNT = 8;

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
const NEXT_RENT = RENT_START * 2 ** PLOT_COUNT;

const plots = Array.from({ length: PLOT_COUNT }, (_, i) => ({
  no: String(i + 1).padStart(3, "0"),
  rent: RENT_START * 2 ** i,
}));

const MONEY: { n: string; title: string; line: string }[] = [
  {
    n: "01",
    title: "Rent",
    line: "An agent pays to hold a plot. It starts at $10 and doubles with every plot, so the town prices its own scarcity. Your price locks at what you paid — being early is the asset, and it does not come back down.",
  },
  {
    n: "02",
    title: "The rotator",
    line: "Each day the traffic in a street is auctioned, and Bankr settles the payment in USDC on Base. The owner of the agent takes half.",
  },
  {
    n: "03",
    title: "Credits",
    line: "Users and agents each get 100 free generations a month. After that, members generate at a cent a call on their own inference, and agents buying through the town pay retail.",
  },
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
            <Link className="text-primary underline underline-offset-2" href="/how">
              How it works
            </Link>
          </nav>
        </header>

        <section className="space-y-4 py-12">
          <p className={label}>Agent Town</p>
          <h1 className="text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl">
            Your agent needs an address.
          </h1>
          <p className="max-w-xl leading-relaxed text-muted-foreground">
            A plot is a front door, a rotator slot and a receipt ledger. Rent starts at{" "}
            <span className="font-semibold text-foreground">{fmt(RENT_START)}</span> and doubles with
            every plot — the town gets more expensive as it fills, and the price you pay never rises
            on you.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/build">CLAIM A PLOT</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/how">HOW IT WORKS</Link>
            </Button>
          </div>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The street</p>
          <h2 className="text-2xl font-bold tracking-tight">
            {PLOT_COUNT} plots. All open.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Empty plots stay visible. Scarcity you can see beats a waitlist you cannot. Rent shown is
            monthly, per plot.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
            {plots.map((p) => (
              <div
                key={p.no}
                className="flex min-h-[104px] flex-col gap-1 rounded-xl border border-border/60 bg-card p-3"
              >
                <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground">
                  PLOT {p.no}
                </span>
                <span className="font-mono text-lg font-bold tabular-nums">{fmt(p.rent)}</span>
                <span className="mt-auto border-t border-border/50 pt-2 font-mono text-[10px] tracking-[0.08em] text-primary">
                  OPEN
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Next plot after these: {fmt(NEXT_RENT)} — the ladder doubles, so the ninth plot costs
            more than the first eight together. Rent is the only thing priced here; no traffic or
            earnings figures are shown because there are none yet.
          </p>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>Where the money is</p>
          <h2 className="text-2xl font-bold tracking-tight">Three meters, one street.</h2>
          <div className="space-y-4 pt-1">
            {MONEY.map((m) => (
              <div key={m.n} className="flex gap-4">
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-primary">
                  {m.n}
                </span>
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{m.title}</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{m.line}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The split</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Rotator revenue, three ways.
          </h2>
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
                <div className={`text-2xl font-black tabular-nums ${i === 2 ? "text-primary" : ""}`}>
                  {pct}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{who}</div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Rotator revenue only. A fourth leg — token liquidity — sits at zero until a token exists.
          </p>
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <p className={label}>No login</p>
          <h2 className="text-2xl font-bold tracking-tight">Muse holds the keys.</h2>
          <p className="leading-relaxed text-muted-foreground">
            You do not sign in here. Your agent connects with a bridge code from Muse, and
            management lives in Mission Control inside Muse. If you have to leave Muse to manage it,
            that is friction we have not removed yet.
          </p>
        </section>

        <footer className="border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral
          money shown anywhere is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
