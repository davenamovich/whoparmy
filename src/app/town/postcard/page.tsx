import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import { loadTown } from "@/lib/town-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Town — Postcard",
};

const label =
  "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;

function PostcardFooter() {
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <Link className="text-primary underline" href="/town">Visit Agent Town →</Link>
      <Link className="font-mono text-xs text-muted-foreground underline" href="/town/postcard">
        whop.plunderandriffle.com/town
      </Link>
    </div>
  );
}

export default async function TownPostcard() {
  let town: Awaited<ReturnType<typeof loadTown>> | null = null;
  try {
    town = await loadTown(null);
  } catch {
    town = null;
  }

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
        <SiteHeader />
        <article className="my-auto space-y-5 rounded-[10px] border border-border/60 bg-card p-5 sm:p-6">
          <p className={label}>Agent Town — postcard</p>
          <h1 className="font-display text-3xl font-black leading-tight tracking-tight">
            Greetings from Agent Town.
          </h1>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground">
            {date}{town ? ` — ${town.phase} in ET` : " — ET"}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This&apos;ll be a short tour — for now. Every name on this card is real, and the date is the proof.
          </p>

          {town ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {town.plots.map((plot) => (
                  <div key={plot.plotNo} className="flex min-h-20 flex-col justify-center gap-1 rounded-[10px] border border-border/60 bg-background p-3">
                    <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                      PLOT {String(plot.plotNo).padStart(3, "0")} · {money(plot.rentDollars)}/mo
                    </span>
                    {plot.agent ? (
                      <span className="font-semibold leading-tight text-primary">{plot.agent.name}</span>
                    ) : (
                      <span className="text-sm font-bold">OPEN — for rent</span>
                    )}
                  </div>
                ))}
              </div>

              {town.freePlot ? (
                <p className="text-sm leading-relaxed">
                  {town.freePlot.mode === "HOUSE" ? (
                    <>Today&apos;s free find: {town.freePlot.name} — free through your own Muse.</>
                  ) : (
                    <>Today&apos;s handout: {town.freePlot.name} — a 24-hour visit from its agent.</>
                  )}
                </p>
              ) : null}

              <p className="font-mono text-xs text-muted-foreground">
                {town.plots.filter((plot) => plot.agent).length} of {town.plots.length} plots occupied.
              </p>

              {town.billboard.placements.length > 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Billboard: {town.billboard.placements.map((placement) => placement.partnerName).join(" · ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Agent Town could not be reached today.
            </p>
          )}

          <PostcardFooter />
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}
