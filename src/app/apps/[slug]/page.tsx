import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";

export const dynamic = "force-dynamic";

/**
 * ─── /apps/{slug} — public application page (Whop Army 2.0, Slice 3)
 *
 * Renders ONLY an application its owner marked public, and only
 * through serializePublicApplication (lib/application.ts) — no
 * member fields, no stats (none exist, and none are invented).
 * Everything else 404s.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await db.application.findFirst({
    where: { slug, public: true },
    include: publicApplicationInclude,
  });
  if (!row) notFound();

  const app = serializePublicApplication(row, row.agent, row.user);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            <a className="text-primary underline underline-offset-2" href="/apps">
              All apps
            </a>
            <a className="text-primary underline underline-offset-2" href="/api/auth/whop">
              Connect
            </a>
          </nav>
        </header>

        <section className="space-y-5 py-12">
          <p className={label}>Whop Army application</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">{app.name}</h1>
          {app.description ? <p className="leading-relaxed text-muted-foreground">{app.description}</p> : null}
          {app.screenshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.screenshotUrl} alt="" className="aspect-video w-full rounded-2xl border border-border object-cover" />
          ) : null}
          <div className="flex flex-wrap gap-3">
            {app.liveUrl ? (
              <Button asChild>
                <a href={app.liveUrl} target="_blank" rel="noreferrer">
                  LIVE DEMO
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href="/build">BUILD YOUR OWN</a>
            </Button>
          </div>
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <h2 className={label}>Built by</h2>
          {app.builtBy.agentSlug ? (
            <a href={`/agent/${app.builtBy.agentSlug}`} className="block rounded-2xl border border-border p-5">
              <span className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
                  {app.builtBy.agentName.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <span className="block font-black leading-tight">{app.builtBy.agentName}</span>
                  <span className="block text-xs text-muted-foreground">by {app.owner.displayName} · view agent profile</span>
                </span>
              </span>
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              {app.builtBy.agentName} · by {app.owner.displayName}
            </p>
          )}
        </section>

        <section className="space-y-3 border-t border-border/60 py-10">
          <h2 className={label}>Links</h2>
          <ul className="space-y-2 text-sm">
            {app.liveUrl ? (
              <li>
                Live demo —{" "}
                <a className="text-primary underline underline-offset-2" href={app.liveUrl} target="_blank" rel="noreferrer">
                  {app.liveUrl}
                </a>
              </li>
            ) : null}
            {app.repoUrl ? (
              <li>
                Source repository —{" "}
                <a className="text-primary underline underline-offset-2" href={app.repoUrl} target="_blank" rel="noreferrer">
                  {app.repoUrl}
                </a>
              </li>
            ) : null}
            <li>Owner — {app.owner.displayName}</li>
          </ul>
        </section>

        {app.buildPrompt ? (
          <section className="space-y-3 border-t border-border/60 py-10">
            <h2 className={label}>Build prompt</h2>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {app.buildPrompt}
            </pre>
          </section>
        ) : null}

        <footer className="mt-auto border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
