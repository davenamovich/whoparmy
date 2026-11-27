import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeEnginePrompt, EXPLAINER_VIDEO_URL } from "./setup-prompt-compose.ts";
import { starterFirstResult, type BuildQuizAnswers } from "./build-agent.ts";
import type { Blueprint } from "./blueprint.ts";

const bp: Blueprint = {
  status: "approved", objective: "Book more roofing inspections",
  opportunities: [{ title: "Storm season", why: "Demand spikes after storms" }],
  workforce: [], workflows: [], integrations: [], budget: "805 credits", autonomy: "copilot",
};
const base = { business: "Acme Roofing", website: "https://acme.example", blueprint: bp, teamSection: "", languageLabel: "Spanish", offer: "Roof inspections", audience: "Property managers", firstResult: "Booked inspections", neverDo: "Never promise same-day service" };

describe("composeEnginePrompt v3", () => {
  it("uses the member's business, website, goal, and language", () => {
    const p = composeEnginePrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/ONE" });
    for (const value of ["Acme Roofing", "https://acme.example", "Booked inspections", "Spanish", "Roof inspections", "Property managers", "Never promise same-day service"]) assert.ok(p.includes(value), value);
    assert.match(p, /for example Storm season: Demand spikes after storms/);
  });

  it("no-website member: Step 1 claims no website research (P0-1)", () => {
    const p = composeEnginePrompt({ ...base, website: null, link: null });
    const step1 = p.slice(p.indexOf("## Step 1"), p.indexOf("## Step 2"));
    assert.match(step1, /no website yet/i);
    assert.match(step1, /Do not claim you researched a website/);
    assert.doesNotMatch(step1, /deep research on my business/);
    assert.doesNotMatch(step1, /the research wins/);
    assert.doesNotMatch(step1, /Research no business website/);
    // Memory save is still asked for — of what was learned, not of "deep research".
    assert.match(step1, /Save what you learned about my business to my own memory/);
  });

  it("no-website mint: the goal slot is quiz-derived even when the account blueprint is another business's", () => {
    // Reproduces the 2026-11-27 live defect: the test account's
    // blueprint objective was the house business's goal, and the mint
    // dropped it into a no-website bakery member's prompt.
    const otherBusinessGoal = "Turn Plunder & Riffle's own website, ideas, and voice into a steady stream of memes and short content that earns signups through its referral links — no views, follower, or income promises attached.";
    const otherBp: Blueprint = { ...bp, objective: otherBusinessGoal };
    const bakeryQuiz: BuildQuizAnswers = {
      promoting: "business",
      audience: "Local customers in Raleigh who want fresh bread, pastries and cakes",
      firstJob: "content",
      cadence: "daily",
      tone: "warm",
      runsOn: "muse",
      neverDo: "Never promise same-day delivery for custom cakes.",
    };
    const p = composeEnginePrompt({
      ...base,
      business: "Test Bakery Raleigh",
      website: null,
      blueprint: otherBp,
      offer: "Test Bakery Raleigh Content Agent — built from its owner's answers",
      audience: bakeryQuiz.audience,
      firstResult: starterFirstResult({
        noWebsite: true,
        brandName: "Test Bakery Raleigh",
        quiz: bakeryQuiz,
        blueprintObjective: otherBp.objective,
      }),
      link: null,
    });
    assert.match(p, /- The one result I want first: Make content — posts, memes and short videos in my voice — that brings Local customers in Raleigh who want fresh bread, pastries and cakes to Test Bakery Raleigh/);
    assert.equal(p.includes(otherBusinessGoal), false, "another business's goal must not appear anywhere in the prompt");
  });

  it("wires Mnemos memory through research, setup capture, and standing rules", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const step1 = p.slice(p.indexOf("## Step 1"), p.indexOf("## Step 2"));
    assert.match(step1, /Mnemos memory/);
    const memory = p.slice(p.indexOf("## Step 7 — Your memory"), p.indexOf("## Step 8"));
    assert.match(memory, /recall it first and work from it/i);
    assert.match(memory, /confirmed goals, brand voice, offer and audience, the five unlock states, and my never-use list/i);
    assert.match(memory, /never credentials, keys, codes, or tokens; those live in secure storage, never in memory/i);
    assert.match(p, /Recall before you create: check my memory first, work from what it holds, and capture new durable facts back to it after each session\./);
  });

  it("removes all retired connection and setup procedures from the starter", () => {
    const p = composeEnginePrompt({ ...base, link: null, updateToken: "pru_SHOULD_NOT_APPEAR", keyClaimLink: "https://example/key-claim/SHOULD_NOT_APPEAR" });
    for (const forbidden of ["pru_SHOULD_NOT_APPEAR", "key-claim", "GATE 1", "foundation/confirm", "get_brand_default"]) assert.equal(p.includes(forbidden), false, forbidden);
  });

  it("guides all five unlocks with say-first, drive, save, read-back, and skip", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    for (const [i, item] of ["Your links", "Your thinking key (LLM)", "Giphy", "Agent37 renderer", "Fish Audio"].entries()) {
      const start = p.indexOf(`### ${i + 1}. ${item}`);
      assert.ok(start >= 0, item);
      const end = p.indexOf("\n### ", start + 4);
      const section = p.slice(start, end < 0 ? undefined : end);
      for (const marker of ["Learn first:", "Say first:", "Drive:", "Save:", "Read-back:", "Skip:"]) assert.ok(section.includes(marker), `${item}: ${marker}`);
    }
    assert.match(p, /Five quick setups[\s\S]*about seven taps total/);
    assert.match(p, /one unlock at a time/i);
    assert.match(p, /BotFather/);
  });

  it("puts Muse Mail first and explains LLM key choices plus existing keys", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    assert.match(p, /Muse Mail FIRST/);
    assert.match(p, /1M tokens/);
    assert.match(p, /10M bounty carve/);
    assert.match(p, /Top up in Mission Control/);
    assert.ok(p.indexOf("## Step 0 — Your Muse email") < p.indexOf("## Step 1 — Learn my business"));
    assert.match(p, /## Step 5 — Unlock the Panel \(Opus \+ Fable\)/);
    assert.match(p, /claude-opus-5-5/);
    assert.match(p, /claude-fable-5-2/);
    assert.match(p, /hard critique/);
    assert.match(p, /creative angle/);
    assert.match(p, /Vercel board/);
    assert.match(p, /P&R credits are engine fuel[\s\S]*different from Starimg API tokens[\s\S]*The Panel is NOT a currency/);
    assert.match(p, /Panel calls burn MY tokens at premium-model rates/);
    assert.ok(p.indexOf("## Step 5 — Unlock the Panel (Opus + Fable)") > p.indexOf("## Step 4 — I set up your five keys with you"));
    assert.ok(p.indexOf("## Step 5 — Unlock the Panel (Opus + Fable)") < p.indexOf("## Step 7 — Your memory"));
    assert.ok(p.includes("## Step 10 — Report, then stop"));
    const step0 = p.slice(p.indexOf("## Step 0 — Your Muse email"), p.indexOf("## Step 1 — Learn my business"));
    assert.match(step0, /Ask me what email I want to use/);
    assert.match(step0, /use my Gmail if I'd rather/);
    assert.match(step0, /Whichever I pick is the email you use to create my accounts in this setup/);
    assert.match(p, /address cannot change later/);
    const step4 = p.slice(p.indexOf("## Step 4 — I set up your five keys with you"), p.indexOf("### 1. Your links"));
    assert.ok(step4.indexOf("Secure entry is the secure entry card") < step4.indexOf("Create every account below with the email I chose in Step 0"));
    const llm = p.slice(p.indexOf("### 2. Your thinking key (LLM)"), p.indexOf("### 3. Giphy"));
    assert.match(llm, /OpenAI-compatible/);
    assert.match(llm, /I have a key/);
    for (const provider of ['"llm"', '"starimg"', '"giphy"', '"fishaudio"']) assert.ok(p.includes(provider), provider);
    for (const n of [3, 4, 5]) {
      const start = p.indexOf(`### ${n}. `);
      const end = p.indexOf("\n### ", start + 5);
      assert.match(p.slice(start, end), /I have a key|already have a .*key|already have an Agent37 account/i);
    }
    assert.match(p, /meme-loop-engine build \(the same video-worker build Plunder & Riffle runs\)/);
  });

  it("shows the explainer first in Step 0 only when a URL is supplied", () => {
    assert.equal(EXPLAINER_VIDEO_URL, "");
    const emptyPrompt = composeEnginePrompt({ ...base, link: null });
    assert.doesNotMatch(emptyPrompt, /short explainer video/);

    const videoUrl = "https://muse.example/onboarding-explainer";
    const withVideo = composeEnginePrompt({ ...base, link: null }, videoUrl);
    const step0 = withVideo.slice(withVideo.indexOf("## Step 0 — Your Muse email"), withVideo.indexOf("## Step 1 — Learn my business"));
    assert.ok(step0.indexOf(`short explainer video: ${videoUrl}`) < step0.indexOf("Ask me what email I want to use"));
    assert.match(step0, /everything happens right here in Muse/);
  });

  it("prints resolved walkthrough and Fish Audio links without reordering", () => {
    const fishUrl = "https://fish.audio/?fpr=member";
    const p = composeEnginePrompt({ ...base, link: null, walkthroughOffers: [
      { step: "salarium", name: "DH Media", signupUrl: "https://dh.example/ref", signupSource: "referrer" },
      { step: "fishaudio", name: "Fish Audio", signupUrl: fishUrl, signupSource: "house" },
    ] });
    assert.match(p, /- DH Media: https:\/\/dh\.example\/ref \(your referrer's link\)[\s\S]*- Fish Audio: https:\/\/fish\.audio\/\?fpr=member \(the house link\)/);
    assert.ok(p.includes(`Fish Audio signup link for me: ${fishUrl} (the house link) — use this exact link.`));
  });

  it("uses a bridge-performable Agent37 proof and defines secure entry", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const agent37 = p.slice(p.indexOf("### 4. Agent37 renderer"), p.indexOf("### 5. Fish Audio"));
    assert.match(agent37, /saved state and the live MP4 quote from check_my_unlock[\s\S]*quote must show 1 credit[\s\S]*shows 25 credits[\s\S]*different record[\s\S]*NOT done[\s\S]*re-save step/i);
    assert.doesNotMatch(agent37, /run a short test render|test render that bills/i);
    assert.match(p, /Secure entry is the secure entry card Muse presents; you type or paste your key on that card only; it goes to secure storage and is never shown back\./);
  });

  it("puts Unlock 1 through the referrer, own-link, house-link, then paste fallback ladder", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const start = p.indexOf("### 1. Your links");
    const end = p.indexOf("\n### ", start + 8);
    const section = p.slice(start, end);
    assert.match(section, /read this connection's account view and my saved offers/i);
    assert.match(section, /if a referrer is on my record, open with ‘you came in under <referrer>’; never ask who sent me/i);
    assert.match(section, /my own signup\/referral link.*my-refCode/i);
    assert.match(section, /house default signup link.*mark the links pending.*complete this unlock now/i);
    assert.match(section, /last resort after those sources are unavailable/i);
    assert.match(section, /Skip is also a choice/i);
    assert.match(section, /Never search for a signup link or invent a member link/i);
  });

  it("labels connect-page figures when this connection has no balance tool", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const step5 = p.slice(p.indexOf("## Step 9 — First proof"), p.indexOf("## Step 10"));
    assert.match(step5, /exact credit cost and balance only when a balance tool is present in THIS connection's tool list/i);
    assert.match(step5, /label any figure from the connect page explicitly as ‘the connect page says/);
    assert.match(step5, /never present page wording as an exact quote/i);
  });

  it("points at the connection brief as truth, bans P&R research, and handles link presence", () => {
    const linked = composeEnginePrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/ONE" });
    assert.match(linked, /My connect link: https:\/\/whop\.plunderandriffle\.com\/connect\/ONE/);
    assert.match(linked, /complete brief[\s\S]*cap, and expiry are the truth/);
    assert.match(linked, /Do NOT research plunderandriffle\.com to learn my business/);
    assert.doesNotMatch(linked, /exchange URL|seven days|credit cap:/i);
    const absent = composeEnginePrompt({ ...base, link: null });
    assert.match(absent, /I don't have a live connect link in this prompt/);
  });

  it("guards P&R websites for non-house members", () => {
    const p = composeEnginePrompt({ ...base, business: "P&R", website: "https://whop.plunderandriffle.com", link: null });
    assert.match(p, /no business website on file yet — ask me for mine in your first message/);
    assert.doesNotMatch(p, /Business: P&R|Website: https:\/\/whop\.plunderandriffle\.com/);
    const house = composeEnginePrompt({ ...base, website: "https://plunderandriffle.com", link: null, houseAccount: true });
    assert.match(house, /https:\/\/plunderandriffle\.com/);
  });

  it("educates before acting: a Learn first line at every unlock", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    for (const n of [1, 2, 3, 4, 5]) {
      const start = p.indexOf(`### ${n}. `);
      const end = p.indexOf("\n### ", start + 5);
      const section = p.slice(start, end < 0 ? p.indexOf("After all five") : end);
      assert.match(section, /Learn first: What this is:/, `unlock ${n}`);
      assert.match(section, /Why you need it:/, `unlock ${n}`);
      assert.match(section, /What happens next:/, `unlock ${n}`);
      assert.ok(section.indexOf("Learn first:") < section.indexOf("Drive:"), `unlock ${n} learns before driving`);
    }
  });

  it("explains credential storage before the first key is ever asked for", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const beat = p.indexOf("## Before any key — how your credentials are stored");
    assert.ok(beat >= 0, "credential beat present");
    assert.ok(beat < p.indexOf("### 1. Your links"), "beat precedes the first unlock");
    assert.ok(beat < p.indexOf("save_my_key"), "beat precedes the first key-save instruction");
    const section = p.slice(beat, p.indexOf("## Step 4"));
    assert.match(section, /secure entry card/);
    assert.match(section, /never into chat, never into a file/);
    assert.match(section, /secure BYOK store/);
    assert.match(section, /not in Mnemos/);
    assert.match(section, /check_my_unlock show only saved or not-saved, never the key itself/);
    assert.match(section, /delete_my_key/);
  });

  it("gets the email decision at Step 0 and repeats it at the unlocks intro", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const step0 = p.slice(p.indexOf("## Step 0 — Your Muse email"), p.indexOf("## Step 1 — Learn my business"));
    assert.match(step0, /Decide my email with me FIRST, before you create any account anywhere/);
    assert.match(step0, /Muse Mail setup card/);
    assert.match(step0, /confirm the address once, then use it throughout/);
    assert.match(step0, /my LLM provider, Giphy, Agent37, Fish Audio, and DH Media \/ my offers/);
    const intro = p.slice(p.indexOf("## Step 4 — I set up your five keys with you"), p.indexOf("### 1. Your links"));
    assert.match(intro, /Create every account below with the email I chose in Step 0/);
    assert.match(intro, /that same email for every account in this setup/);
  });

  it("prints the resolved Agent37 signup link inside its own unlock step", () => {
    const a37 = "https://www.agent37.com/?via=member";
    const p = composeEnginePrompt({ ...base, link: null, walkthroughOffers: [
      { step: "agent37_ref", name: "Agent 37", signupUrl: a37, signupSource: "referrer" },
    ] });
    const section = p.slice(p.indexOf("### 4. Agent37 renderer"), p.indexOf("### 5. Fish Audio"));
    assert.ok(section.includes(`Agent37 signup link for me: ${a37} (your referrer's link) — use this exact link to create my account.`));
    const noOffers = composeEnginePrompt({ ...base, link: null });
    const fallback = noOffers.slice(noOffers.indexOf("### 4. Agent37 renderer"), noOffers.indexOf("### 5. Fish Audio"));
    assert.match(fallback, /Agent37 signup: https:\/\/www\.agent37\.com\/\?via=riffle \(the house link\)/);
  });

  it("numbers the steps without a gap (Step 5 is the Panel, Step 6 is Core Skills)", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const order = ["## Step 0", "## Step 1", "## Step 2", "## Step 3", "## Before any key", "## Step 4", "## Step 5 — Unlock the Panel", "## Step 6 — Upgrade my core skills", "## Step 7 — Your memory", "## Step 8", "## Step 9", "## Step 10"];
    let last = -1;
    for (const h of order) { const i = p.indexOf(h); assert.ok(i > last, h); last = i; }
  });

  it("adds the Core Skills upgrade step right after the Panel", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    assert.match(p, /## Step 6 — Upgrade my core skills/);
    assert.ok(p.indexOf("## Step 6 — Upgrade my core skills") > p.indexOf("## Step 5 — Unlock the Panel (Opus + Fable)"));
    assert.ok(p.indexOf("## Step 6 — Upgrade my core skills") < p.indexOf("## Step 7 — Your memory"));
    const step = p.slice(p.indexOf("## Step 6 — Upgrade my core skills"), p.indexOf("## Step 7 — Your memory"));
    assert.match(step, /space-demo-and-replicate/);
    assert.match(step, /Design Engine contract and kit patterns/);
    assert.match(step, /taste finish gate/);
    assert.match(step, /Skillsync one-click install/);
    assert.match(step, /https:\/\/app\.skillsync\.com\/iammagicdave\/plunder-and-riffle/);
    assert.match(step, /Skills are the install lane; Whop keeps the sales/);
    assert.match(step, /version check yourself — I type nothing/);
    assert.match(step, /never silently mid-task/);
    assert.match(step, /turns a tester into a builder/);
    assert.match(step, /here\.now replication kit/);
  });

  it("gives Step 1 the honest Mnemos fallback where the save is asked", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const step1 = p.slice(p.indexOf("## Step 1"), p.indexOf("## Step 2"));
    assert.match(step1, /If no memory connection is available, say so in one line and continue — never fake a save/);
  });

});
