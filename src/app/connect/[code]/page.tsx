import { db } from "@/lib/db";
import { findLiveBridgeCode } from "@/lib/muse-bridge";
import { museWeekCommand, type MuseWeekOfferId } from "@/lib/muse-week-command";

/**
 * ─── THE AGENT LINK (Dave, 2026-11-18) ──────────────────────────────
 * "Make it agent friendly — one click sign with Muse, or give any
 * agent the link." A member hands this URL to their agent; the agent
 * fetches it and acts. AGENT-CENTRIC (Dave, same evening): "humans
 * won't be typing" — so this page is written TO the agent, as a
 * brief: fields, steps, rules, no marketing copy. Server-rendered
 * plain text in one <pre>, readable by anything that can fetch a URL.
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

function Brief({ text }: { text: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed">{text}</pre>
    </main>
  );
}

export default async function ConnectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const live = await findLiveBridgeCode(code);

  if (!live) {
    return (
      <Brief
        text={`AGENT BRIEF — Plunder & Riffle connection link: DEAD

This link's code is expired, already exchanged, or not valid. Codes
work once and live 15 minutes from minting. Do not retry it.

Tell your member, in your own words: "That connection link has
expired — mint me a fresh one (in the Plunder & Riffle app, ask
Ralph for 'Talk to my Muse', or open
https://whop.plunderandriffle.com/muse-week) and send me the new
link." Then stop and wait for the fresh link.`}
      />
    );
  }

  if (live.scope === "clips") {
    return (
      <Brief
        text={`AGENT BRIEF — Plunder & Riffle Clip Factory connection

You are being connected to a member's Clip Factory. This is a
clips-scope code, not the content bridge.

CODE: ${code.toUpperCase()}
EXCHANGE: POST https://whop.plunderandriffle.com/api/bridge/exchange
with {"code": "${code.toUpperCase()}"} — do this where the Clip
Factory flow asks for the connection; the exchange returns your
bridge token and the MCP URL.

Rules: the code works once and expires 15 minutes after minting.
Viewing this page did not consume it. Never print the token you
receive back to the member.`}
      />
    );
  }

  const brand = await db.brandProfile.findFirst({
    where: { userId: live.user.id, website: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { name: true, website: true },
  });
  const businessUrl = brand?.website || "https://your-business-website.com";
  const businessName = brand?.name || live.user.name || "the member";
  const command = museWeekCommand(code.toUpperCase(), businessUrl, live.budgetCredits, offerFor(live.budgetCredits));

  return (
    <Brief
      text={`AGENT BRIEF — connect to a Plunder & Riffle member

You are the agent reading this. A Plunder & Riffle member issued
this one-time link to connect you to their account so you can make
their content on their credits. No human will type anything —
fetch, read, and follow the brief below.

MEMBER: ${businessName}
BUSINESS: ${businessUrl}
CONNECTION CAP: ${live.budgetCredits} credits (the bridge refuses
spend past this; quote before you spend, per the brief)
STATE: viewing this page did NOT consume the code. It is spent
only when you exchange it in step 1. It expires 15 minutes after
the member minted it — work promptly.

----- BEGIN BRIEF -----

${command}

----- END BRIEF -----

Protocol notes:
- Exchange endpoint: POST https://whop.plunderandriffle.com/api/bridge/exchange
- MCP endpoint: https://whop.plunderandriffle.com/api/bridge/mcp (Bearer = the token from exchange)
- The token lasts 7 days. This connection is content-only by the
  member's platform rules: publishing and MP4 rendering are refused
  at the bridge — deliver pack links and let the member approve.
- If the exchange returns an error, report its message to your
  member verbatim and stop; do not retry a spent code.`}
    />
  );
}
