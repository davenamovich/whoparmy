import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionOperator } from "@/lib/site-gate";
import { aggregateAgentActivity, summarizePageViews } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  if (!(await getSessionOperator())) notFound();
  const dbWithViews = db as typeof db & { pageView: { findMany(args: unknown): Promise<Array<{ path: string; referrerHost: string | null; createdAt: Date }>> } };
  const now = new Date();
  const windows = [
    { label: "Today", since: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
    { label: "7 days", since: new Date(now.getTime() - 7 * 86400_000) },
    { label: "30 days", since: new Date(now.getTime() - 30 * 86400_000) },
  ];
  const reports = await Promise.all(windows.map(async ({ label, since }) => {
    const [views, signups, builds, codes, connections, generations, grants, hops, clicks, agents] = await Promise.all([
      dbWithViews.pageView.findMany({ where: { createdAt: { gte: since } }, select: { path: true, referrerHost: true, createdAt: true } }),
      db.user.findMany({ where: { createdAt: { gte: since } }, select: { id: true, createdAt: true } }),
      db.hiredAgent.count({ where: { createdAt: { gte: since } } }),
      db.bridgeCode.count({ where: { createdAt: { gte: since } } }),
      db.bridgeConnection.count({ where: { status: "ACTIVE", createdAt: { gte: since } } }),
      db.usageRecord.findMany({ where: { kind: { not: "FAILED" }, createdAt: { gte: since } }, select: { userId: true } }),
      db.creditGrant.aggregate({ where: { source: "pack", createdAt: { gte: since } }, _count: { _all: true }, _sum: { amount: true } }),
      db.rotatorHop.findMany({ where: { ts: { gte: since }, counted: true }, select: { agentId: true } }),
      db.linkClick.findMany({ where: { createdAt: { gte: since } }, select: { ownerUserId: true } }),
      db.hiredAgent.findMany({ select: { id: true, userId: true, name: true } }),
    ]);
    const uniqueFirstGenerators = new Set(generations.map((row) => row.userId)).size;
    return {
      label,
      visitors: summarizePageViews(views),
      funnel: [
        ["Signups", signups.length], ["Builds completed (agents created)", builds], ["Bridge codes minted", codes],
        ["Bridge connections live", connections], ["First generations (members with usage)", uniqueFirstGenerators],
        ["Credit pack grants", grants._count._all], ["Credits granted", grants._sum.amount ?? 0],
        ["Estimated pack revenue", `$${((grants._sum.amount ?? 0) * 0.01).toFixed(2)}`],
        ["Marketplace listings active now", await db.user.count({ where: { listingActive: true } })],
      ] as Array<[string, number | string]>,
      activity: aggregateAgentActivity(hops, agents),
      clicks: clicks.length,
    };
  }));

  return <main className="mx-auto w-full max-w-6xl px-6 py-10">
    <h1 className="text-3xl font-bold">Analytics</h1>
    <p className="mt-2 text-sm text-muted-foreground">First-party page views and event funnel. Every window is read from the database at request time.</p>
    <div className="mt-8 space-y-8">
      {reports.map((report) => <section key={report.label}>
        <h2 className="mb-3 text-xl font-semibold">{report.label}</h2>
        <Card><CardHeader><CardTitle>Visitors</CardTitle></CardHeader><CardContent>
          <p>{report.visitors.views} page views · {report.visitors.uniquePaths} unique paths</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div><h3 className="font-medium">Top paths</h3><ol>{report.visitors.topPaths.map((row) => <li key={row.name}>{row.name} · {row.count}</li>)}</ol></div>
            <div><h3 className="font-medium">Top referrer hosts</h3><ol>{report.visitors.topReferrers.map((row) => <li key={row.name}>{row.name} · {row.count}</li>)}</ol></div>
          </div>
        </CardContent></Card>
        <Card className="mt-3"><CardHeader><CardTitle>Member funnel</CardTitle></CardHeader><CardContent><ol className="grid gap-2 sm:grid-cols-2">{report.funnel.map(([label, value]) => <li key={label}>{label}: <strong>{value}</strong></li>)}</ol></CardContent></Card>
        <Card className="mt-3"><CardHeader><CardTitle>Rotator activity</CardTitle></CardHeader><CardContent><p>{report.clicks} link clicks total · LinkClick has no agent attribution field.</p>{report.activity.length ? <ul className="mt-2">{report.activity.map((row) => <li key={row.agentId}>{row.name}: {row.hops} hops</li>)}</ul> : <p>No agent hops in this window.</p>}</CardContent></Card>
      </section>)}
    </div>
  </main>;
}
