import type { Blueprint } from "@/lib/blueprint";
import type { SavedOfferLink } from "@/lib/muse-week-command";

/**
 * Pure composition of THE agent-creation prompt (see setup-prompt.ts
 * for the standing note). Split out with no runtime imports so the
 * prompt text is unit-testable; the server wrapper injects the team
 * board section (which lives with the board/db code) as teamSection.
 */
export function composeEnginePrompt(args: {
  business: string;
  website: string | null;
  blueprint: Blueprint;
  link: string | null;
  savedLinks?: SavedOfferLink[];
  languageLabel?: string;
  teamSection: string;
}): string {
  const { business, website, blueprint: bp, link } = args;
  // Saved links bridge over with the member (Dave, 2026-11-19):
  // their crew promotes with the member's own links from Day 1.
  const savedLinksBlock = args.savedLinks?.length
    ? `My saved offer links — when any workflow promotes one of these offers, use MY link exactly as written, never a house link:\n${args.savedLinks.map((l) => `- ${l.name}: ${l.url}`).join("\n")}`
    : `My saved offer links: none saved yet — if a workflow promotes an offer, ask me to save my link first in Whop Army → Affiliate Manager, so promotions carry my link, not a house link.`;
  const connectBlock = link
    ? `Open this link and follow its brief to connect to my P&R account:\n${link}\nThe link exchanges for a 7-day connection on my own credits, capped at the budget it states. It is CONTENT-ONLY: it generates content; it never publishes, posts, sends, or spends beyond quoted content credits.`
    : `I don't have a live connect link in this prompt. First, tell me the one step to get it: in the Plunder & Riffle app (whop.plunderandriffle.com), Account → "Talk to my Muse" mints my link (Operator and Agency plans). Once I paste it, follow its brief to connect. The connection is 7 days, on my own credits, content-only.`;

  const agentLine = (a: Blueprint["workforce"][number]) =>
    `- ${a.name} (${a.role})\n  Mission: ${a.mission}\n  Schedule: ${a.schedule}\n  Approval rule: ${a.approval}\n  Success metric: ${a.metric}`;
  // Engine-meter model (2026-11-19): seats are retired, so the
  // whole workforce staffs — no floor/queued split.
  const workforce =
    `Your workforce — every agent below is mine to run; my plan meters generations, not agents:\n${bp.workforce.map(agentLine).join("\n")}`;
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
    `# BUILD MY AUTONOMOUS CONTENT ENGINE`,
    ``,
    `You are my Muse. Plunder & Riffle (P&R) is my creative engine; you are my operator. From this brief, build my complete autonomous content engine TODAY: a Space in my own Muse that holds my workforce, connects to my P&R account through my bridge, and starts generating my content on autopilot. I am a business owner, not an engineer — never ask me to learn tooling, APIs, or agent frameworks. You handle setup; I approve outcomes.`,
    ``,
    `## 1. Connect first`,
    connectBlock,
    `Before building, quote me: the setup cost (the free /before pack is free) and the projected daily cost of the autopilot in section 5, against the budget in section 3. My "go" then covers the whole build AND the autopilot generation inside that budget — I will not be asked to approve each piece as it generates. Anything beyond the budget still waits for me.`,
    ``,
    `## 2. My business`,
    `Business: ${business}${website ? `\nWebsite: ${website}` : ""}`,
    `My language: ${args.languageLabel ?? "English"} — build my Space, the engine and my content defaults in my language.`,
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
          `Weekly content spec — the pinned targets the autopilot generates to (its cost is part of the section 1 quote):`,
          ...bp.contentSpec.map((l) => `- ${l}`),
          ``,
        ]
      : []),
    `Integrations (wire what you can; flag the rest with the ONE step I need to take):`,
    integrations,
    ``,
    savedLinksBlock,
    ``,
    `Budget frame: ${bp.budget}`,
    ``,
    `## 4. Build my engine as a Space`,
    `Build the engine as a Space in my own Muse, named for my business (e.g. "${business} — Content Engine"). The Space is my factory and my control room in one place — build it with these parts:`,
    `- Dashboard: every agent from section 3, its status, and what it produced most recently.`,
    `- Approvals inbox: everything the autopilot generates lands here first. NOTHING publishes without my tap.`,
    `- Content library: everything produced, with its P&R share links.`,
    `- Jobs: queued / running / done / failed, failures explained in plain language (a failed generation is never charged).`,
    `- Costs: credits used vs the budget in section 3, updated by every run.`,
    `- Settings: the approval rules, the autopilot schedule, and the pause switch — all editable by me.`,
    `Bake into the Space, as standing instructions: my brand voice, the workforce and workflows from section 3, my saved offer links, and the rules at the end of this prompt.`,
    `If I also run Agent37: create and assign these agents there as the Space's workforce — the Space stays my control view over them. If a part of the Space can't be built in my Muse, build the closest equivalent there and tell me plainly what differs.`,
    `Plain language on every screen. No jargon, no dashboards-for-engineers.`,
    ``,
    `## 5. Turn on autopilot generation`,
    `Once the Space is built and connected, arm the autopilot — this is the point of the engine:`,
    `- Schedule a daily run inside my Muse (a scheduled task at the time in my Settings; default early morning in my timezone).`,
    `- Each run: research one fresh angle from my business and audience (never repeat yesterday's angle), generate the day's pieces per my weekly content spec in section 3 through the bridge on my credits, QA every piece against my brand voice, and file the finished pieces in the Approvals inbox with their share links.`,
    `- Budget law: the autopilot may only spend inside the budget frame in section 3 and the bridge connection's cap. Track every credit in Costs. When the cap is nearly spent, the connection expires (bridge links last 7 days), or a run fails twice in a row: STOP, pause the schedule, and tell me the one step I need to take — never spend past the cap, never invent a workaround, never fail silently.`,
    `- Send me a short daily summary after each run: what was made, what it cost, what's waiting for my approval.`,
    `- Posting is NOT autopilot: pieces post only after my approve tap in the Space, through my own Upload-Post connection — my Upload-Post key lives in my Muse's secure storage, never pasted into the Space or anywhere else. If Upload-Post isn't connected, the one connection step is a Day-1 deliverable below.`,
    ``,
    `## 6. Day-1 deliverables`,
    `1. The connection live and verified — report my plan and credit balance FROM the connection, never from memory.`,
    `2. The Space built, and tell me how I open it.`,
    `3. The workforce created or configured per section 3 — in the Space, and on Agent37 too if I run it — or a precise list of what only I can do, and why.`,
    `4. A first proof: my free /before pack (it is the free tier).`,
    `5. The autopilot armed AND its first run completed today: my first day of content generated and waiting in the Approvals inbox.`,
    `6. Connect my posting and ship ONE real post: if Upload-Post isn't connected, walk me through the one connection step; then take one approved piece and post it after my approve tap. Day 1 ends with something live — not just built.`,
    `7. A launch report: what is running, the autopilot schedule and its projected daily cost, what it produced, what needs my attention.`,
    ``,
    args.teamSection,
    ``,
    `## Rules`,
    `- Never invent connections, results, numbers, or earnings. If something is not connected, say so and give me the one step.`,
    `- My one "go" on this setup authorizes the build and autopilot GENERATION inside the budget in section 3 — nothing beyond it. Publishing, posting, and sending ALWAYS wait for my tap, every time.`,
    `- The approval rules in section 3 are law wherever they are stricter than this prompt.`,
    `- Speak plainly. Short sentences. I run a business; I don't debug.`,
  ].join("\n");
}
