import { db } from "@/lib/db";
import { findLiveBridgeCode } from "@/lib/muse-bridge";
import { museWeekCommand, type MuseWeekOfferId } from "@/lib/muse-week-command";

/**
 * ─── THE AGENT LINK (Dave, 2026-11-18) ──────────────────────────────
 * "Make it agent friendly — one click sign with Muse, or give any
 * agent the link." A member hands this URL to their Muse (or any
 * AI agent): the page is server-rendered plain text, so an agent
 * that fetches it can read the whole connection command and act on
 * it — no login, no clicking through the app.
 *
 * The code in the URL is the same one-time bridge code as always:
 * hash-stored, 15-minute TTL, single use at EXCHANGE. Viewing this
 * page never consumes it (findLiveBridgeCode is read-only), and
 * exchange re-checks the member's eligibility server-side.
 */

export const dynamic = "force-dynamic";

function offerFor(budgetCredits: number): MuseWeekOfferId {
  if (budgetCredits <= 115) return "taste";
  if (budgetCredits >= 855) return "opener";
  return "week";
}

export default async function ConnectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const live = await findLiveBridgeCode(code);

  if (!live) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 space-y-4">
        <h1 className="text-2xl font-black">This agent link has expired or already been used</h1>
        <p className="text-muted-foreground leading-relaxed">
          Agent links work once and live for 15 minutes. If you&apos;re the member, mint a fresh one —
          ask Ralph in the app for &ldquo;Talk to my Muse&rdquo;, or open{" "}
          <a className="text-primary underline underline-offset-2" href="/muse-week">
            whop.plunderandriffle.com/muse-week
          </a>
          . If you&apos;re an agent holding this link, ask your member for a fresh one and continue from there.
        </p>
      </main>
    );
  }

  if (live.scope === "clips") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 space-y-4">
        <h1 className="text-2xl font-black">A Clip Factory connection code</h1>
        <p className="text-muted-foreground leading-relaxed">
          This code connects an agent to the member&apos;s Clip Factory, not the content bridge. The code
          itself is the credential hand-off — exchange it exactly where the Clip Factory flow asks for it:
        </p>
        <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-bold tracking-widest">{code.toUpperCase()}</pre>
        <p className="text-sm text-muted-foreground">One-time, expires 15 minutes after it was minted.</p>
      </main>
    );
  }

  const brand = await db.brandProfile.findFirst({
    where: { userId: live.user.id, website: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { name: true, website: true },
  });
  const businessUrl = brand?.website || "https://your-business-website.com";
  const businessName = brand?.name || live.user.name || "the member's business";
  const command = museWeekCommand(code.toUpperCase(), businessUrl, live.budgetCredits, offerFor(live.budgetCredits));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.25em] text-primary uppercase">Plunder &amp; Riffle — agent connection</p>
        <h1 className="text-3xl font-black leading-tight">Connect to {businessName}</h1>
        <p className="text-muted-foreground leading-relaxed">
          A member of Plunder &amp; Riffle is handing you — their AI agent — a one-time connection to
          their account. Everything you need is in the block below: read it, follow it, and the research
          is free. This page being open does not use the code; the code is spent only when you exchange
          it, exactly as the instructions say. It expires 15 minutes after it was minted.
        </p>
      </header>
      <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-relaxed">{command}</pre>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Human reading over the agent&apos;s shoulder? This is the same command the member could paste
        by hand — the link just saves the copy-paste. The connection is content-only: the agent can
        research and make content packs on the member&apos;s credits after their &ldquo;go&rdquo;, and
        publishing stays behind the member&apos;s own approve tap in the app.
      </p>
    </main>
  );
}
