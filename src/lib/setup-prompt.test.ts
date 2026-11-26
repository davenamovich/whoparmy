import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeEnginePrompt, EXPLAINER_VIDEO_URL } from "./setup-prompt-compose.ts";
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

  it("wires Mnemos memory through research, setup capture, and standing rules", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const step1 = p.slice(p.indexOf("## Step 1"), p.indexOf("## Step 2"));
    assert.match(step1, /Mnemos memory/);
    const memory = p.slice(p.indexOf("## Your memory"), p.indexOf("## Step 6"));
    assert.match(memory, /recall it first and work from it/i);
    assert.match(memory, /confirmed goals, brand voice, offer and audience, the five unlock states, and my never-use list/i);
    assert.match(memory, /never credentials, keys, codes, or tokens; those live in secure storage, never in memory/i);
    assert.match(p, /Recall before you create: check my memory first, work from what it holds, and capture new durable facts back to it after each session\./);
  });

  it("removes all retired connection and setup procedures from the starter", () => {
    const p = composeEnginePrompt({ ...base, link: null, updateToken: "pru_SHOULD_NOT_APPEAR", keyClaimLink: "https://example/key-claim/SHOULD_NOT_APPEAR" });
    for (const forbidden of ["pru_SHOULD_NOT_APPEAR", "key-claim", "GATE 1", "foundation/confirm", "Skillsync", "get_brand_default"]) assert.equal(p.includes(forbidden), false, forbidden);
  });

  it("guides all five unlocks with say-first, drive, save, read-back, and skip", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    for (const item of ["Your links", "Your thinking key (LLM)", "Giphy", "Agent37 renderer", "Fish Audio"]) {
      const start = p.lastIndexOf("### ", p.indexOf(item));
      assert.ok(start >= 0, item);
      const end = p.indexOf("\n### ", start + 4);
      const section = p.slice(start, end < 0 ? undefined : end);
      for (const marker of ["Say first:", "Drive:", "Save:", "Read-back:", "Skip:"]) assert.ok(section.includes(marker), `${item}: ${marker}`);
    }
    assert.match(p, /Five quick setups[\s\S]*about seven taps total/);
    assert.match(p, /one unlock at a time/i);
    assert.match(p, /BotFather/);
  });

  it("puts Muse Mail first and explains LLM key choices plus existing keys", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    assert.ok(p.indexOf("## Step 0 — Your Muse email") < p.indexOf("## Step 1 — Learn my business"));
    const step0 = p.slice(p.indexOf("## Step 0 — Your Muse email"), p.indexOf("## Step 1 — Learn my business"));
    assert.match(step0, /Ask me what email I want to use/);
    assert.match(step0, /use my Gmail if I'd rather/);
    assert.match(step0, /Whichever I pick is the email you use to create my accounts in this setup/);
    assert.match(p, /address cannot change later/);
    const step4 = p.slice(p.indexOf("## Step 4 — I set up your five keys with you"), p.indexOf("### 1. Your links"));
    assert.ok(step4.indexOf("Secure entry is the secure entry card") < step4.indexOf("Create every account below with the email I chose in Step 0."));
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
    const step5 = p.slice(p.indexOf("## Step 7 — First proof"), p.indexOf("## Step 8"));
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
});
