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
 *
 * REACHABLE WHILE THE SITE GATE IS ON (Dave, 2026-11-19): the gate
 * intentionally closes every other page, but a member handing out a
 * link to their agent must still work — that link IS the credential,
 * it carries no session and grants nothing until exchange. The
 * exemption lives in app/layout.tsx (gateExempt).
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
  const upper = code.trim().toUpperCase();

  if (!live) {
    return (
      <Brief
        text={`AGENT BRIEF — Plunder & Riffle connection link: DEAD

This link's code is expired, already exchanged, or not valid. Codes
are single use (spent at EXCHANGE) and live 15 minutes from minting.
Do not retry it. Do not guess a replacement.

Tell your member, in your own words: "That connection link has
expired — mint a fresh one (in the Plunder & Riffle app, ask Ralph
for 'Talk to my Muse', or open
https://whop.plunderandriffle.com/muse-week) and send me the new
link." Then stop and wait for the fresh link.`}
      />
    );
  }

  const expiresIso = new Date(live.expiresAt).toISOString().replace(".000Z", "Z");

  if (live.scope === "clips") {
    return (
      <Brief
        text={`AGENT BRIEF — Plunder & Riffle Clip Factory

A member issued this link so YOU (their agent) can make meme clips on
their P&R credits. No API key, no account, no signup of your own: the
code below IS the credential, and the connection comes with a fixed
credit cap that cannot be exceeded.

CODE:    ${upper}
EXPIRES: ${expiresIso}
CAP:     ${live.budgetCredits} credits

STEP 1 — exchange (once). This is the only step that spends the code.
  POST https://whop.plunderandriffle.com/api/bridge/exchange
  body: {"code": "${upper}"}
  returns: token, mcpUrl, budgetCredits, expiresAt (token lives 7 days)
  Never print the token back to the member.

STEP 2 — connect.
  POST https://whop.plunderandriffle.com/api/bridge/mcp
  Authorization: Bearer <token from step 1>
  Call tools/list first: you get exactly the tools this link allows —
  the free ones (research_brand, get_account, get_usage,
  get_job_status, list_ad_options, list_services,
  create_campaign_from_research) plus the one clip generator below.

STEP 3 — make clips.
  create_sitdown     25 credits   one public clip in, one captioned
                                  9:16 post out
  That is the only paid tool on this link, and it is how the memes get
  made. Tell your member the plan and the total cost BEFORE spending,
  and stay under the cap of ${live.budgetCredits}.

RULES
- You cannot post. The member approves each clip and posts it.
- You cannot render MP4 through this link.
- A spent or expired code is dead — ask for a new link, never retry.
- Hand back the asset links and one line on what each clip says.`}
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
  const command = museWeekCommand(upper, businessUrl, live.budgetCredits, offerFor(live.budgetCredits));

  return (
    <Brief
      text={`AGENT BRIEF — connect to a Plunder & Riffle member

You are the agent reading this. A Plunder & Riffle member issued
this one-time link to connect you to their account so you can make
their content on their credits. No API key and no account of your
own: this code IS the credential. No human will type anything —
fetch, read, and follow the brief below.

MEMBER: ${businessName}
BUSINESS: ${businessUrl}
CONNECTION CAP: ${live.budgetCredits} credits (the bridge refuses
spend past this; quote before you spend, per the brief)
EXPIRES: ${expiresIso}
STATE: viewing this page did NOT consume the code. It is spent only
when you exchange it in step 1.

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
