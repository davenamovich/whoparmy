import "server-only";
import { db } from "@/lib/db";
import { draftBlueprint, getBlueprint, type Blueprint } from "@/lib/blueprint";
import {
  assertBridgeEligible,
  bridgeOffer,
  getMemberEngineKey,
  mintBridgeCode,
  BridgeError,
} from "@/lib/muse-bridge";

/**
 * ─── DAY-1 SETUP PROMPT (Dave, 2026-11-19) ───────────────────────
 * "The agent builds the prompt for Muse to build a complete
 * agent management UI for whatever their stack calls for — Ralph
 * crafts it, they post the bridge link, and the setup is built so
 * users start right from day 1."
 *
 * Ralph composes ONE master prompt from the member's blueprint:
 * the member pastes it to their own Muse together with their
 * bridge connect link, and their Muse builds the management UI +
 * wires the workforce in the member's OWN stack (Agent37, plain
 * Muse, whatever they run) — fitted to the blueprint, not a
 * generic template. The bridge stays content-only (Dave's rule):
 * the prompt says so, and posting remains the in-app approve tap.
 */

type Actor = { id: string; plan: string; whopId: string | null };

export interface SetupPromptResult {
  eligible: boolean;
  link: string | null;
  prompt: string;
  blueprintStatus: string;
}

export function composeSetupPrompt(args: {
  business: string;
  website: string | null;
  blueprint: Blueprint;
  link: string | null;
}): string {
  const { business, website, blueprint: bp, link } = args;
  const connectBlock = link
    ? `Open this link and follow its brief to connect to my P&R account:\n${link}\nThe link exchanges for a 7-day connection on my own credits, capped at the budget it states. It is CONTENT-ONLY: it generates content; it never publishes, posts, sends, or spends beyond quoted content credits.`
    : `I don't have a live connect link in this prompt. First, tell me the one step to get it: in the Plunder & Riffle app (whop.plunderandriffle.com), Account → "Talk to my Muse" mints my link (Operator and Agency plans). Once I paste it, follow its brief to connect. The connection is 7 days, on my own credits, content-only.`;

  const agentLine = (a: Blueprint["workforce"][number]) =>
    `- ${a.name} (${a.role})\n  Mission: ${a.mission}\n  Schedule: ${a.schedule}\n  Approval rule: ${a.approval}\n  Success metric: ${a.metric}`;
  // Panel fix 2: the prompt promises only the seated floor; the
  // rest is honestly queued, never silently staffed.
  const floor = bp.workforce.filter((a) => a.seated !== false);
  const queued = bp.workforce.filter((a) => a.seated === false);
  const workforce =
    `Your floor — these agents are covered by my plan's seats:\n${floor.map(agentLine).join("\n")}` +
    (queued.length
      ? `\n\nQueued for a seat — do NOT staff these until I upgrade or free a seat:\n${queued.map(agentLine).join("\n")}`
      : "");
  const workflows = bp.workflows.map((w) => `- ${w.name}: ${w.flow}`).join("\n");
  const integrations = bp.integrations
    .map((g) => {
      // Coherence (panel, Funnel lens): when this prompt carries a
      // live link, the bridge line must say so — the stored
      // snapshot predates the mint.
      if (link && g.key === "bridge") {
        return `- ${g.label}: connected — this prompt carries my live connect link (section 1; 7 days, content-only).`;
      }
      return `- ${g.label}: ${g.connected ? "connected" : "NOT connected"} — ${g.note}`;
    })
    .join("\n");

  return [
    `# DAY-1 SETUP — build my AI workforce system`,
    ``,
    `You are my Muse. Plunder & Riffle (P&R) is my creative engine; you are my operator. Build me a complete agent management system for my business TODAY, from this brief. I am a business owner, not an engineer — never ask me to learn tooling, APIs, or agent frameworks. You handle setup; I approve outcomes.`,
    ``,
    `## 1. Connect first`,
    connectBlock,
    `Before generating anything, quote the credit cost and wait for my "go".`,
    ``,
    `## 2. My business`,
    `Business: ${business}${website ? `\nWebsite: ${website}` : ""}`,
    `System objective: ${bp.objective}`,
    `Brand voice: ${bp.voiceSpec ?? "Mirror the voice on my website — my own phrases, my register, no hype."}`,
    `Top opportunities: ${bp.opportunities.map((o) => `${o.title} — ${o.why}`).join(" · ")}`,
    `First, research my website and any public presence, then confirm what you learned in ONE short plain-language summary before building. If something here is wrong, fix your understanding from the research, not from my corrections.`,
    ``,
    `## 3. The system to build (my approved blueprint)`,
    `Workforce — every agent works in the brand voice above; the QA step checks against it:`,
    workforce,
    ``,
    `Workflows:`,
    workflows,
    ``,
    ...(bp.contentSpec?.length
      ? [
          `Weekly content spec — the pinned targets for the rhythm (quoted exactly before anything generates):`,
          ...bp.contentSpec.map((l) => `- ${l}`),
          ``,
        ]
      : []),
    `Integrations (wire what you can; flag the rest with the ONE step I need to take):`,
    integrations,
    ``,
    `Budget frame: ${bp.budget}`,
    ``,
    `## 4. Build my agent management UI`,
    `Build a complete agent management UI fitted to MY stack — whatever I actually run:`,
    `- If I run Agent37: create and assign these agents there, and make the UI my control view over them.`,
    `- Otherwise: build it in my own environment (a local web app/page is fine) driving everything through my P&R connection and your tools.`,
    `The UI must have: a Dashboard (every agent, its status, what it produced), an Approvals inbox (NOTHING ships without my tap), a Content library (everything produced, with links), Jobs (queued / running / done / failed, failures explained plainly), Costs (credits used vs the budget above), and Settings (the approval rules and schedules from section 3 — editable by me).`,
    `Plain language on every screen. No jargon, no dashboards-for-engineers.`,
    ``,
    `## 5. Day-1 deliverables`,
    `1. The connection live and verified — report my plan and credit balance FROM the connection, never from memory.`,
    `2. The management UI built, and tell me how I open it.`,
    `3. The workforce created or configured per section 3 — or a precise list of what only I can do, and why.`,
    `4. A first proof: my free /before pack (quote it first; it is the free tier).`,
    `5. Connect my posting and ship ONE real post: if Upload-Post isn't connected, walk me through the one connection step in the app; then generate one piece, bring it to me, and post it only after my approve tap in the app. Day 1 ends with something live — not just built.`,
    `6. A launch report: what is running, what it does, what it costs, what it produced, what needs my attention.`,
    ``,
    `## Rules`,
    `- Never invent connections, results, numbers, or earnings. If something is not connected, say so and give me the one step.`,
    `- The approval rules in section 3 are law. Publishing, posting, sending, and spending ALWAYS wait for me.`,
    `- Content comes back to me for approval; the P&R app is where posting happens, on my tap.`,
    `- Speak plainly. Short sentences. I run a business; I don't debug.`,
  ].join("\n");
}

export async function craftSetupPrompt(user: Actor): Promise<SetupPromptResult> {
  let bp = await getBlueprint(user.id);
  if (!bp) bp = await draftBlueprint(user);
  const brand = await db.brandProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { name: true, website: true },
  });

  let link: string | null = null;
  let eligible = false;
  try {
    const full = await db.user.findUnique({ where: { id: user.id } });
    if (full) {
      assertBridgeEligible(full);
      await getMemberEngineKey(full); // prove the engine link before minting
      const offer = bridgeOffer("week");
      const { code } = await mintBridgeCode(user.id, offer.budgetCredits);
      link = `https://whop.plunderandriffle.com/connect/${code}`;
      eligible = true;
    }
  } catch (e) {
    if (!(e instanceof BridgeError)) throw e;
    // Not eligible or engine link unproven: the prompt still crafts,
    // with the get-your-link step written into section 1.
  }

  return {
    eligible,
    link,
    prompt: composeSetupPrompt({
      business: brand?.name ?? "My business",
      website: brand?.website ?? null,
      blueprint: bp,
      link,
    }),
    blueprintStatus: bp.status,
  };
}
