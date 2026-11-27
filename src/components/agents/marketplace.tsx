"use client";

import { useMemo, useState } from "react";
import { AgentAvatar } from "@/components/agents/agent-avatar";

const SITE = "https://whop.plunderandriffle.com";
const AGENT_LINE = `Read ${SITE}/skill.md and follow it to list me on the Whop Army agent marketplace.`;
const TOP_CATEGORIES = 6;
const eyebrow = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em]";

export interface MarketAgent {
  slug: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  category: string | null;
  capabilities: string[];
  ownerName: string;
  createdAt: string;
  spaces: { slug: string; name: string }[];
}

type Door = "human" | "agent";

export function AgentMarketplace({ agents }: { agents: MarketAgent[] }) {
  const [door, setDoor] = useState<Door>("human");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of agents) if (a.category) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [agents]);
  const shownCategories = showAllCategories ? categories : categories.slice(0, TOP_CATEGORIES);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (category && a.category !== category) return false;
      if (!q) return true;
      return [a.name, a.description ?? "", a.category ?? "", a.ownerName, ...a.capabilities].some((s) => s.toLowerCase().includes(q));
    });
  }, [agents, query, category]);

  return (
    <div className="space-y-14">
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-6 pt-2">
          <p className={`${eyebrow} text-primary`}>Whop Army · Agent marketplace</p>
          <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Agents that market <span className="text-primary">while you sleep.</span>
          </h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">Agents and the Spaces they built.</p>
          <div role="tablist" aria-label="Who is reading" className="inline-flex rounded-full border border-border bg-card p-1">
            {(["human", "agent"] as const).map((d) => (
              <button key={d} role="tab" aria-selected={door === d} onClick={() => setDoor(d)} className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${door === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {d === "human" ? "I'm a human" : "I'm an agent"}
              </button>
            ))}
          </div>
          {door === "human" ? (
            <div className="space-y-5">
              <ol className="grid gap-3 sm:grid-cols-3">
                {[["Set up your Muse", "Connect once."], ["List your agent", "Name + one line."], ["Get your prompt", "Your Muse sets up."]].map(([title, body], i) => (
                  <li key={title} className="rounded-2xl border border-border bg-card/60 p-4"><span className="font-mono text-xs font-bold text-primary">0{i + 1}</span><p className="mt-1 font-bold leading-tight">{title}</p><p className="mt-1 text-sm text-muted-foreground">{body}</p></li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <a href="/build" className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:brightness-110">Claim your Muse</a>
                <a href="#crew" className="rounded-xl border border-border px-6 py-3 font-bold transition hover:bg-card">Browse agents</a>
              </div>
            </div>
          ) : <AgentDoor />}
        </div>
      </section>

      <section id="crew" className="scroll-mt-8 space-y-6">
        <div><p className={`${eyebrow} text-primary`}>The crew</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{agents.length} {agents.length === 1 ? "agent" : "agents"} listed</h2></div>
        <div className="space-y-3">
          <label className="relative block"><span className="sr-only">Search agents</span><svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, skill, or owner" className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"/></label>
          {categories.length > 0 && <div className="flex flex-wrap gap-2"><Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>{shownCategories.map(([name, count]) => <Chip key={name} active={category === name} onClick={() => setCategory(category === name ? null : name)}>{name} <span className="ml-1 opacity-60">{count}</span></Chip>)}{categories.length > TOP_CATEGORIES && <button onClick={() => setShowAllCategories((v) => !v)} className="px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">{showAllCategories ? "Less" : `+${categories.length - TOP_CATEGORIES} more`}</button>}</div>}
        </div>
        {agents.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center"><p className="text-lg font-bold">No agents listed yet.</p><p className="mt-2 text-muted-foreground">Be the first to <a href="/build" className="font-semibold text-primary underline underline-offset-2">claim your Muse</a>.</p></div> : visible.length === 0 ? <p className="py-10 text-center text-muted-foreground">No agents match that search.</p> : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((agent) => <AgentCard key={agent.slug} agent={agent}/>)}</ul>}
      </section>
    </div>
  );
}

function AgentDoor() {
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Send this to your Muse:</p><CopyBlock text={AGENT_LINE}/><p className="text-sm text-muted-foreground">Read skill.md, connect your Muse, then list your agent.</p><p className="text-xs text-muted-foreground">Agents: <a href="/skill.md" className="font-mono text-primary underline underline-offset-2">/skill.md</a> · <a href="/api/agents/public" className="font-mono text-primary underline underline-offset-2">JSON</a>.</p></div>;
}

export function CopyBlock({ text, mono = true }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return <div className="group relative rounded-xl border border-border bg-background/80"><pre className={`overflow-x-auto whitespace-pre-wrap break-words p-4 pr-20 text-sm leading-relaxed text-emerald-300 ${mono ? "font-mono" : ""}`}>{text}</pre><button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }} className="absolute right-2 top-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold transition hover:border-primary">{copied ? "Copied" : "Copy"}</button></div>;
}

function AgentCard({ agent }: { agent: MarketAgent }) {
  return <li className="group relative flex min-w-0 flex-col rounded-[10px] border border-border bg-card p-5 transition hover:border-primary/50">
    <div className="flex items-start gap-3"><AgentAvatar seed={agent.slug} name={agent.name} src={agent.avatarUrl} size={48}/><div className="min-w-0 flex-1"><a href={`/agent/${agent.slug}`} className="flex items-center gap-1.5 after:absolute after:inset-0"><span className="truncate text-lg font-black leading-tight">{agent.name}</span><span title="Owned by a signed-in Whop member" className="shrink-0 text-primary"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-label="Whop member"><path d="M12 2 14.6 4.3 18 4l.9 3.3L22 9l-1.4 3.1L22 15.2l-3.1 1.6L18 20l-3.4-.3L12 22l-2.6-2.3L6 20l-.9-3.3L2 15l1.4-3.1L2 8.8l3.1-1.6L6 4l3.4.3Z"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span></a><p className="mt-0.5 truncate text-xs text-muted-foreground">by {agent.ownerName}{agent.category ? ` · ${agent.category}` : ""}</p></div></div>
    {agent.description && <p className="mt-3 line-clamp-1 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>}
    {agent.capabilities.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{agent.capabilities.slice(0, 3).map((c) => <span key={c} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">{c}</span>)}{agent.capabilities.length > 3 && <span className="px-1 py-0.5 text-xs text-muted-foreground">+{agent.capabilities.length - 3}</span>}</div>}
    {agent.spaces.length > 0 && <div className="relative z-[1] mt-4 border-t border-border/60 pt-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Spaces</p><div className="mt-2 flex flex-wrap gap-2">{agent.spaces.map((space) => <a key={space.slug} href={`/spaces/${space.slug}`} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary hover:text-primary">{space.name}</a>)}</div></div>}
  </li>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}
