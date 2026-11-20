import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getGateState, getSessionOperator } from "@/lib/site-gate";
import { getStacks, API_KEY_UNLOCKS } from "@/lib/stacks";
import { AdminPanel } from "@/components/admin/admin-panel";
import { RotatorAdmin } from "@/components/bridge/rotator-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /admin — the Plunder & Riffle operator dashboard for Whoparmy.
 *
 * Designated operators only. Everyone else gets a 404: the dashboard's
 * existence is not advertised (when the site gate is on, the root
 * layout redirects non-operators to /gate before this page renders;
 * with the gate off, this notFound is the protection).
 *
 * Everything shown is a real DB read — bridge tokens/codes by scope,
 * users, gate state — no invented numbers.
 */
export default async function AdminPage() {
  const operator = await getSessionOperator();
  if (!operator) notFound();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

  const [gate, stacks, tokenTotals, weekActive, clipsActive, codes7d, totalUsers] = await Promise.all([
    getGateState(),
    getStacks(),
    db.bridgeToken.groupBy({
      by: ["scope"],
      _count: { _all: true },
      _sum: { spentCredits: true },
    }),
    db.bridgeToken.count({ where: { scope: "week", revokedAt: null, expiresAt: { gt: now } } }),
    db.bridgeToken.count({ where: { scope: "clips", revokedAt: null, expiresAt: { gt: now } } }),
    db.bridgeCode.groupBy({
      by: ["scope"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    db.user.count(),
  ]);

  const byScope = (rows: Array<{ scope: string; _count: { _all: number }; _sum?: { spentCredits: number | null } }>, scope: string) =>
    rows.find((r) => r.scope === scope);
  const weekTokens = byScope(tokenTotals, "week");
  const clipsTokens = byScope(tokenTotals, "clips");
  const weekCodes = byScope(codes7d, "week");
  const clipsCodes = byScope(codes7d, "clips");

  const stats: Array<{ label: string; value: string; sub: string }> = [
    {
      label: "Bridge tokens — week scope",
      value: String(weekTokens?._count._all ?? 0),
      sub: `${weekActive} active · ${weekTokens?._sum?.spentCredits ?? 0} credits spent (settled)`,
    },
    {
      label: "Bridge tokens — clips scope",
      value: String(clipsTokens?._count._all ?? 0),
      sub: `${clipsActive} active · ${clipsTokens?._sum?.spentCredits ?? 0} credits spent (settled)`,
    },
    {
      label: "Bridge codes minted (7 days)",
      value: String((weekCodes?._count._all ?? 0) + (clipsCodes?._count._all ?? 0)),
      sub: `${weekCodes?._count._all ?? 0} week · ${clipsCodes?._count._all ?? 0} clips`,
    },
    { label: "Total users", value: String(totalUsers), sub: "all accounts in the app DB" },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Plunder &amp; Riffle</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Whoparmy Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as operator {operator.whopUsername ?? operator.name}. Release stacks on the existing infra,
          flip the site gate, and mint the prompts that start it all.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>What getting an API key unlocks</CardTitle>
          <p className="text-sm text-muted-foreground">
            The BYOK explainer — the same copy members see when a stack asks them to bring their own P&amp;R key.
            Source of truth: API_KEY_UNLOCKS in src/lib/stacks.ts.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {API_KEY_UNLOCKS.map((u) => (
              <li key={u.title} className="text-sm">
                <strong>{u.title}.</strong> <span className="text-muted-foreground">{u.body}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AdminPanel gate={gate} stacks={stacks} />

      {/* Moved here from /bridge with the one-time-door overhaul
          (Dave, 2026-11-20). Renders nothing unless the operator-only
          rotator admin API answers. */}
      <div className="mt-10">
        <RotatorAdmin />
      </div>
    </main>
  );
}
