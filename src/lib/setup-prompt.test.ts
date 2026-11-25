import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeEnginePrompt as composeSetupPrompt } from "./setup-prompt-compose.ts";
import type { Blueprint } from "./blueprint.ts";

const bp: Blueprint = {
  status: "approved",
  objective: "Book more roofing inspections",
  opportunities: [{ title: "Storm season", why: "Demand spikes after storms" }],
  workforce: [
    {
      templateKey: "custom",
      name: "Scout",
      role: "Lead scout",
      mission: "Find commercial roofing opportunities",
      schedule: "Daily 7am",
      approval: "Drafts only — owner approves outreach",
      metric: "Qualified leads per week",
    },
  ],
  workflows: [{ name: "Daily content", flow: "Research → generate → QA → approvals inbox" }],
  integrations: [
    { key: "bridge", label: "P&R bridge", connected: false, note: "mints on demand" },
    { key: "upload-post", label: "Upload-Post", connected: false, note: "not connected" },
  ],
  budget: "805 credits for the week",
  contentSpec: ["5 memes per day on the main offer"],
  voiceSpec: "Plain-spoken, no hype.",
  autonomy: "copilot",
};

const base = {
  business: "Acme Roofing",
  website: "https://acmeroofing.example",
  blueprint: bp,
  languageLabel: "English",
  teamSection: "## 7. Stand up my team board\n(board stub)",
};

describe("composeSetupPrompt — the one agent-creation prompt (2026-11-20)", () => {
  it("builds the life-first home base and starter apps in the member's own Muse", () => {
    const p = composeSetupPrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/CODE1" });
    assert.match(p, /BUILD MY AI TEAM AND HOME BASE/);
    assert.match(p, /## 4\. Build my home base and my starter apps/);
    assert.match(p, /Acme Roofing — Home Base/);
    for (const app of ["Mission Control", "Approvals Studio", "Daily Brief", "Content Engine", "My Links & Rotator", "business-specific app", "Settings"]) assert.ok(p.includes(app), app);
    assert.match(p, /Self-QA gate/);
    assert.match(p, /## Your only jobs — about seven taps in the whole setup, all of them yours alone/);
    assert.match(p, /## Teach me as you build[\s\S]*2–3 short plain sentences[\s\S]*what this step sets up, why it matters, and what it will let me do[\s\S]*never “API key,” “endpoint,” or “token”[\s\S]*never a lecture up front and never repeat it later/);
    for (const job of ["Sign in with Whop", "Paste your connect link", "Complete the DH Media payment", "send the USDT yourself", "BotFather bot token", "Approve the Vercel login", "Connect Upload-Post"]) assert.ok(p.includes(job), job);
    assert.match(p, /Passwords are always yours, never Muse's/);
    assert.match(p, /full design standard and layout spec live in the Super Muse Mission Control module and the space specs in app\/spaces\//);
    assert.doesNotMatch(p, /local web app/);
    assert.doesNotMatch(p, /agent management UI/i);
  });

  it("connects through the bridge link and turns on autopilot generation", () => {
    const p = composeSetupPrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/CODE1" });
    assert.match(p, /https:\/\/whop\.plunderandriffle\.com\/connect\/CODE1/);
    assert.match(p, /## 5\. Turn on autopilot generation/);
    assert.match(p, /Schedule a daily run/);
    assert.match(p, /Approvals inbox/);
    assert.match(p, /One money rule: generation runs on my credits in the background/);
    assert.doesNotMatch(p, /quote me|Budget frame|projected daily cost/i);
    assert.match(p, /Ask me at most three questions/);
    assert.match(p, /Never lead a message with credits, costs, or limits/);
    assert.match(p, /Publishing, posting, and sending ALWAYS wait for my tap/);
    assert.match(p, /pause and tell me in one plain sentence/);
  });

  it("keeps Gate 1 before starter apps and places the offer walkthrough after it", () => {
    const p = composeSetupPrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/CODE1", walkthroughOffers: [{ step: "salarium", name: "DH Media", signupUrl: "https://referrer.example/dh", signupSource: "referrer" }] });
    const gate = p.indexOf("GATE 1 — HARD GATE");
    const starter = p.indexOf("## 4. Build my home base and my starter apps");
    const walkthrough = p.indexOf("## 0. Set me up first — walk me through my offers");
    assert.ok(gate >= 0);
    assert.ok(starter > gate);
    assert.ok(walkthrough > gate);
    assert.match(p, /successful read-only check_my_unlock and get_brand_default/);
  });

  it("includes the durable claim instructions and bridge starter lane", () => {
    const link = "https://whop.plunderandriffle.com/key-claim/prk_fixture";
    const p = composeSetupPrompt({ ...base, link: null, keyClaimLink: link });
    assert.match(p, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(p, /POST \/api\/bridge\/key-claim\/exchange/);
    assert.match(p, /permanent pru_ update token/);
    assert.match(p, /bridge link is the starter lane/);
    const fallback = composeSetupPrompt({ ...base, link: null });
    assert.match(fallback, /no claim link here, continue in the bridge starter lane/);
  });

  it("without a link, the prompt carries the get-your-link step instead", () => {
    const p = composeSetupPrompt({ ...base, link: null });
    assert.match(p, /I don't have a live connect link in this prompt/);
    assert.doesNotMatch(p, /Operator and Agency plans/);
    // The engine build + autopilot sections are present either way.
    assert.match(p, /## 5\. Turn on autopilot generation/);
  });

  it("rides the member's saved offer links and workforce", () => {
    const p = composeSetupPrompt({
      ...base,
      link: null,
      savedLinks: [{ name: "DH Media", url: "https://dh.media/?affid=MEMBER1" }],
    });
    assert.match(p, /DH Media: https:\/\/dh\.media\/\?affid=MEMBER1/);
    assert.match(p, /Scout \(Lead scout\)/);
    assert.match(p, /5 memes per day on the main offer/);
  });

  it("keeps the team board as the last build section", () => {
    const p = composeSetupPrompt({ ...base, link: null });
    assert.match(p, /## 7\. Stand up my team board/);
  });

  it("includes Free Day, shopkeeper, Town, Skillsync, and Muse-driven Agent37 setup", () => {
    const p = composeSetupPrompt({ ...base, link: null });
    assert.match(p, /get_free_day with no arguments/);
    assert.match(p, /claim_free_day only when I ask/);
    assert.match(p, /passing the ET date read from get_free_day/);
    assert.match(p, /KIT means[\s\S]*CREDIT means[\s\S]*VISIT means/);
    assert.match(p, /POST \/api\/bridge\/rotator\/paid/);
    assert.match(p, /handoutOptIn/);
    assert.match(p, /my listings, my sales, my balance, my Town plot, my rotator, and my referral link/);
    assert.match(p, /My Muse is my shopkeeper/);
    assert.match(p, /\$20 per listing, one time/);
    assert.match(p, /70% to me, 15% to P&R, and 15% to my buyer's referrer/);
    assert.match(p, /flat \$25 a month for every plot/);
    assert.match(p, /https:\/\/app\.skillsync\.com\/iammagicdave\/plunder-and-riffle/);
    assert.match(p, /Whop keeps all sales and splits/);
    assert.match(p, /Muse; I never leave Muse/);
    assert.match(p, /compression\.threshold_tokens: 200000/);
    assert.match(p, /verify it is 200000/);
    assert.match(p, /up to 3 attempts per failure class/);
  });

  it("adds the optional offer walkthrough with resolved referrer links only when passed", () => {
    const offer = { step: "salarium", name: "DH Media", signupUrl: "https://referrer.example/dh", signupSource: "referrer" as const };
    const withWalkthrough = composeSetupPrompt({ ...base, link: null, walkthroughOffers: [offer] });
    assert.match(withWalkthrough, /## 0\. Set me up first — walk me through my offers/);
    assert.match(withWalkthrough, /DH Media: https:\/\/referrer\.example\/dh — this is my referrer's link/);
    assert.match(withWalkthrough, /I enter passwords and verification codes myself/);
    assert.doesNotMatch(withWalkthrough, /wait for me to finish signing up/i);
    assert.match(withWalkthrough, /Muse opens and drives the signup in my browser\/session/);
    const withoutWalkthrough = composeSetupPrompt({ ...base, link: null });
    assert.doesNotMatch(withoutWalkthrough, /## 0\. Set me up first/);
  });

  it("makes catalog link saves engine-first and confirms the final state", () => {
    const offer = { step: "salarium", name: "DH Media", signupUrl: "https://referrer.example/dh", signupSource: "referrer" as const };
    const p = composeSetupPrompt({ ...base, link: null, walkthroughOffers: [offer] });
    const pull = p.indexOf("FIRST run list_my_offers");
    const save = p.indexOf("FIRST call save_my_offer");
    const sync = p.indexOf("THEN re-run list_my_offers and sync");
    assert.ok(pull >= 0);
    assert.ok(save > pull);
    assert.ok(sync > save);
    assert.match(p, /If save_my_offer fails, tell me plainly and fall back to the direct sync POST/);
    assert.match(p, /one short summary of which offers are saved on my P&R record and synced to Whop Army, and which are still missing/);
    assert.match(p, /non-catalog offers use the direct sync POST only/);
  });

  it("includes the five-step Unlock check and its live verification rules", () => {
    const p = composeSetupPrompt({ ...base, link: null });
    const unlock = p.indexOf("## The Unlock — five saves that turn my key fully on");
    assert.ok(unlock >= 0);
    const items = [
      "My own links — I sign up under my referrer's link",
      "My LLM key — I choose the provider; Muse never picks silently",
      "My Giphy key — free to get",
      "My Agent37 renderer — save it as my worker",
      "My Fish Audio key",
    ].map((item) => p.indexOf(item, unlock));
    assert.ok(items.every((index) => index >= 0));
    assert.deepEqual(items, [...items].sort((a, b) => a - b));
    assert.match(p, /My links saved unlock my key at the \$0\.01 generation rate\. All five saves unlock full BYOK/);
    assert.match(p, /everything your army makes carries YOUR links, and your key drops to the 1-cent generation rate/);
    assert.match(p, /your agent thinks and writes on your own inference — you're not renting the house's brain/);
    assert.match(p, /your videos render as MP4s on your own worker at 1 credit instead of the 25-credit house rate/);
    assert.match(p, /your agent in your pocket — it answers and works while you sleep/);
    assert.match(p, /test render that bills 1 credit/);
    assert.match(p, /If it bills 25 credits, the worker is saved under a different record and this step is NOT done/);
    assert.match(p, /Skipping an unlock never blocks the build; the rest finishes later from Mission Control's Unlock panel/);
    assert.match(p, /developers\.giphy\.com/);
    assert.match(p, /Create an App with type API/);
    assert.match(p, /Fish Audio key[\s\S]*Get Started → Get your API key/);
    assert.match(p, /shown only once[\s\S]*Never let the one-time display lapse unsaved/);
    assert.match(p, /Cheaper Inference/);
    assert.match(p, /Starimg \(ai\.starimg\.ru\)/);
    assert.match(p, /browser's translate button/);
    assert.match(p, /https:\/\/plati\.market\/itm\/api-claude-fable-5-2-5-1-opus-5-5-sonnet-5-5-auto-delivery-1m-1b\/6047499/);
    assert.match(p, /pay by sending USDT myself from my own wallet/);
    assert.match(p, /Auto-delivery delivers the API access\/key/);
    const renderer = p.indexOf("My Agent37 renderer — save it as my worker");
    const telegram = p.indexOf("My agent on Telegram");
    const fish = p.indexOf("My Fish Audio key", renderer);
    assert.ok(renderer >= 0);
    assert.ok(telegram > renderer && telegram < fish);
    assert.match(p, /BotFather in chat, one message at a time/);
    assert.match(p, /stay awake \(auto-sleep off — a sleeping bot cannot answer\)/);
    assert.match(p, /send \/start first to claim my bot/);
    assert.match(p, /live round-trip: the bot answers me in my brand voice\. No reply = NOT done; name the one blocking step/);
    assert.match(p, /token only in my own secure storage and the instance's environment — never a file, a log, or show it back in full/);
    assert.match(p, /NOT a sixth unlock: the five saves stay five/);
  });

  it("renders goals, the Vercel Board deliverable, and the DH Media approval exception", () => {
    const p = composeSetupPrompt({
      ...base,
      link: null,
      walkthroughOffers: [{ step: "salarium", name: "DH Media", signupUrl: "https://dh.media/join", signupSource: "referrer" }],
    });
    assert.match(p, /## My goals[\s\S]*Objective: Book more roofing inspections/);
    assert.match(p, /Top opportunity: Storm season — Demand spikes after storms/);
    assert.match(p, /Everything you build must name which goal it serves/);
    assert.match(p, /## Vercel Board — after the five unlock saves verify/);
    assert.match(p, /a team of experts your Muse can ask — different frontier models, one best answer back/);
    assert.match(p, /your command room — your whole army, approvals, and results on one screen/);
    assert.match(p, /team of experts that helps me/);
    assert.match(p, /Muse posts a hard question, experts answer from different frontier models/);
    assert.match(p, /npm install --global vercel@latest/);
    assert.match(p, /own named --as profile/);
    assert.match(p, /one real test call through the board/);
    assert.match(p, /Vercel Board created and tested after all five unlock saves verify/);
    assert.match(p, /Muse opens and drives the signup in my browser\/session, pausing for my approval/);
    assert.match(p, /I enter passwords and verification codes myself; I complete payment moments myself/);
    assert.match(p, /This is the offer Barry promotes; your saved link is your rotator spot/);
  });
});
