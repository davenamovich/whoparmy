"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/components/shell/site-footer";
import { stashRefFromUrl } from "@/lib/ref-stash";

const CONNECT = "/api/auth/whop?next=/beta";

type Task = { id: string; title: string; instructions: string; bountyCents: number; slots: number; campaignId: string; campaign?: { brandName: string; product: string } };
type Campaign = { id: string; company: string; product: string; brandName: string; fundedCents: number; defaultBountyCents: number; tasks: Task[] };
type Tester = {
  museMail: string; niche: string; boardHandle: string;
  businessName: string; businessWebsite: string | null;
  researchStatus: string; researchJobId: string | null;
  facebookPageRecorded: boolean; facebookPageUrl: string | null; pageName: string; postsPosted: number;
  fuelGranted: number; fuelUsed: number; bountyGranted: number; bountyUsed: number; bountyUnlocked: boolean;
  panelCostAckAt: string | null;
} | null;
type Claim = { id: string; status: string; task: Task & { campaign: { brandName: string } }; report: { id: string; reviewStatus: string } | null };
type Data = {
  campaigns: Campaign[]; board: Task[]; tester: Tester;
  skills: Array<{ skillKey: string; version: string }>;
  claims: Claim[];
  memes: Array<{ id: string; caption: string; imageUrl: string; status: string }>;
  posts: Array<{ id: string; caption: string; status: string }>;
  ledger: Array<{ id: string; amountCents: number; kind: string; memo: string }>;
  pendingReports: Array<{ id: string; built: string; purpose: string; claim: { task: Task } }>;
};

async function api(action: string, body: Record<string, unknown> = {}) {
  const r = await fetch("/api/beta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

const card = "rounded-[10px] border border-border bg-card p-5";
const h2 = "text-2xl font-bold";
const note = "mt-3 text-sm text-muted-foreground";

export default function BetaPage() {
  const [data, setData] = useState<Data | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const load = useCallback(async () => {
    const r = await fetch("/api/beta");
    if (r.status === 401) { setSignedOut(true); return; }
    if (!r.ok) throw new Error("Could not load your beta HQ.");
    setData(await r.json());
  }, []);

  useEffect(() => {
    stashRefFromUrl();
    load().catch((e) => setError(e.message));
  }, [load]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError("");
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(""); }
  };

  if (signedOut) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <header className="flex items-center justify-between border-b border-border pb-5">
            <a href="/" className="font-display text-xs font-extrabold tracking-[0.14em]">PLUNDER <span className="text-primary">&amp;</span> RIFFLE</a>
            <a href={CONNECT} className="font-semibold text-accent underline">Continue with Whop</a>
          </header>

          <section className="py-14 md:py-20">
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Plunder &amp; Riffle — Open Beta</p>
            <p className="mt-6 max-w-3xl text-xl leading-relaxed font-medium md:text-2xl">New to Muse? Muse is Meta&apos;s personal AI agent — your own assistant that lives in the apps you already use, learns your business, and does real work with you: research, pages, posts, and content.</p>
            <h1 className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[1.02] tracking-tight md:text-7xl">Your Muse, creating on <span className="text-primary">Day 0.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">We are the test: Plunder &amp; Riffle itself is the offer under test. You bring a business. Your agent starts building the day you arrive — not someday, Day 0.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><a href={CONNECT}>Continue with Whop</a></Button>
              <Button asChild size="lg" variant="outline"><a href={CONNECT}>Outside the Muse countries? Join via Agent37</a></Button>
            </div>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground">One sign-in for both doors. We never ask for your name or email here — Whop already knows you. No API key is collected on this page.</p>

            <div className="mt-14 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1.3fr_auto_1fr]" aria-label="How the beta works: your business in, real work out">
              <div className="rounded-[10px] border border-border bg-card p-5">
                <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">IN</p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>Your business</li>
                  <li>Your niche</li>
                  <li>Twenty minutes</li>
                </ul>
              </div>
              <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">→</div>
              <div className="rounded-[10px] border border-accent bg-card p-5 text-center">
                <p className="font-mono text-xs font-medium tracking-[0.14em] text-accent">ENGINE</p>
                <p className="mt-3 font-display text-lg font-bold">Your Muse</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">backed by the Plunder &amp; Riffle crew — Lead · Scout · Maker · Promoter · Analyst</p>
              </div>
              <div aria-hidden="true" className="hidden items-center text-xl text-primary md:flex">→</div>
              <div className="rounded-[10px] border border-border bg-card p-5">
                <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">OUT</p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>A Facebook Page, live</li>
                  <li>Your first posts</li>
                  <li>Real beta tasks, done and reported</li>
                </ul>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["1M", "token fuel seeded when you enroll"],
                ["10M", "bounty unlocked by a verified Day 0"],
                ["$0.20", "smallest task worth doing — your agent does the work"],
                ["$0", "revenue so far. The test stays honest."],
              ].map(([num, label]) => (
                <div key={label} className="rounded-[10px] border border-border bg-card p-5">
                  <p className="font-mono text-3xl font-semibold text-foreground">{num}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="pb-4">
            <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Two doors. One beta.</h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">Muse isn&apos;t everywhere yet. That doesn&apos;t shut you out — it just picks your door.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className={card}>
                <span className="inline-block rounded-full border border-primary px-3 py-1 font-mono text-[11px] font-medium tracking-[0.12em] text-primary">MUSE — 7 COUNTRIES</span>
                <h3 className="mt-4 text-2xl font-bold">Start with Muse</h3>
                <p className={note}>If Muse is live where you live, this is your door: your own Muse, set up on Day 0 through the bridge. Muse is live in:</p>
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Countries where Muse is available">
                  {["United States", "Canada", "United Kingdom", "Japan", "Singapore", "Mexico", "Australia"].map((c) => (
                    <li key={c} className="rounded-full border border-border px-3 py-1 text-sm">{c}</li>
                  ))}
                </ul>
                <p className="mt-5"><a href={CONNECT} className="font-semibold text-accent underline">Continue with Whop →</a></p>
              </div>
              <div className="rounded-[10px] border border-accent bg-card p-5">
                <span className="inline-block rounded-full border border-accent px-3 py-1 font-mono text-[11px] font-medium tracking-[0.12em] text-accent">AGENT37 — EVERYWHERE ELSE</span>
                <h3 className="mt-4 text-2xl font-bold">Start with Agent37</h3>
                <p className={note}>Outside the seven? You&apos;re not shut out. The beta runs on Agent37 too — same beta, same tasks, same bounty, on an agent platform that isn&apos;t limited to those countries.</p>
                <p className={note}>Sign in with Whop the same way — after sign-in, we route you to the lane that works where you live.</p>
                <p className="mt-5"><a href={CONNECT} className="font-semibold text-accent underline">Join via Agent37 →</a></p>
              </div>
            </div>

            <div className={`mt-4 ${card}`}>
              <h2 className={h2}>The deal, plainly</h2>
              <p className={note}>The bounty is seeded token fuel, not cash — the 10M-token bounty ledger unlocks on a verified Day 0, and revenue confirmed to date is $0. Set up Muse Mail first: your bridge creates the key, and no API key is ever collected here. Nothing goes out without your say-so.</p>
            </div>
          </section>
          <SiteFooter />
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-muted-foreground">Loading your beta HQ…</p>
          {error ? <p role="alert" className="mt-4 text-destructive">{error}</p> : null}
        </div>
      </main>
    );
  }

  const t = data.tester;
  const panelOpen = Boolean(t?.bountyUnlocked && t?.panelCostAckAt);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="flex justify-between">
          <a href="/" className="font-display text-xs font-extrabold tracking-[0.14em]">PLUNDER <span className="text-primary">&amp;</span> RIFFLE</a>
          <span className="text-sm text-muted-foreground">Signed in with Whop</span>
        </header>

        <section className="py-12">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Agentic Beta HQ</p>
          <h1 className="mt-4 text-5xl font-extrabold">Your beta journey</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">The test stays honest: $0 revenue so far. Bounties are seeded token fuel, and this build never sends or posts anything.</p>
          {error ? <p role="alert" className="mt-4 text-destructive">{error}</p> : null}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className={card}>
              <h2 className={h2}>Step 0 · Muse Mail first</h2>
              {t ? (
                <p className={note}>{t.museMail || "No address recorded yet."} · Lane: Muse first, Agent37 second. Enrollment seeds 1M fuel.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  <Input placeholder="Muse Mail address" value={f.mail ?? ""} onChange={set("mail")} />
                  <Input placeholder="Your test niche (optional)" value={f.niche ?? ""} onChange={set("niche")} />
                  <Input placeholder="Board handle (optional)" value={f.board ?? ""} onChange={set("board")} />
                  <Button disabled={busy === "enroll"} onClick={() => run("enroll", () => api("enroll", { museMail: f.mail ?? "", niche: f.niche ?? "", boardHandle: f.board ?? "" }))}>Enroll and seed 1M fuel</Button>
                </div>
              )}
            </section>

            <section className={card}>
              <h2 className={h2}>My journey</h2>
              {t ? (
                <>
                  <p className={note}>Fuel: {t.fuelUsed.toLocaleString()} / {t.fuelGranted.toLocaleString()} used · Bounty: {t.bountyUsed.toLocaleString()} / {t.bountyGranted.toLocaleString()} used</p>
                  <p className="mt-2 text-sm">Bounty unlock: {t.bountyUnlocked ? "Day 0 verified — 10M unlocked" : "Record a Facebook Page and at least one post"}</p>
                  <p className="mt-2 text-sm">Panel: {panelOpen ? "Unlocked" : t.bountyUnlocked ? "Acknowledge the panel cost to unlock" : "Locked until bounty unlock"} · Core Skills: {panelOpen ? "Unlocked" : "Locked until Panel"}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!t.bountyUnlocked ? null : !t.panelCostAckAt ? (
                      <Button size="sm" disabled={busy === "ack"} onClick={() => run("ack", () => api("ack-panel"))}>Unlock the Panel (Opus + Fable burn my tokens at premium rates)</Button>
                    ) : null}
                    {panelOpen ? ["replicator", "design-engine", "taste-finish-gate"].map((k) => (
                      <Button key={k} size="sm" variant="outline" disabled={busy === k} onClick={() => run(k, () => api("skill", { skillKey: k, version: "beta" }))}>
                        {data.skills.some((s) => s.skillKey === k) ? "✓ " : ""}Check: {k}
                      </Button>
                    )) : null}
                  </div>
                </>
              ) : <p className={note}>Enroll to start the journey.</p>}
            </section>
          </div>

          {t ? (
            <section className={`mt-4 ${card}`}>
              <h2 className={h2}>Deep research — same engine as /build</h2>
              <p className={note}>Your business is the test subject. Beta signup runs the exact deep research /build runs (research_brand via the bridge), and the results land on your brand profile — the same research your blueprint and starter prompt are composed from.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Input placeholder="Business name" value={f.biz ?? t.businessName ?? ""} onChange={set("biz")} />
                <Input placeholder="Business website" value={f.site ?? t.businessWebsite ?? ""} onChange={set("site")} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button disabled={busy === "research"} onClick={() => run("research", () => api("research", { businessName: f.biz ?? t.businessName, businessWebsite: f.site ?? t.businessWebsite }))}>Run deep research</Button>
                <Button variant="outline" disabled={busy === "refresh" || !t.researchJobId} onClick={() => run("refresh", () => api("research-refresh"))}>Check research status</Button>
                <span className="text-sm text-muted-foreground">Status: {t.researchStatus}</span>
              </div>
              <div className="mt-4">
                <Button variant="outline" disabled={busy === "prompt"} onClick={() => run("prompt", async () => {
                  const r = await fetch("/api/blueprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup" }) });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok) throw new Error(j.error || "Could not craft the prompt");
                  setPrompt(j.prompt || "");
                })}>Craft my starter prompt (from my research)</Button>
                {prompt ? <textarea readOnly value={prompt} className="mt-3 h-48 w-full rounded-md border border-border bg-background p-3 text-xs" /> : null}
              </div>
            </section>
          ) : null}

          {t ? (
            <section className={`mt-4 ${card}`}>
              <h2 className={h2}>Day 0 · Your niche Facebook Page</h2>
              <p className={note}>The universal deliverable: a Facebook Page for your niche, with first posts live. Recording it here (with at least one post) unlocks the 10M bounty.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Input placeholder="Page name" value={f.pageName ?? t.pageName ?? ""} onChange={set("pageName")} />
                <Input placeholder="Facebook Page URL" value={f.pageUrl ?? t.facebookPageUrl ?? ""} onChange={set("pageUrl")} />
                <Input placeholder="Posts posted (count)" type="number" value={f.posts ?? String(t.postsPosted ?? 0)} onChange={set("posts")} />
              </div>
              <Button className="mt-4" disabled={busy === "day0"} onClick={() => run("day0", () => api("day0", { facebookPageRecorded: Boolean(f.pageUrl ?? t.facebookPageUrl), facebookPageUrl: f.pageUrl ?? t.facebookPageUrl ?? "", pageName: f.pageName ?? t.pageName, postsPosted: Number(f.posts ?? t.postsPosted ?? 0) }))}>Record Day 0</Button>
            </section>
          ) : null}

          <section className={`mt-4 ${card}`}>
            <h2 className={h2}>Campaigns &amp; task board</h2>
            <p className={note}>Micro-tasks pay from the campaign pool on an approved report. Bounty floor $0.20. Funding a pool is a record here — no payment is processed.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Input placeholder="Company" value={f.company ?? ""} onChange={set("company")} />
              <Input placeholder="Product / offer" value={f.product ?? ""} onChange={set("product")} />
              <Input placeholder="Pool (cents)" type="number" value={f.pool ?? ""} onChange={set("pool")} />
              <Button disabled={busy === "campaign"} onClick={() => run("campaign", () => api("campaign", { company: f.company ?? "", product: f.product ?? "", brandName: f.company ?? "", fundedCents: Number(f.pool ?? 0), defaultBountyCents: 20 }))}>Create campaign</Button>
            </div>
            {data.campaigns.map((cmp) => (
              <article key={cmp.id} className="mt-4 border-t border-border/60 pt-4">
                <h3 className="font-bold">{cmp.brandName} · {cmp.product}</h3>
                <p className="text-sm text-muted-foreground">Pool ${(cmp.fundedCents / 100).toFixed(2)} · {cmp.tasks.length} tasks</p>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <Input placeholder="Task title" value={f[`tt-${cmp.id}`] ?? ""} onChange={set(`tt-${cmp.id}`)} />
                  <Input placeholder="Bounty (cents, ≥20)" type="number" value={f[`tb-${cmp.id}`] ?? ""} onChange={set(`tb-${cmp.id}`)} />
                  <Input placeholder="Slots" type="number" value={f[`ts-${cmp.id}`] ?? "1"} onChange={set(`ts-${cmp.id}`)} />
                  <Button size="sm" variant="outline" disabled={busy === cmp.id} onClick={() => run(cmp.id, () => api("task", { campaignId: cmp.id, title: f[`tt-${cmp.id}`] ?? "", bountyCents: Number(f[`tb-${cmp.id}`] ?? 20), slots: Number(f[`ts-${cmp.id}`] ?? 1) }))}>Add task</Button>
                </div>
              </article>
            ))}
            <h3 className="mt-6 font-bold">Open tasks</h3>
            {data.board.length === 0 ? <p className={note}>No open tasks yet.</p> : data.board.map((task) => (
              <div key={task.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <p className="font-semibold">{task.title} <span className="text-muted-foreground">· {task.campaign?.brandName} · ${(task.bountyCents / 100).toFixed(2)} · {task.slots} slot(s)</span></p>
                  {task.instructions ? <p className="text-sm text-muted-foreground">{task.instructions}</p> : null}
                </div>
                <Button size="sm" disabled={!t || busy === task.id} onClick={() => run(task.id, () => api("claim", { taskId: task.id }))}>Claim</Button>
              </div>
            ))}
          </section>

          {t ? (
            <section className={`mt-4 ${card}`}>
              <h2 className={h2}>My claims &amp; reports</h2>
              {data.claims.length === 0 ? <p className={note}>Claim a task, do the work with your agent, then file the five-line report.</p> : data.claims.map((cl) => (
                <div key={cl.id} className="mt-4 border-t border-border/60 pt-4">
                  <p className="font-semibold">{cl.task.title} <span className="text-muted-foreground">· {cl.status}{cl.report ? ` · report ${cl.report.reviewStatus}` : ""}</span></p>
                  {!cl.report ? (
                    <div className="mt-3 grid gap-2">
                      <Input placeholder="1 · What I built + link" value={f[`rb-${cl.id}`] ?? ""} onChange={set(`rb-${cl.id}`)} />
                      <Input placeholder="2 · What it is for (one sentence)" value={f[`rp-${cl.id}`] ?? ""} onChange={set(`rp-${cl.id}`)} />
                      <Input placeholder="3 · What I need from you" value={f[`rn-${cl.id}`] ?? ""} onChange={set(`rn-${cl.id}`)} />
                      <Input placeholder="4 · Tokens spent" value={f[`rt-${cl.id}`] ?? ""} onChange={set(`rt-${cl.id}`)} />
                      <Input placeholder="5 · What this version cannot do" value={f[`rc-${cl.id}`] ?? ""} onChange={set(`rc-${cl.id}`)} />
                      <Button size="sm" disabled={busy === cl.id} onClick={() => run(cl.id, () => api("report", { claimId: cl.id, built: f[`rb-${cl.id}`] ?? "", purpose: f[`rp-${cl.id}`] ?? "", needsFromOwner: f[`rn-${cl.id}`] ?? "", tokensSpent: f[`rt-${cl.id}`] ?? "", cannotDo: f[`rc-${cl.id}`] ?? "" }))}>Submit report</Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {data.pendingReports.length ? (
                <>
                  <h3 className="mt-6 font-bold">Reports awaiting your review (your campaigns)</h3>
                  {data.pendingReports.map((rep) => (
                    <div key={rep.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <p className="text-sm">{rep.claim.task.title} — {rep.built} <span className="text-muted-foreground">· pays ${(rep.claim.task.bountyCents / 100).toFixed(2)} from the pool</span></p>
                      <Button size="sm" disabled={busy === rep.id} onClick={() => run(rep.id, () => api("approve-report", { reportId: rep.id }))}>Approve &amp; pay</Button>
                    </div>
                  ))}
                </>
              ) : null}
              {data.ledger.length ? (
                <p className={note}>Ledger: {data.ledger.map((l) => `${l.kind} $${(l.amountCents / 100).toFixed(2)}`).join(" · ")}</p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className={card}>
              <h2 className={h2}>Meme wall</h2>
              <p className={note}>Submit for review. Nothing posts anywhere from this build.</p>
              {t ? (
                <div className="mt-4 space-y-3">
                  <Input placeholder="Image URL" value={f.memeUrl ?? ""} onChange={set("memeUrl")} />
                  <Input placeholder="Caption" value={f.memeCap ?? ""} onChange={set("memeCap")} />
                  <Button size="sm" disabled={busy === "meme"} onClick={() => run("meme", () => api("meme", { imageUrl: f.memeUrl ?? "", caption: f.memeCap ?? "" }))}>Submit meme</Button>
                  {data.memes.map((m) => <p key={m.id} className="text-sm text-muted-foreground">{m.caption || m.imageUrl} · {m.status}</p>)}
                </div>
              ) : null}
            </section>
            <section className={card}>
              <h2 className={h2}>Post queue</h2>
              <p className={note}>Approvals only change record status; they never publish.</p>
              {t ? (
                <div className="mt-4 space-y-3">
                  <Input placeholder="Post caption" value={f.postCap ?? ""} onChange={set("postCap")} />
                  <Input placeholder="Link (optional)" value={f.postLink ?? ""} onChange={set("postLink")} />
                  <Button size="sm" disabled={busy === "post"} onClick={() => run("post", () => api("post", { caption: f.postCap ?? "", link: f.postLink ?? "" }))}>Queue post</Button>
                  {data.posts.map((p) => <p key={p.id} className="text-sm text-muted-foreground">{p.caption} · {p.status}</p>)}
                </div>
              ) : null}
            </section>
          </div>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
