import "server-only";
import { getSetting, setSetting } from "@/lib/site-gate";
import type { BridgeScope } from "@/lib/muse-bridge";

/**
 * ─── Stacks registry ────────────────────────────────────────────────
 *
 * A "stack" is a release unit on existing infra whose member-facing
 * ignition is ONE prompt containing a bridge code, pasted into the
 * member's own Muse, which runs the stack on the member's own
 * credits through the bridge (the /muse-week pattern).
 *
 * This file is the registry: adding a stack is a one-entry change
 * here. A stack's live status can be overridden from the admin
 * dashboard without a code change — the override lives in AppSetting
 * under "stack:<id>:status" and this file's status is the default.
 *
 * NOTE: status is a release label for the operator. Member-surface
 * enforcement of stack status (hiding a draft stack's pages, etc.)
 * is NOT wired yet — flipping a status here changes the dashboard,
 * not what members can reach.
 */

export type StackStatus = "live" | "building" | "draft";

export interface Stack {
  id: string;
  name: string;
  blurb: string;
  status: StackStatus;
  /** Bridge scope its ignition prompt mints in, or null if the stack
   *  has no prompt-ignition (it rides another surface). */
  bridgeScope: BridgeScope | null;
  /** The member-facing prompt, with {BRIDGE_CODE} filled at launch.
   *  May carry a {BUSINESS_URL} placeholder the operator/member fills
   *  (the /muse-week page fills it from the brand profile today). */
  promptTemplate: string | null;
  /** Member page the stack lives on, or null. */
  entryPath: string | null;
  infraNotes: string;
}

const MUSE_WEEK_PROMPT = `**Make my week of content**

You are my content agent, connected to my Plunder & Riffle account through my bridge at whop.plunderandriffle.com. My credits are mine — never ask me for an API key; it stays in my P&R hub and I will never paste it anywhere.

1. My bridge code is **{BRIDGE_CODE}** (one-time, expires in 15 minutes). Exchange it at \`POST https://whop.plunderandriffle.com/api/bridge/exchange\` with \`{"code": "{BRIDGE_CODE}"}\` for my bridge token (7 days) and the MCP URL; use the token as the Bearer <redacted> for every MCP call. Never print the token back to me, and never store it past this week.
2. My business is **{BUSINESS_URL}**. Research it first (\`research_brand\`, then \`create_campaign_from_research\`) — both are free. Work only from what the research actually found about my business; invent nothing.
3. **Quote me the week before you spend anything:** 7 day-packs (\`create_demo_pack\` — 5 memes, an iMessage, a Top 10 and a slideshow per day), one for each day, each on a different angle from the research: Day 1 my offer · Day 2 my customer's pain · Day 3 proof · Day 4 one product · Day 5 me vs. the alternative · Day 6 questions customers ask · Day 7 best-of + call to action. Tell me the exact credit cost and my remaining balance (check \`get_account\` through the bridge), and wait for my "go". No go, no spend.
4. On my "go", make all 7 packs through the bridge (\`https://whop.plunderandriffle.com/api/bridge/mcp\`), polling \`get_job_status\` until each is done. A failed piece refunds — if a whole pack fails, tell me and retry it once.
5. Deliver my week as a calendar: for each day, the pack's share-page link and what's in it. End with the receipt: credits spent, credits remaining. **Do not publish anything and do not render MP4s** — I'll approve the pieces I want first.
6. When the week is delivered or my token expires, stop. Next week I'll get a fresh code from whop.plunderandriffle.com/muse-week.`;

const CLIP_FACTORY_PROMPT = `**Make my clips**

You are my clipping agent, connected to my Plunder & Riffle account through my bridge at whop.plunderandriffle.com. My credits are mine — never ask me for an API key; it stays in my P&R hub and I will never paste it anywhere.

1. My bridge code is **{BRIDGE_CODE}** (one-time, expires in 15 minutes). Exchange it at \`POST https://whop.plunderandriffle.com/api/bridge/exchange\` with \`{"code": "{BRIDGE_CODE}"}\` for my bridge token and the MCP URL; use the token as the Bearer <redacted> for every MCP call. Never print the token back to me, and never store it past this session.
2. **Set me up first — ask me these, one at a time:**
   - The clip links. Only clips I own or have permission to clip — if I can't say whose clip it is and that I have the right to use it, stop and tell me why.
   - The creator credit line, exactly as it should appear in every post copy.
   - An optional hook line for the first second. If I don't give one, use the clip's title or its opening words — never invent a claim the clip doesn't make.
   - Whether any clip is a spoiler for its source.
3. **Quote me the batch before you spend anything:** how many clips, the exact credit cost and my remaining balance (check \`get_account\` through the bridge), and wait for my "go". No go, no spend.
4. On my "go", make one clipping job per clip through the bridge (\`create_sitdown\` with \`clip\` + \`video_style: "captions"\`, plus my \`hook\` / \`spoiler\` where I set them), polling \`get_job_status\` until each is done. The clip's own audio is the track — never re-voice a clip, never add a host. If a job returns QA warnings, show them to me with that clip, don't hide them.
5. Deliver my batch as a list: for each clip, the share-page link, the post copy (hook + creator credit, ready to paste), and any warnings. End with the receipt: credits spent, credits remaining. **Do not publish anything** — I'll approve each clip first.
6. When the batch is delivered or my token expires, stop. Next batch, I'll get a fresh code from Whoparmy.`;

const BTC_EXPERIMENT_PROMPT = `**Run my BTC Experiment**

You are my Bitcoin Experiment agent, connected to my Plunder & Riffle account through my bridge at whop.plunderandriffle.com. My credits are mine — never ask me for an API key; it stays in my P&R hub and I will never paste it anywhere. We are testing whether an agent can help generate legitimate economic activity around a Bitcoin-paying affiliate opportunity. Nothing is guaranteed.

1. My bridge code is **{BRIDGE_CODE}** (one-time, expires in 15 minutes). Exchange it at \`POST https://whop.plunderandriffle.com/api/bridge/exchange\` with \`{"code": "{BRIDGE_CODE}"}\` for my bridge token (7 days) and the MCP URL; use the token as the Bearer <redacted> for every MCP call. Never print the token back to me, and never store it past this week.
2. My business is **{BUSINESS_URL}**. Research it first (\`research_brand\`, then \`create_campaign_from_research\`) — both are free. Work only from what the research actually found; invent nothing.
3. **Know the experiment.** The featured offer is DH Media — a business and social-media tools suite (website and funnel builder, booking, automations, email, Social Planner, affiliate manager) that runs a crypto-paying affiliate program. The official facts live at dh.media and dh.media/affiliates, and only there: anything those pages don't state (payout timing, payout-address rules, minimums) is unverified — say "not verified" if I ask, and never invent program terms.
4. **Activate DH Media with me, carefully.** I register myself, on their site, with my own details, and I pay their charges myself (their Launch pack is listed at $10 = 100 credits on dh.media — confirm the current price on their page before I pay). If their registration asks for a crypto payout address, stop and walk me through it: I enter an address I control, on their site, and I confirm on their page whether it can be changed later — that is not verified. Never ask me for a seed phrase or private keys. Never register accounts for me, never create duplicate accounts, never refer myself.
5. **My offers come from Plunder & Riffle, pulled dynamically** (\`list_my_offers\` through the bridge): DH Media is the featured experiment; the rest of my saved offers are the bench. Use only my saved referral links, exactly as written, with attribution preserved — and share each offer's \`pages[].url\` (our page for that partner, carrying my ref) rather than the raw partner link.
6. **Quote me the first week before you spend anything:** a first-week plan from the research plus a first meme pack (\`create_demo_pack\` through the bridge). Tell me the exact credit cost and my remaining balance (check \`get_account\` through the bridge), and wait for my "go". No go, no spend.
7. **Content rules, non-negotiable:** sell the tools and the workflow, never income. No earnings claims, no matrix math, no "passive income", no screenshots of money. Every promotional post carries an affiliate disclosure ("I may earn a commission"). Memes lead; webinars and posts support. Make the content in my language first — localized, not just translated — and other languages on my request. Draft everything.
8. **Distribution:** the Whop Army daily rotator is the shared traffic pool for eligible no-referral traffic — use it honestly. No artificial clicks, no circular referrals, no duplicate accounts.
9. On my "go", build the first meme pack through the bridge (\`https://whop.plunderandriffle.com/api/bridge/mcp\`), polling \`get_job_status\` until it is done; a failed piece refunds — tell me and retry it once. Deliver the week as share-page links: the plan, the pack, and what's in it. End with the receipt: credits spent, credits remaining. **Do not publish anything and do not render MP4s** through the bridge — publishing happens only when I approve a specific piece and tap approve in Whop Army.
10. **Report weekly, in plain numbers:** pieces created, pieces approved or posted, clicks or referrals only where a dashboard actually shows them, and commissions only as shown in the DH Media dashboard — label anything else "unverified". If the number is zero, say zero; that is the experiment working. Keep a running log of what you tried, what I approved, and what resulted, so each week starts from evidence.
11. When the week is delivered or my token expires, stop. Next week I'll get a fresh code from Whoparmy.`;

export const STACKS: Stack[] = [
  {
    id: "muse-week",
    name: "Muse Week",
    blurb:
      "One command from /muse-week and the member's Muse makes a week of content (7 day-packs) on the member's own credits. Operator + Agency special offer.",
    status: "live",
    bridgeScope: "week",
    promptTemplate: MUSE_WEEK_PROMPT,
    entryPath: "/muse-week",
    infraNotes:
      "The original bridge stack (shipped 2026-11-17). The launcher fills {BRIDGE_CODE} only — {BUSINESS_URL} is filled by the /muse-week page from the member's brand profile today, so replace it by hand when launching from here. Launcher mints at the week offer's server-side budget (805 list).",
  },
  {
    id: "btc-experiment",
    name: "The BTC Experiment",
    blurb:
      "The Bitcoin vertical: the member's Muse runs the BTC Experiment through the bridge on the member's own credits — DH Media (tools suite + crypto-paying affiliate program) featured, the member's saved web2 offers as the bench. Monetization stays in Whop Army: plans, offers, knowledge.",
    status: "live",
    bridgeScope: "week",
    promptTemplate: BTC_EXPERIMENT_PROMPT,
    entryPath: null,
    infraNotes:
      "Added 2026-11-19 on Dave's deploy order. Landing is external — TheBTCExperiment.com / thebtcexperiment.pages.dev (built 2026-11-19 in ~/workspace/btc-experiment/) routes into Whop Army with ?ref= preserved; no in-app entry page yet, so ignition is this launcher. No BTC payout address is stored in Whoparmy: the member enters it on DH Media itself during their own registration, and the prompt never asks for seed phrases or private keys. DH Media program terms beyond the official dh.media / dh.media/affiliates pages are Unverified — the prompt says so, and forbids inventing terms, earnings claims and matrix math. JA prompt variant pending native review; the EN prompt is the shipped master (~/workspace/btc-experiment/BTC-AGENT-PROMPT-EN.md).",
  },
  {
    id: "clip-factory",
    name: "Clip Factory",
    blurb:
      "The member's Muse turns source clips they own (or have permission to clip) into captioned clips via the engine's clipping agent, on the member's own credits. Any plan.",
    status: "building",
    bridgeScope: "clips",
    promptTemplate: CLIP_FACTORY_PROMPT,
    entryPath: null,
    infraNotes:
      "Bridge lane live since 2026-11-18 (clips scope, create_sitdown @ 25 list). Acceptance still pending: one real member session on the real bot + list-vs-actual charge reconciliation — the member prompt page ships only after that. Launcher prompt strips the draft's Box Trade brief step ({BRIEF_PROMPT}): briefs ride in only once the Box Trade (feat/clipping-app) ships, and a placeholder the member can't fill would stall their Muse. No member page yet — ignition is this launcher until the acceptance run passes.",
  },
  {
    id: "assessor",
    name: "The Assessor",
    blurb:
      "Rentable catalog agent offering the $999 AI Assessments: v2 is a bridge handoff — an ASSESS job hands the member's own Muse a bridge connection to run a /before pack on the member's own credits and deliver on their own pages.",
    status: "live",
    bridgeScope: "week",
    promptTemplate: null,
    entryPath: "/",
    infraNotes:
      "No member prompt to launch: ignition is job submission in the Agents board (entryPath), and the runner returns the bridge handoff (ASSESSOR-AGENT.md). It rides the week scope's bridge — there is no dedicated 'assessor' bridge offer yet; that one-click handoff is the noted follow-up in ASSESSOR-AGENT.md.",
  },
  {
    id: "lead-scout",
    name: "Lead Scout",
    blurb:
      "Populates a lead list for a business: give it a niche + city and it researches real businesses (owner, website, contact email, the angle that fits them) and drafts the outreach. Deep research runs on Exa; email runs on AgentMail — drafts first, sends only on approval.",
    status: "draft",
    bridgeScope: null,
    promptTemplate: null,
    entryPath: null,
    infraNotes:
      "Design: ~/workspace/whoparmy/SCOUT-AGENT.md. Research lane: Exa — Dave's key registered 2026-11-18, deep research (agent_run) unlocked and verified. Email lane: AgentMail connected via the custom.agentmail connector (inboxes joblessjoe@agentmail.to, luckythought5@agentmail.to); send path built but untested, org verification state unknown (unverified orgs can only email the attached human). No bridge scope in v1: the Scout spends no P&R credits; a per-lead /before pack is the follow-up (that is the Grand Openings pattern). Nothing sends without the owner's approval — drafts only until approved.",
  },
  {
    id: "token-vault",
    name: "Doors / Token Vault",
    blurb:
      "The War Room doors game (live in the War Room) and its Token Vault evolution: daily meme-reveal doors paying credits/free generations, evolving toward the finite season vault with Vault Token prizes.",
    status: "building",
    bridgeScope: null,
    promptTemplate: null,
    entryPath: "/",
    infraNotes:
      "No bridge scope and no ignition prompt — the game lives on the home page's War Room section and pays through the doors claim rails, not the Muse bridge. Design: ~/workspace/doors-game/TOKEN-VAULT-V2-SPEC.md (decisions locked; build is a separate gate).",
  },
];

/**
 * What getting a P&R API key unlocks — the BYOK explainer.
 *
 * Member-facing copy (shown on /admin today; the same block is the
 * source for member surfaces when a stack ships its key page).
 * Every line is a verified house fact — keep it that way: if a line
 * stops being true, edit it here first.
 */
export const API_KEY_UNLOCKS: Array<{ title: string; body: string }> = [
  {
    title: "Your key, your credits",
    body: "On your own key, every engine call costs exactly 1 credit ($0.01) — no per-tool list prices. What a stack will spend is quoted before anything runs; no quote, no spend.",
  },
  {
    title: "The house caps come off",
    body: "The free tier runs on a capped house key: previews and packs only. Your own key lifts the caps, so stacks can run at full size on your balance.",
  },
  {
    title: "MP4 rendering unlocks",
    body: "House-key work stops at previews — no MP4s. Rendering unlocks on paid tiers with your own key, so finished pieces come out as real video files.",
  },
  {
    title: "Every stack runs on it",
    body: "Muse Week, Clip Factory, and every bridge stack spend from your key's balance through the bridge — one key powers the whole army.",
  },
  {
    title: "The key is never pasted",
    body: "You never hand your key to a chat or a prompt. You generate a one-time pairing code in your hub and paste the code; the key itself stays in the hub, and bridge tokens expire in 7 days.",
  },
];

export function stackById(id: string): Stack | null {
  return STACKS.find((s) => s.id === id) ?? null;
}

function statusKey(id: string): string {
  return `stack:${id}:status`;
}

function asStatus(raw: string | null): StackStatus | null {
  return raw === "live" || raw === "building" || raw === "draft" ? raw : null;
}

/** Registry stacks with dashboard status overrides applied. */
export async function getStacks(): Promise<Array<Stack & { statusSource: "registry" | "dashboard" }>> {
  return Promise.all(
    STACKS.map(async (stack) => {
      const override = asStatus(await getSetting(statusKey(stack.id)));
      return override
        ? { ...stack, status: override, statusSource: "dashboard" as const }
        : { ...stack, statusSource: "registry" as const };
    }),
  );
}

export async function setStackStatus(id: string, status: StackStatus): Promise<void> {
  if (!stackById(id)) throw new Error(`Unknown stack: ${id}`);
  await setSetting(statusKey(id), status);
}
