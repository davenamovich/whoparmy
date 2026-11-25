import type { Blueprint } from "@/lib/blueprint";
import type { SavedOfferLink } from "@/lib/muse-week-command";
import type { WalkthroughOffer } from "@/lib/build-walkthrough-core";

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
  updateToken?: string | null;
  walkthroughOffers?: WalkthroughOffer[];
  keyClaimLink?: string | null;
}): string {
  const { business, website, blueprint: bp, link } = args;
  // Saved links bridge over with the member (Dave, 2026-11-19):
  // their crew promotes with the member's own links from Day 1.
  const savedLinksBlock = args.savedLinks?.length
    ? `My saved offer links — when any workflow promotes one of these offers, use MY link exactly as written, never a house link:\n${args.savedLinks.map((l) => `- ${l.name}: ${l.url}`).join("\n")}`
    : `My saved offer links: none saved yet — before promoting a catalog offer, pull my list_my_offers on my P&R key and sync it to Whop Army. For a new catalog link, save it with save_my_offer first, then re-run list_my_offers and POST the result to /api/bridge/links/sync so promotions carry my link, not a house link. If save_my_offer fails, say so plainly and use the direct sync POST; non-catalog offers use the direct sync POST only.`;
  const unlockSection = [
    `## The Unlock — five saves that turn my key fully on`,
    `Walk me through these five unlocks in order. Each save belongs on my own engine record, under the key it belongs to:`,
    `1. My own links — I sign up under my referrer's link (the rotator or a direct referral), then save MY links engine-first with save_my_offer and verify them with list_my_offers. This means everything your army makes carries YOUR links, and your key drops to the 1-cent generation rate.`,
    `2. My LLM key — I choose the provider; Muse never picks silently. Present these two options plainly and let me decide: (1) Cheaper Inference, or (2) Starimg (ai.starimg.ru), which has very cheap tokens but is a Russian site — use the browser's translate button to work in English and tell me that is happening. For Starimg, I purchase the token package on plati.market at https://plati.market/itm/api-claude-fable-5-2-5-1-opus-5-5-sonnet-5-5-auto-delivery-1m-1b/6047499 and pay by sending USDT myself from my own wallet; Muse guides and prepares but never sends crypto or pays for me. Auto-delivery delivers the API access/key; once it arrives, take that delivered key, save it to my engine record, and verify by read-back. Whichever I choose, walk me through signup/key creation with my approval, I enter credentials myself, then save the key and verify by read-back. With it, your agent thinks and writes on your own inference — you're not renting the house's brain.`,
    `3. My Giphy key — free to get. In my browser/session, go to developers.giphy.com, create my free developer account, then Create an App with type API. Copy the free beta API key shown on the dashboard, save it directly to my engine record, and verify by read-back. This means your agent can pull GIFs and meme media on your own free quota.`,
    `4. My Agent37 renderer — save it as my worker. This means your videos render as MP4s on your own worker at 1 credit instead of the 25-credit house rate. Drive my Agent37 signup in the browser from inside my Muse; I never leave Muse. My only hands are email verification and, if I choose, adding a card for Agent37's $5 compute. Create the API key in that browser flow and save it straight into my own secure storage.`,
    `Right after the renderer, in the same sitting, set up **My agent on Telegram** on my own Agent37 account — the same account as the renderer. Muse stands up my own second agent instance on my Agent37 key, powered by the LLM key I saved in the unlock: the renderer renders; this one talks and works. your agent in your pocket — it answers and works while you sleep.`,
    `Walk me through creating my own Telegram bot with BotFather in chat, one message at a time, then have me paste the bot token to you. Put the token only in my own secure storage and the instance's environment — never a file, a log, or show it back in full.`,
    `Set the instance to stay awake (auto-sleep off — a sleeping bot cannot answer), wire the token in, and set compression.threshold_tokens: 200000. Read the setting back and verify it is 200000. Have me send /start first to claim my bot.`,
    `Verify with a live round-trip: the bot answers me in my brand voice. No reply = NOT done; name the one blocking step.`,
    `This is NOT a sixth unlock: the five saves stay five. The renderer is an unlock (it sets the MP4 rate); the Telegram agent is a capability my Agent37 account makes possible.`,
    `5. My Fish Audio key. In my browser/session, use my referrer or catalog signup link when one is provided, sign me up, then choose Get Started → Get your API key. The key is shown only once: capture it straight into my engine save at that moment and verify by read-back. Never let the one-time display lapse unsaved. This means your content gets real voices and narration on your own account.`,
    `Muse performs these key-getting steps in my browser/session with my approval. I personally enter every password, verification code, and payment detail; Muse never holds passwords or payment details.`,
    `My links saved unlock my key at the $0.01 generation rate. All five saves unlock full BYOK: every generation and render runs at my own 1-credit rate on my own providers and record.`,
    `Verify live, never assume: every save counts only when you read it back from my engine record. For links, use list_my_offers; for provider keys, read the saved-key state back after each save. Prove the renderer with a short test render that bills 1 credit. If it bills 25 credits, the worker is saved under a different record and this step is NOT done — re-save it under my connected record.`,
    `At the end, show me the five states as Unlocked or Not yet, with the one finishing step for each missing item. Skipping an unlock never blocks the build; the rest finishes later from Mission Control's Unlock panel. These are finish-later tasks in the Unlock panel.`,
    `I can disconnect each item at any time, on my tap only: remove links with delete_my_offer, and remove provider saves from my engine record. Re-run the live check after a disconnect.`,
    `Keep the standing rules: my keys never go into Whop Army, a file, or a log, and never come back to me in full; logins and passwords are mine to enter; affiliate money is SIMULATED until actually paid; make no earnings promises.`,
  ].join("\n");
  const connectBlock = link
    ? `Open this link and follow its brief to connect to my P&R account:\n${link}\nThe link exchanges for a 7-day connection on my own credits, capped at the budget it states. It is CONTENT-ONLY: it generates content; it never publishes, posts, sends, or spends beyond quoted content credits.`
    : `I don't have a live connect link in this prompt. In the Plunder & Riffle app (whop.plunderandriffle.com), Account → "Talk to my Muse" mints my link. Once I paste it, follow its brief to connect. The connection is 7 days, on my own credits, content-only.`;
  const foundationBlock = args.keyClaimLink
    ? `My durable P&R key has been issued for this account. Claim it here: ${args.keyClaimLink} Use POST /api/bridge/key-claim/exchange with the claim code and my permanent pru_ update token as Bearer, for the same member. Save the returned key directly to Muse secure storage; never print, echo, log, or paste it into a Space. The bridge link is the starter lane while the durable key is installed.`
    : `My durable P&R key is issued server-side when available. If there is no claim link here, continue in the bridge starter lane and leave the durable-key step open; never invent or request that key in chat.`;
  const gateBlock = `GATE 1 — HARD GATE. Before building anything, connect to the P&R MCP and prove it with a successful read-only check_my_unlock and get_brand_default call. No proof means stop: build nothing. After the member's Muse reports both checks passed, make POST /api/bridge/foundation/confirm with my permanent update token as Bearer. This is Gate 1's last step.`;

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

  const walkthroughSection = args.walkthroughOffers?.length
    ? [
        `## 0. Set me up first — walk me through my offers`,
        `Offers to sign up for, in order:`,
        ...args.walkthroughOffers.map((offer) => `- ${offer.name}: ${offer.signupUrl}${offer.signupSource === "referrer" ? " — this is my referrer's link, so I sign up under them." : ""}`),
        `Walk me through the offers ONE at a time, DH Media first. This is the offer Barry promotes; your saved link is your rotator spot. For each offer, Muse opens and drives the signup in my browser/session, pausing for my approval at each consequential step. I enter passwords and verification codes myself; I complete payment moments myself. Muse handles the rest, then asks me for MY new affiliate/referral link or helps me find it in the program dashboard. If an offer genuinely must be completed by me, say “member completes this one” and explain why before starting it. I can skip any offer and stop the whole walkthrough at any time; skipping never blocks the build.`,
        `For catalog offers, before asking me for any link, FIRST run list_my_offers on my P&R key and POST its result to https://whop.plunderandriffle.com/api/bridge/links/sync with my permanent update token from the update-token section below as the Bearer token. A partner already present on my engine record is never re-asked.`,
        `When I provide a NEW link for a catalog partner, FIRST call save_my_offer with { step: "<partner key>", link: "<my link>" } on my P&R key, THEN re-run list_my_offers and sync that result to Whop Army. If save_my_offer fails, tell me plainly and fall back to the direct sync POST — never invent a save and never block the build. Non-catalog / Whoparmy-local offers keep the direct sync POST only.`,
        `When the links step ends — done, skipped, or stopped — give me one short summary of which offers are saved on my P&R record and synced to Whop Army, and which are still missing. Then build my agent using MY saved links from the check. The saved-links block below is the PRE-walkthrough state; my newly saved links replace the “none saved yet” line wherever they exist.`,
        `No earnings promises: affiliate money is simulated in Whop Army until actually paid.`,
        ``,
      ].join("\n")
    : "";

  return [
    `# BUILD MY AI TEAM AND HOME BASE`,
    ``,
    `You are my Muse. Your job is to give me time back and make running my business easier with AI. The team you build creates my content, watches my world, and runs my busywork; P&R is the creative engine under the hood, not the point. I am a business owner, not an engineer — you handle setup; I approve outcomes.`,
    ``,
    `# Phase 0 — Understand my business`,
    `I am a business owner, not an engineer. Research my business, teach as you build, and keep setup to about seven meaningful taps.`,
    `## Phase 1 — Connect and prove the foundation`,
    connectBlock,
    foundationBlock,
    gateBlock,
    `Connect, verify the connection quietly, and only raise it if something is actually wrong (expired, blocked, or zero balance). Make the free /before pack the first proof, as a gift.`,
    `Install the house P&R skill from Skillsync: https://app.skillsync.com/iammagicdave/plunder-and-riffle. One click installs it into my Muse and updates arrive automatically. Skillsync is the install lane; Whop keeps all sales and splits. Every kit I buy later arrives as a Skillsync install link with its Whop file as fallback, so no kit exists only on Skillsync. Show installed Skillsync skills and versions in Mission Control.`,
    `## Your only jobs — about seven taps in the whole setup, all of them yours alone`,
    `I’ll collect each at its step without re-explaining it. These are the only moments that need you:`,
    `- Sign in with Whop.`,
    `- Paste your connect link.`,
    `- Set a password or approve a login when a signup needs one. Passwords are always yours, never Muse's.`,
    `- Complete the DH Media payment.`,
    `- If you choose Starimg, send the USDT yourself from your wallet.`,
    `- Paste the BotFather bot token.`,
    `- Approve the Vercel login in your browser.`,
    `- Connect Upload-Post.`,
    `## Teach me as you build`,
    `At each setup step, before running it, tell me in 2–3 short plain sentences what this step sets up, why it matters, and what it will let me do once it's on. Use no jargon (say “your key” or “your connection,” never “API key,” “endpoint,” or “token”). Give one explanation at the step itself — never a lecture up front and never repeat it later.`,
    ``,
    `## Phase 2 — Optional offer walkthrough`,
    ...(walkthroughSection ? [walkthroughSection] : [`The offer walkthrough is optional and happens after connection and Gate 1.`]),
    ``,
    `## Your permanent update connection`,
    args.updateToken ? `Permanent update token: ${args.updateToken}` : `Get your permanent update token from Whop Army → Build an agent.`,
    `Save this token in your secure storage and use it for links sync and my agent/app updates. It never expires; if it stops working, it was revoked — ask me for a fresh one. It cannot generate content.`,
    `## Durable key handling`,
    `If I give you my P&R API key, save it in your secure storage and use it directly against the P&R MCP for generation on my credits. Never paste it into Whop Army, a Space, a file, or a log; never show it back to me in full.`,
    `## 2. My business`,
    `Business: ${business}${website ? `\nWebsite: ${website}` : ""}`,
    `My language: ${args.languageLabel ?? "English"} — build my Space, the engine and my content defaults in my language.`,
    `System objective: ${bp.objective}`,
    `Brand voice: ${bp.voiceSpec ?? "Mirror the voice on my website — my own phrases, my register, no hype."}`,
    `Top opportunities: ${bp.opportunities.map((o) => `${o.title} — ${o.why}`).join(" · ")}`,
    `## My goals`,
    `Objective: ${bp.objective}`,
    ...bp.opportunities.map((o) => `Top opportunity: ${o.title} — ${o.why}`),
    `Confirm these goals with me inside the existing at-most-three-questions budget, then tailor the workforce missions, weekly content spec, and business-specific starter app to them. Record the confirmed goals in the Space's Mission Control. Everything you build must name which goal it serves.`,
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
          `Weekly content spec — the pinned targets the autopilot generates to:`,
          ...bp.contentSpec.map((l) => `- ${l}`),
          ``,
        ]
      : []),
    `Integrations (wire what you can; flag the rest with the ONE step I need to take):`,
    integrations,
    ``,
    savedLinksBlock,
    ``,
    unlockSection,
    ``,
    `## Vercel Board — after the five unlock saves verify`,
    `This gives you a team of experts your Muse can ask — different frontier models, one best answer back.`,
    `Once all five unlock saves read back as verified, create my own Vercel Board in my own Vercel account. The board is a team of experts that helps me: Muse posts a hard question, experts answer from different frontier models, and Muse brings back the best answer. Install the Vercel CLI with npm install --global vercel@latest; I approve the login in my own browser, and Muse writes under its own named --as profile. Power the board with my saved LLM key and configure it to call different frontier models through that key. Verify it with one real test call through the board and report which models answered. If it cannot be created in my environment, say so plainly and give me the one step I must take — never fake it.`,
    `Add this Vercel Board as a Day-1 deliverable only after the five saves verify.`,
    ``,
    `One money rule: generation runs on my credits in the background. If a run would take my balance to zero, pause it and tell me in one sentence — otherwise, never make money the topic; show me results, and keep receipts in the Engine tile if I ever ask.`,
    ``,
    `# Phase 4 — Build my home base and starter apps`,
    `## 4. Build my home base and my starter apps`,
    `Build nothing in this phase until Gate 1 has passed.`,
    `This is your command room — your whole army, approvals, and results on one screen.`,
    `Build my home base as a Space in my own Muse, named for my business (e.g. "${business} — Home Base").`,
    `### Design standard`,
    `The full design standard and layout spec live in the Super Muse Mission Control module and the space specs in app/spaces/; my Muse has them in its app. Follow those specs for every starter app.`,
    `- Self-QA gate: after building, open every screen and look at it the way I'd see it. If any screen is a wall of text, carries placeholder/lorem text, or would bore a business owner in five seconds, rebuild that screen before you report done — and tell me what you changed in QA.`,
    `### The starter apps — build ALL of these, built out and pre-populated, not empty shells`,
    `1. Mission Control (the home dashboard): my army as agent cards, what's waiting for my tap (count, amber), today's output, my links/rotator status, installed Skillsync skills and versions, and a quiet Engine tile (live balance, read from the connection). Add my shop panel: my listings, my sales, my balance, my Town plot, my rotator, and my referral link. This is the Space's home screen and one panel for running my shop.`,
    `2. Approvals Studio: everything waiting for my tap as visual cards with real previews; approve/reject on the card. NOTHING publishes without my tap.`,
    `3. Daily Brief: a morning space with what my team did since yesterday, what's waiting, and today's one recommendation. Each daily run calls get_free_day with no arguments and mentions today's featured Space in one line when there is one. Lead with outcomes, never costs.`,
    `4. Content Engine: library + jobs as visual cards with previews and share links (this is where P&R generation lives).`,
    `5. My Links & Rotator: my saved offer/referral links as cards, rotator status in plain words, and my referral link. I may rent a Town plot for presence and rotator access: rent is a flat $25 a month for every plot. Daily paid rotator slots are separate and guarantee a featured day. Show my plot and rotator status in Mission Control and handle the steps only when I explicitly ask; renting or buying always waits for my word.`,
    `6. One app for MY business: invent and build one small app from my Top opportunities (section 2) that solves a real, specific pain of my business — for example a review-reply studio, quote/estimate helper, FAQ front desk, or follow-up tracker. Pick what fits MY business and name it for the outcome.`,
    `7. Settings: approval rules, schedule, pause switch; plain language.`,
    `Bake into the Space, as standing instructions: my brand voice, the workforce and workflows from section 3, my saved offer links, and the rules at the end of this prompt.`,
    `## My Free Day`,
    `On every Daily Brief and daily run, call get_free_day with no arguments. If it returns a featured Space, mention its name in one short line. Both get_free_day and claim_free_day use zero bridge credits. Never claim automatically: call claim_free_day only when I ask, passing the ET date read from get_free_day. If the date has flipped and the claim is refused, read get_free_day again before retrying.`,
    `Explain the result plainly: KIT means I keep the featured house Space's kit free forever, once per member per Space; CREDIT means that if I already own that house kit, I get a rotator placement credit that expires at midnight ET seven calendar days after the featured day began; VISIT means a visit to a featured member Space until midnight ET, never the kit. On my word, redeem a CREDIT through POST /api/bridge/rotator/paid with {creditId: claim grantId, date, partner}; use a partner with my saved link. No payment is needed.`,
    `When I list or resubmit a Space for sale, offer Handout opt-in as my choice using handoutOptIn. A Handout means agent visits during the featured ET day, never a kit giveaway.`,
    `## My shop and Town`,
    `My Muse is my shopkeeper. I manage nothing on a website; /spaces is browse and buy only. When I say “list it at $X”, package the kit, run the submission battery, and submit it through the bridge. My sentence sets the price. Listing costs $20 per listing, one time. Each sale splits 70% to me, 15% to P&R, and 15% to my buyer's referrer. I approve the publish flip with my tap.`,
    `I may rent a Town plot or buy a guaranteed featured rotator day-slot. Rent is a flat $25 a month for every plot. Plot rent buys presence and rotator access. Paid day-slots are separate. Show the status in Mission Control and handle the steps only on my explicit word; spending always waits for my approval.`,
    `If I also run Agent37: create and assign these agents there as the Space's workforce — the Space stays my control view over them. If a part of the Space can't be built in my Muse, build the closest equivalent there and tell me plainly what differs.`,
    ``,
    `# Phase 5 — Turn on autopilot generation`,
    `## 5. Turn on autopilot generation`,
    `Once the Space is built and connected, arm the autopilot — this is the point of the engine:`,
    `- Schedule a daily run inside my Muse (a scheduled task at the time in my Settings; default early morning in my timezone).`,
    `- Each run: research one fresh angle from my business and audience (never repeat yesterday's angle), generate the day's pieces per my weekly content spec in section 3 through the bridge on my credits, QA every piece against my brand voice, and file the finished pieces in the Approvals inbox with their share links.`,
    `- Money rule: if a run would take my balance to zero, the connection expires, or two runs fail in a row: pause and tell me in one plain sentence. Never fail silently.`,
    `- Send me a short daily summary after each run: what got made, what's waiting for my tap, and one thing that needs my attention. No cost lead; receipts live in the Engine tile.`,
    `- Posting is NOT autopilot: pieces post only after my approve tap in the Space, through my own Upload-Post connection — my Upload-Post key lives in my Muse's secure storage, never pasted into the Space or anywhere else. If Upload-Post isn't connected, the one connection step is a Day-1 deliverable below.`,
    ``,
    `## 6. Day-1 deliverables`,
    `1. The connection live and verified quietly — only raise money if I'm actually out.`,
    `2. The home base and ALL starter apps built, populated, and visually QA'd against the section 4 self-QA gate; tell me how I open it.`,
    `3. The workforce created or configured per section 3 — in the Space, and on Agent37 too if I run it — or a precise list of what only I can do, and why.`,
    `4. A first proof: my free /before pack (it is the free tier).`,
    `5. The Vercel Board created and tested after all five unlock saves verify; report the models that answered, or the one step I must take if my environment blocks it.`,
    `6. The autopilot armed AND its first run completed today: my first day of content generated and waiting in the Approvals inbox.`,
    `7. Connect my posting and ship ONE real post: if Upload-Post isn't connected, walk me through the one connection step; then take one approved piece and post it after my approve tap. Day 1 ends with something live — not just built.`,
    `8. The business-specific app working with a real example from my business.`,
    `9. A launch report: what's running, what it already produced, and what needs my attention.`,
    ``,
    args.teamSection,
    ``,
    `## Rules`,
    `- Never invent connections, results, numbers, or earnings. If something is not connected, say so and give me the one step.`,
    `- Ask me at most three questions during the whole setup. Pre-pick sensible defaults for everything else and tell me what you chose afterward.`,
    `- Never lead a message with credits, costs, or limits. Lead with what got done and what's waiting for me.`,
    `- Your job is to give me time back. If a step doesn't save me time or make me money, simplify it or drop it and tell me why.`,
    `- Publishing, posting, and sending ALWAYS wait for my tap, every time.`,
    `- Skills run autonomously end to end. I step in only at judgment gates: price, demo approval, publish flip, and publish/send/spend. My Muse fixes named failures and resubmits on its own, up to 3 attempts per failure class; then it escalates with evidence and the one decision needed.`,
    `- The approval rules in section 3 are law wherever they are stricter than this prompt.`,
    `- Speak plainly. Short sentences. I run a business; I don't debug.`,
  ].join("\n");
}
