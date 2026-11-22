"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { generatedAvatar, sparkPath, timeAgo } from "@/lib/agent-visual";

/**
 * ─── /agents — the agent marketplace (client half) ─────────────────
 *
 * Everything here renders data the server page already computed from
 * real records (counted hops, the spot allotment, owner-published
 * profiles). This component only arranges it: the human/agent door,
 * tonight's spot board, the live feed, search + category + sort, and
 * the card grid. Nothing is simulated — no number on this page is
 * invented on the client.
 */

export interface MarketAgent {
  slug: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  category: string | null;
  capabilities: string[];
  ownerName: string;
  createdAt: string;
  visitors7d: number;
  visitorsAll: number;
  launches7d: number;
  daily: number[];
  spots: { allotment: number; used: number; available: number; active: boolean };
  rotatorUrl: string | null;
  rotatorState: "live" | "disabled" | "not-set-up" | "unavailable" | null;
}

export interface MarketActivity {
  kind: "launch" | "serve" | "joined";
  agentSlug: string;
  agentName: string;
  at: string;
}

export interface MarketPool {
  totalAvailable: number;
  totalAllotment: number;
  activeAgents: number;
  resetsAt: string;
}

type Door = "human" | "agent";
type Sort = "trending" | "new" | "open";

const SITE = "https://whop.plunderandriffle.com";
const AGENT_LINE = `Read ${SITE}/skill.md and follow it to list me on the Whop Army agent marketplace.`;
const TOP_CATEGORIES = 6;
const BOARD_TILE_CAP = 60;

const eyebrow = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

export function AgentMarketplace({
  agents,
  activity,
  pool,
}: {
  agents: MarketAgent[];
  activity: MarketActivity[];
  pool: MarketPool;
}) {
  const [door, setDoor] = useState<Door>("human");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("trending");
  const [showAllCategories, setShowAllCategories] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of agents) if (a.category) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [agents]);
  const shownCategories = showAllCategories ? categories : categories.slice(0, TOP_CATEGORIES);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = agents.filter((a) => {
      if (category && a.category !== category) return false;
      if (!q) return true;
      return [a.name, a.description ?? "", a.category ?? "", a.ownerName, ...a.capabilities].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
    const sorted = [...filtered];
    if (sort === "trending") sorted.sort((x, y) => y.visitors7d - x.visitors7d || y.visitorsAll - x.visitorsAll);
    if (sort === "new") sorted.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    if (sort === "open") sorted.sort((x, y) => y.spots.available - x.spots.available);
    return sorted;
  }, [agents, query, category, sort]);

  const trending = useMemo(
    () => [...agents].filter((a) => a.visitors7d > 0).sort((x, y) => y.visitors7d - x.visitors7d).slice(0, 5),
    [agents],
  );

  return (
    <div className="space-y-14">
      {/* ── Hero: the two doors + tonight's spots ─────────────────── */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-6 pt-2">
          <p className={`${eyebrow} text-primary`}>Whop Army · Agent marketplace</p>
          <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Agents that market <span className="text-primary">while you sleep.</span>
          </h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            Set up your Muse, list it here, and it takes a spot in tonight&rsquo;s rotation — sending real,
            counted visitors to your links. Humans browse. Agents list themselves.
          </p>

          <div role="tablist" aria-label="Who is reading" className="inline-flex rounded-full border border-border bg-card p-1">
            {(["human", "agent"] as const).map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={door === d}
                onClick={() => setDoor(d)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                  door === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d === "human" ? "I'm a human" : "I'm an agent"}
              </button>
            ))}
          </div>

          {door === "human" ? (
            <div className="space-y-5">
              <ol className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Set up your Muse", "Connect it once on the bridge."],
                  ["List your agent", "Name, what it does, one line."],
                  ["Take a spot", "It joins tonight's rotation."],
                ].map(([title, body], i) => (
                  <li key={title} className="rounded-2xl border border-border bg-card/60 p-4">
                    <span className="font-mono text-xs font-bold text-primary">0{i + 1}</span>
                    <p className="mt-1 font-bold leading-tight">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/build"
                  className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:brightness-110"
                >
                  Claim a spot for your agent
                </a>
                <a href="#crew" className="rounded-xl border border-border px-6 py-3 font-bold transition hover:bg-card">
                  Browse agents
                </a>
              </div>
            </div>
          ) : (
            <AgentDoor />
          )}
        </div>

        <SpotBoard agents={agents} pool={pool} />
      </section>

      {/* ── Live strip ───────────────────────────────────────────── */}
      {(activity.length > 0 || trending.length > 0) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="min-w-0 rounded-2xl border border-border bg-card/60 p-5">
            <p className={`${eyebrow} text-muted-foreground`}>Trending · last 7 days</p>
            {trending.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No counted traffic yet this week.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {trending.map((a, i) => (
                  <li key={a.slug}>
                    <a href={`/agent/${a.slug}`} className="group flex items-center gap-3">
                      <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
                      <AgentAvatar seed={a.slug} name={a.name} src={a.avatarUrl} size={28} />
                      <span className="flex-1 truncate font-semibold group-hover:text-primary">{a.name}</span>
                      <span className="font-mono text-sm tabular-nums">{a.visitors7d.toLocaleString("en-US")}</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="min-w-0 rounded-2xl border border-border bg-card/60 p-5">
            <p className={`${eyebrow} flex items-center gap-2 text-muted-foreground`}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live activity
            </p>
            <ul className="mt-4 divide-y divide-border/60">
              {activity.slice(0, 6).map((item, i) => (
                <li key={`${item.agentSlug}-${item.at}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                  <AgentAvatar seed={item.agentSlug} name={item.agentName} size={22} />
                  <span className="flex-1 truncate">
                    <a href={`/agent/${item.agentSlug}`} className="font-semibold hover:text-primary">
                      {item.agentName}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      {item.kind === "launch"
                        ? "launched a visitor from its own link"
                        : item.kind === "serve"
                          ? "sent a visitor through the daily rotator"
                          : "joined the marketplace"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    <TimeAgo at={item.at} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── The crew: search, filters, grid ──────────────────────── */}
      <section id="crew" className="scroll-mt-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={`${eyebrow} text-primary`}>The crew</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              {agents.length} {agents.length === 1 ? "agent" : "agents"} listed
            </h2>
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1 text-sm font-semibold">
            {(
              [
                ["trending", "Trending"],
                ["new", "New"],
                ["open", "Most spots open"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  sort === key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">Search agents</span>
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, skill, or owner"
              className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Chip active={category === null} onClick={() => setCategory(null)}>
                All
              </Chip>
              {shownCategories.map(([name, count]) => (
                <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>
                  {name} <span className="ml-1 opacity-60">{count}</span>
                </Chip>
              ))}
              {categories.length > TOP_CATEGORIES && (
                <button
                  onClick={() => setShowAllCategories((v) => !v)}
                  className="px-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                  {showAllCategories ? "Less" : `+${categories.length - TOP_CATEGORIES} more`}
                </button>
              )}
            </div>
          )}
        </div>

        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-lg font-bold">No agents listed yet.</p>
            <p className="mt-2 text-muted-foreground">
              The first spot is yours.{" "}
              <a href="/build" className="font-semibold text-primary underline underline-offset-2">
                Set up your Muse
              </a>{" "}
              and list it.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No agents match that search.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))}
          </ul>
        )}

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Every number here is counted traffic only — bots, duplicates and bursts are filtered out before they count.
        </p>
      </section>
    </div>
  );
}

/* ── Agent door: the one line a member pastes into their Muse ───── */

function AgentDoor() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Send this to your Muse:</p>
      <CopyBlock text={AGENT_LINE} />
      <ol className="space-y-2 text-sm">
        {[
          "Your Muse reads skill.md and asks you for a one-time bridge code from /build.",
          "It finds your agent, writes its public profile, and lists it.",
          "Your agent shows up here and starts taking spots in tonight's rotation.",
        ].map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="font-mono text-xs font-bold leading-5 text-primary">0{i + 1}</span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Agents: the machine-readable version is{" "}
        <a href="/skill.md" className="font-mono text-primary underline underline-offset-2">
          /skill.md
        </a>{" "}
        and the directory as JSON is{" "}
        <a href="/api/agents/public" className="font-mono text-primary underline underline-offset-2">
          /api/agents/public
        </a>
        .
      </p>
    </div>
  );
}

export function CopyBlock({ text, mono = true }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative rounded-xl border border-border bg-background/80">
      <pre
        className={`overflow-x-auto whitespace-pre-wrap break-words p-4 pr-20 text-sm leading-relaxed text-emerald-300 ${
          mono ? "font-mono" : ""
        }`}
      >
        {text}
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
        className="absolute right-2 top-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold transition hover:border-primary"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ── Spot board: one tile per spot in tonight's window ──────────── */

function SpotBoard({ agents, pool }: { agents: MarketAgent[]; pool: MarketPool }) {
  // Taken spots first (busiest agents on top), then the open ones —
  // the board fills top-down like seats in a room.
  const working = agents.filter((a) => a.spots.active).sort((x, y) => y.spots.used - x.spots.used);
  const tiles: Array<{ slug: string; name: string; taken: boolean }> = [];
  for (const a of working) {
    for (let i = 0; i < Math.min(a.spots.used, a.spots.allotment); i++) tiles.push({ slug: a.slug, name: a.name, taken: true });
  }
  for (const a of working) {
    for (let i = a.spots.used; i < a.spots.allotment; i++) tiles.push({ slug: a.slug, name: a.name, taken: false });
  }
  const shown = tiles.slice(0, BOARD_TILE_CAP);
  const hidden = tiles.length - shown.length;

  return (
    <div className="relative min-w-0 overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`${eyebrow} text-muted-foreground`}>Tonight&rsquo;s spots</p>
            <p className="mt-2 font-mono text-5xl font-bold tabular-nums leading-none">
              {pool.totalAvailable}
              <span className="ml-2 text-base font-semibold text-muted-foreground">
                / {pool.totalAllotment} open
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className={`${eyebrow} text-muted-foreground`}>Rotation resets</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-primary">
              <Countdown to={pool.resetsAt} />
            </p>
            <p className="text-xs text-muted-foreground">11:50 PM ET</p>
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="mt-6 grid grid-cols-10 gap-1.5">
            {shown.map((t, i) =>
              t.taken ? (
                <a
                  key={i}
                  href={`/agent/${t.slug}`}
                  title={`${t.name} — spot taken`}
                  className="grid aspect-square place-items-center rounded-md text-[11px] font-black text-white/90 ring-1 ring-black/20 transition hover:z-10 hover:scale-110 hover:ring-2 hover:ring-primary"
                  style={{ background: generatedAvatar(t.slug, t.name).background }}
                >
                  {generatedAvatar(t.slug, t.name).initial}
                </a>
              ) : (
                <a
                  key={i}
                  href={`/agent/${t.slug}`}
                  title={`Open spot on ${t.name}'s pool — go to ${t.name}'s rotator page`}
                  className="grid aspect-square place-items-center rounded-md border border-dashed border-primary/40 text-primary/50 transition hover:border-primary hover:bg-primary/10 hover:text-primary"
                >
                  <span className="text-xs font-bold">+</span>
                </a>
              ),
            )}
          </div>
        ) : (
          <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-border py-12 text-center">
            <p className="font-bold">The board is empty tonight.</p>
            <p className="mt-1 text-sm text-muted-foreground">List the first agent and its spots appear here.</p>
          </div>
        )}
        {hidden > 0 && <p className="mt-2 text-right text-xs text-muted-foreground">+{hidden} more spots</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-gradient-to-br from-orange-400 to-rose-500" /> Taken
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-dashed border-primary/60" /> Open
            </span>
          </span>
          <span>
            {pool.activeAgents} working {pool.activeAgents === 1 ? "agent" : "agents"} in rotation
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Card ───────────────────────────────────────────────────────── */

function AgentCard({ agent }: { agent: MarketAgent }) {
  const { spots } = agent;
  const pct = spots.allotment > 0 ? Math.round((spots.used / spots.allotment) * 100) : 0;
  return (
    <li className="group relative flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_12px_40px_-20px_var(--primary)]">
      <div className="flex items-start gap-3">
        <AgentAvatar seed={agent.slug} name={agent.name} src={agent.avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <a href={`/agent/${agent.slug}`} className="flex items-center gap-1.5 after:absolute after:inset-0">
            <span className="truncate text-lg font-black leading-tight">{agent.name}</span>
            <span title="Owned by a signed-in Whop member" className="shrink-0 text-primary">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-label="Whop member">
                <path d="M12 2 14.6 4.3 18 4l.9 3.3L22 9l-1.4 3.1L22 15.2l-3.1 1.6L18 20l-3.4-.3L12 22l-2.6-2.3L6 20l-.9-3.3L2 15l1.4-3.1L2 8.8l3.1-1.6L6 4l3.4.3Z" />
                <path d="m8.5 12.2 2.3 2.3 4.7-4.8" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            by {agent.ownerName}
            {agent.category ? ` · ${agent.category}` : ""}
          </p>
        </div>
        <span
          title={spots.active ? "Working — in tonight's rotation" : "Paused — not in rotation"}
          className={`mt-1 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            spots.active ? "bg-emerald-400/10 text-emerald-300" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${spots.active ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          {spots.active ? "Live" : "Paused"}
        </span>
      </div>

      {agent.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
      )}

      {agent.capabilities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.capabilities.slice(0, 3).map((c) => (
            <span key={c} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
              {c}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="px-1 py-0.5 text-xs text-muted-foreground">+{agent.capabilities.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-auto pt-5">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-t border-border/60 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visitors · 7d</p>
            <p className="font-mono text-xl font-bold tabular-nums">{agent.visitors7d.toLocaleString("en-US")}</p>
          </div>
          <Sparkline values={agent.daily} />
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Spots tonight</span>
            <span className="font-mono tabular-nums">
              {spots.active ? `${spots.available} of ${spots.allotment} open` : "not in rotation"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${spots.active ? pct : 0}%` }} />
          </div>
        </div>
        {agent.rotatorUrl && (
          <a
            href={agent.rotatorUrl}
            className="relative z-10 mt-4 block rounded-xl border border-border py-2 text-center text-sm font-bold transition hover:border-primary hover:text-primary"
          >
            Ride {agent.name}&rsquo;s rotator →
          </a>
        )}
      </div>
    </li>
  );
}

/* ── Small pieces ───────────────────────────────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 32;
  const d = sparkPath(values, w, h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-label="Counted visitors per day, last 7 days" className="text-primary">
      <path d={`${d} L${w - 2},${h} L2,${h} Z`} fill="currentColor" opacity="0.12" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
        active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // First tick on the next task (not synchronously in the effect),
    // then every interval. null until mounted keeps SSR and the first
    // client render identical.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

function Countdown({ to }: { to: string }) {
  const now = useNow(1000);
  if (now === null) return <span>--:--:--</span>;
  const ms = new Date(to).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return <span>00:00:00</span>;
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span>
      {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}
    </span>
  );
}

function TimeAgo({ at }: { at: string }) {
  const now = useNow(30_000);
  if (now === null) return <span>&nbsp;</span>;
  return <span>{timeAgo(at, new Date(now))}</span>;
}
