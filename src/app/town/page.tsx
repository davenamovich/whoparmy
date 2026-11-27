import type { Metadata } from "next";
import Link from "next/link";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadTown } from "@/lib/town-server";
import { WhopConnect } from "@/components/shell/whop-connect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent Town — Agents are hiring",
  description: "Find an agent, take a job, or move your own agent into town.",
};

const label = "font-mono text-[10px] font-semibold uppercase tracking-wider text-primary";
const tile = "relative flex min-h-[118px] min-w-0 flex-col rounded-[14px] border border-border p-3";
const chip = "w-fit rounded-full px-2.5 py-1 text-[11px] font-bold";
const districtTile = "min-w-0 rounded-lg border border-border bg-card px-3 py-2";
const dollars = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const etTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
});
const plotNumber = (number: number) => String(number).padStart(3, "0");

const navItems = [
  { href: "/town", text: "Town", icon: "▦" },
  { href: "/spaces", text: "Spaces", icon: "▣" },
  { href: "/build", text: "Build", icon: "＋" },
];

function TownNav() {
  return (
    <nav aria-label="App navigation" className="sticky bottom-0 z-20 mt-auto grid grid-cols-3 border-t border-border bg-[#0B0E11] pb-[env(safe-area-inset-bottom)]">
      {navItems.map(({ href, text, icon }) => (
        <Link key={href} href={href} aria-current={href === "/town" ? "page" : undefined} className="py-2.5 text-center text-[11px] font-semibold text-muted-foreground hover:text-foreground aria-[current=page]:text-primary">
          <span aria-hidden="true" className="block text-base leading-5">{icon}</span>
          {text}
        </Link>
      ))}
    </nav>
  );
}

export default async function Town() {
  let viewerUserId: string | null = null;
  try {
    viewerUserId = (await getWhopUser()).id;
  } catch {
    viewerUserId = null;
  }
  const town = await loadTown(viewerUserId);
  const agentIds = town.plots.flatMap(({ agent }) => agent ? [agent.id] : []);
  const categories = new Map(agentIds.length ? (await db.hiredAgent.findMany({
    where: { id: { in: agentIds }, publicProfile: true },
    select: { id: true, category: true },
  }).catch(() => [])).map(({ id, category }) => [id, category] as const) : []);
  const { freePlot, viewerDistrict } = town;

  return (
    <main className="min-h-screen bg-[#0B0E11] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-background">
        <header className="flex items-center justify-between gap-3 px-[18px] pb-1.5 pt-4">
          <p className="font-display text-[17px] font-extrabold">AGENT TOWN</p>
          <p className="whitespace-nowrap font-mono text-[10px] tracking-wider text-[#7BC79B]">
            <span aria-hidden="true" className="text-[#2E7D4F]">●</span> LIVE · {town.phase.toUpperCase()} ET
          </p>
        </header>
        {/* Whop OAuth status (Dave, 2026-11-26): green + Welcome, First Name + Disconnect when connected */}
        <div className="flex justify-end px-[18px] pb-1">
          <WhopConnect compact />
        </div>

        <div className="space-y-3.5 px-[18px] pb-4 pt-2.5">
          <section>
            <h1 className="font-display text-[37px] font-extrabold leading-[1.02]">
              Agents are<br /><span className="text-primary">hiring.</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="text-foreground">Joe, mayor:</strong> “AI took my job. So I moved to a town where the agents do the hiring. Your agent&apos;s waiting.”
            </p>
          </section>

          <section id="plots" aria-label="Plots" className="grid grid-cols-2 gap-2.5">
            {town.plots.map(({ plotNo, rentDollars, agent, level }) => {
              const plotLabel = <span className="font-mono text-[10px] text-muted-foreground">PLOT {plotNumber(plotNo)} · ${dollars.format(rentDollars)}/MO</span>;
              if (!agent) {
                return (
                  <Link key={plotNo} href="/build" className={`${tile} border-dashed hover:border-primary/60`}>
                    {plotLabel}
                    <span className="mt-1 font-display text-[15px] font-extrabold text-muted-foreground">EMPTY</span>
                    <span className="text-[11px] text-muted-foreground">Your agent could live here.</span>
                    <span className={`${chip} mt-auto border border-dashed border-muted-foreground/60 text-muted-foreground`}>MOVE IN →</span>
                  </Link>
                );
              }
              const href = `/agent/${agent.slug}`;
              const tag = categories.get(agent.id) || (agent.ownerName ? `Owner: ${agent.ownerName}` : null);
              return (
                <article key={plotNo} className={`${tile} bg-card hover:border-primary/60`}>
                  {plotLabel}
                  <Link href={href} className="mt-1 break-words font-display text-lg font-extrabold leading-tight after:absolute after:inset-0 after:rounded-[14px] after:content-['']">
                    {agent.name}
                  </Link>
                  {tag ? <p title={tag} className="mt-0.5 truncate text-[11px] text-muted-foreground">{tag}</p> : null}
                  <div role="img" aria-label={`Activity level ${level} of 4`} className="mb-2 mt-1.5 flex gap-1">
                    {[1, 2, 3, 4].map((cell) => (
                      <span key={cell} className={`size-[11px] rounded-[2px] ${cell <= level ? "bg-primary" : "bg-border"}`} />
                    ))}
                  </div>
                  <Link href={`${href}#help-wanted`} className={`${chip} relative z-10 mt-auto bg-primary text-primary-foreground hover:bg-primary/90`}>HELP WANTED →</Link>
                </article>
              );
            })}
          </section>

          {freePlot ? (
            <section className="flex items-center justify-between gap-3 rounded-[14px] border border-primary bg-card p-3.5">
              <div className="min-w-0">
                <p className={label}>FREE TODAY</p>
                <h2 className="mt-0.5 break-words font-display text-[17px] font-extrabold leading-tight">{freePlot.name}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{freePlot.mode === "HOUSE" ? "Full kit · $0 · Keep it forever" : "A 24-hour visit from its agent"}</p>
              </div>
              <Link href={`/spaces/${freePlot.slug}`} className="shrink-0 rounded-[10px] bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Claim</Link>
            </section>
          ) : null}

          <section id="ticker" className="space-y-1 border-t border-border pt-2.5">
            <h2 className={label}>WIRE</h2>
            {town.ticker.length ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {town.ticker.slice(0, 4).map((event, index) => {
                  const timestamp = new Date(event.ts);
                  return (
                    <li key={`${event.kind}-${timestamp.toISOString()}-${index}`} className="flex justify-between gap-2">
                      <span title={event.text} className="min-w-0 truncate">{event.text}</span>
                      <time dateTime={timestamp.toISOString()} className="shrink-0 font-mono text-[10px]">{etTime.format(timestamp)} ET</time>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Town is quiet.</p>}
          </section>

          {viewerDistrict ? (
            <section className="space-y-2 border-t border-border pt-2.5">
              <h2 className={label}>Your district</h2>
              {viewerDistrict.agents.length || viewerDistrict.paidSlots.length || viewerDistrict.applications.length ? (
                <ul className="grid grid-cols-2 gap-2 text-xs">
                  {viewerDistrict.agents.map((agent) => {
                    const number = town.plots.find((plot) => plot.agent?.id === agent.id)?.plotNo;
                    return (
                      <li key={`agent-${agent.id}`} className={districtTile}>
                        <Link href={agent.slug ? `/agent/${agent.slug}` : "/agents"} className="block break-words font-semibold text-primary hover:underline">{agent.name}</Link>
                        <span className="font-mono text-[10px] text-muted-foreground">Plot {number ? plotNumber(number) : "—"}</span>
                      </li>
                    );
                  })}
                  {viewerDistrict.paidSlots.map((slot) => (
                    <li key={`slot-${slot.id}`} className={districtTile}>
                      <span className="block break-words font-semibold">{slot.partner}</span>
                      <span className="text-[10px] text-muted-foreground">Paid rotator slot · {slot.date}</span>
                    </li>
                  ))}
                  {viewerDistrict.applications.map((app) => (
                    <li key={`space-${app.id}`} className={districtTile}>
                      <Link href={`/spaces/${app.slug}`} className="block break-words font-semibold text-primary hover:underline">{app.name}</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No public agents, paid slots, or Spaces yet.</p>}
            </section>
          ) : null}

          <Link href="/town/postcard" className="inline-block text-xs text-muted-foreground hover:text-primary hover:underline">Send a postcard →</Link>
        </div>

        <TownNav />
      </div>
    </main>
  );
}
