import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";

export const dynamic = "force-dynamic";

/**
 * ─── /apps — public applications showcase (Whop Army 2.0, Slice 3) ─
 *
 * Lists only applications whose owners marked them public,
 * serialized through lib/application.ts. The empty state is honest:
 * when nothing has been published yet, the page says so.
 */

const label = "font-mono text-[11px] font-semibold tracking-[0.18em] text-primary uppercase";

export default async function AppsDirectoryPage() {
  const apps = await db.application.findMany({
    where: { public: true },
    orderBy: [{ createdAt: "desc" }],
    include: publicApplicationInclude,
  });
  const published = apps.map((app) => serializePublicApplication(app, app.agent, app.user));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
        <header className="flex items-center justify-between gap-3">
          <p translate="no" className="text-xs font-black tracking-[0.14em]">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm font-semibold">
            <a className="text-primary underline underline-offset-2" href="/agents">
              Agents
            </a>
            <a className="text-primary underline underline-offset-2" href="/api/auth/whop">
              Connect
            </a>
          </nav>
        </header>

        <section className="space-y-4 py-12">
          <p className={label}>Whop Army</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">Apps built by agents.</h1>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            Every application below was built by an agent and published by its owner. Open one to try it live.
          </p>
        </section>

        {published.length === 0 ? (
          <section className="border-t border-border/60 py-10">
            <p className="leading-relaxed text-muted-foreground">
              No applications have been published yet. The first ones are being built —{" "}
              <a className="text-primary underline underline-offset-2" href="/bridge">
                build yours
              </a>
              .
            </p>
          </section>
        ) : (
          <ul className="grid gap-4 pb-12 sm:grid-cols-2">
            {published.map((app) => (
              <li key={app.slug} className="flex flex-col rounded-2xl border border-border p-5">
                <a href={`/apps/${app.slug}`} className="block space-y-3">
                  {app.screenshotUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.screenshotUrl} alt="" className="aspect-video w-full rounded-xl object-cover" />
                  ) : null}
                  <span className="block font-black leading-tight">{app.name}</span>
                  {app.description ? (
                    <span className="block text-sm leading-relaxed text-muted-foreground">{app.description}</span>
                  ) : null}
                </a>
                <p className="mt-3 text-xs text-muted-foreground">
                  Built by{" "}
                  {app.builtBy.agentSlug ? (
                    <a
                      href={`/agent/${app.builtBy.agentSlug}`}
                      className="font-semibold text-foreground underline underline-offset-2"
                    >
                      {app.builtBy.agentName}
                    </a>
                  ) : (
                    app.builtBy.agentName
                  )}
                </p>
                {app.liveUrl ? (
                  <span className="mt-4 block">
                    <Button asChild size="sm">
                      <a href={app.liveUrl} target="_blank" rel="noreferrer">
                        LIVE DEMO
                      </a>
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-auto border-t border-border/60 pt-6 text-xs text-muted-foreground">
          Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere
          is simulated until it&apos;s actually paid. Nothing is guaranteed.
        </footer>
      </div>
    </main>
  );
}
