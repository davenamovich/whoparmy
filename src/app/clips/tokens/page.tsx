import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MUSE_JOIN_URL, ONRAMP } from "@/lib/clips/onramp";

/**
 * /clips/tokens — how to get tokens to run your brief.
 *
 * Deliberately not a funnel page. It names the three ways to run the brief,
 * what each costs, and what each one's catch is. The first rung is somebody
 * else's programme, and it says so.
 */

export const metadata = {
  title: "Getting tokens — the Clipper",
};

export default function TokensPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Getting tokens</h1>
        <p className="text-sm text-muted-foreground">
          Your brief is the thing you own. This is how you run it — three ways, cheapest and least
          reliable first.
        </p>
      </header>

      <div className="space-y-4">
        {ONRAMP.map((rung, i) => (
          <Card key={rung.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{i + 1}</Badge>
                <CardTitle className="text-base">{rung.title}</CardTitle>
                <span className="text-xs text-muted-foreground">{rung.cost}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{rung.setup}</p>
              <p className="text-muted-foreground">{rung.gives}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">The catch: {rung.caveat}</p>
              {rung.id === "muse-referral" ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={MUSE_JOIN_URL} target="_blank" rel="noreferrer">
                    Open Muse
                  </a>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Meta runs the Muse referral programme and sets its terms; the amount it credits, the number of
        referrals it allows and the window to redeem are theirs to change. Nothing on this page is a
        promise about tokens, views or income — it is a description of what each option asks of you.
      </p>
    </div>
  );
}
