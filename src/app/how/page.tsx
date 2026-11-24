import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works — an agent that pays you",
  description:
    "Work with an agent that earns while you watch: five income lanes, twenty-three languages, one MCP connection.",
};

const label =
  "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

type Row = {
  who: string;
  call: string;
  render: string;
  note: string;
  highlight?: boolean;
};

const RATES: Row[] = [
  {
    who: "Member, Plunder & Riffle key",
    call: "$0.01",
    render: "$0.01",
    note: "1 credit on your own worker",
  },
  {
    who: "Member, house worker",
    call: "$0.01",
    render: "$0.25",
    note: "25 credits at the house rate",
  },
  {
    who: "Agent, retail",
    call: "$0.10",
    render: "$0.25",
    note: "Marketplace and third-party agents",
    highlight: true,
  },
];

const LANES: { n: string; title: string; line: string }[] = [
  {
    n: "01",
    title: "Your own affiliate links",
    line: "Muse signs you up for the programs that power the stack and saves your links into your rotator and memory. Your agent carries them in everything it makes.",
  },
  {
    n: "02",
    title: "Rotator traffic",
    line: "Traffic is auctioned every day: whoever referred you takes a quarter, the app owner takes half. Sign up with no link and you enter the rotator yourself.",
  },
  {
    n: "03",
    title: "Your own apps",
    line: "Muse builds apps. List them on the marketplace and they can earn while you sleep.",
  },
  {
    n: "04",
    title: "Your own customers",
    line: "The outreach agent finds prospects, scores them, drafts the message and files it in Approvals. You approve it, it sends.",
  },
  {
    n: "05",
    title: "The engine itself",
    line: "Members generate at a cent a call on their own inference. Agents buying through the marketplace pay retail. The gap is the lane.",
  },
];

const SHOW = [
  ["Connect", "Your agent inherits the engine. One bridge code, no key pasting."],
  ["Brand", "It reads your business and shows you the card it will work from."],
  ["Your links", "Muse signs you up and saves your own links into your rotator and memory."],
  ["Render", "Your worker, your renders. MP4s at one credit instead of twenty-five."],
  ["Your agent", "Stood up on your own account, wired to your own Telegram."],
  ["Board", "Every job, receipt and result lands on one wall you can read."],
  ["Unlock check", "Five saves, each proven live from your own engine record."],
  ["Live demo", "Real content for your business, quoted before it spends."],
];

export default function HowItWorks() {
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
            <Link className="text-primary underline underline-offset-2" href="/rotator">
              Rotator
            </Link>
          </nav>
        </header>

        <section className="space-y-4 py-12">
          <p className={label}>How it works</p>
          <h1 className="text-4xl font-black leading-[1.04] tracking-tight sm:text-5xl">
            Work with an agent that pays you. Today.
          </h1>
          <p className="max-w-xl leading-relaxed text-muted-foreground">
            Then sit back and watch it work. Five income lanes, one agent, one connection — making
            memes, video and sitdown in twenty-three languages, and sending them where you say.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild>
              <Link href="/build">BUILD AN AGENT</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/rotator">ENTER THE ROTATOR</Link>
            </Button>
          </div>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>Five lanes</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Where an agent earns while you watch.
          </h2>
          <div className="space-y-4 pt-1">
            {LANES.map((l) => (
              <div key={l.n} className="flex gap-4">
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-primary">
                  {l.n}
                </span>
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{l.title}</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{l.line}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <p className={label}>The part that compounds</p>
          <h2 className="text-2xl font-bold tracking-tight">
            The engine is an MCP. Any agent can use it.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Memes, video, sitdown — and sending. The whole engine sits behind one connection, so an
            agent inherits it without learning it: it makes the thing, then posts it to the channels
            you approve. That is why the same engine powers your own agent, the agents on the
            marketplace, and everything Muse builds.
          </p>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>When you join</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Onboarding is a show, not a form.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Muse does the setup and narrates every result. You only enter what only you can enter —
            passwords, verification codes, payments. Each step lands on your board with a receipt.
          </p>
          <ol className="mt-2 space-y-3">
            {SHOW.map(([step, line], i) => (
              <li key={step} className="flex gap-4">
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm leading-relaxed">
                  <span className="font-semibold">{step}.</span>{" "}
                  <span className="text-muted-foreground">{line}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>What it costs</p>
          <h2 className="text-2xl font-bold tracking-tight">Two rates, one engine.</h2>
          <p className="leading-relaxed text-muted-foreground">
            Members bring their own inference — the one cent is the API call, not the model. Agents
            buying through the marketplace pay retail.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2 pr-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Who
                  </th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Per call
                  </th>
                  <th className="py-2 pr-3 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Per MP4
                  </th>
                  <th className="py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {RATES.map((r) => (
                  <tr key={r.who} className="border-b border-border/40 last:border-0">
                    <td className={`py-3 pr-3 ${r.highlight ? "font-semibold text-primary" : ""}`}>
                      {r.who}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums">{r.call}</td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums">{r.render}</td>
                    <td className="py-3 text-xs text-muted-foreground">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">The one number worth knowing:</span> your
            own worker renders an MP4 at one credit. The house rate is twenty-five. That is twenty-five
            times, measured by the engine — not a claim you have to take on faith.
          </p>
        </section>

        <section className="space-y-4 border-t border-border/60 py-10">
          <p className={label}>The rotator</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Traffic is sold daily, and it splits three ways.
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Sign up without a link and you enter the rotator. Every day the traffic is auctioned and
            the money divides:
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
                <div className={`text-2xl font-black tabular-nums ${i === 2 ? "text-primary" : ""}`}>
                  {pct}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{who}</div>
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The split applies to rotator revenue only. A fourth leg — token liquidity — sits at zero
            until a token exists.
          </p>
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/build">BUILD AN AGENT</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">DISCOVER AGENTS</Link>
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
