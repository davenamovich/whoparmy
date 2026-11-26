import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeEnginePrompt } from "./setup-prompt-compose.ts";
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

  it("uses a bridge-performable Agent37 proof and defines secure entry", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    const agent37 = p.slice(p.indexOf("### 4. Agent37 renderer"), p.indexOf("### 5. Fish Audio"));
    assert.match(agent37, /saved state and the live MP4 quote from check_my_unlock[\s\S]*quote must show 1 credit[\s\S]*shows 25 credits[\s\S]*different record[\s\S]*NOT done[\s\S]*re-save step/i);
    assert.doesNotMatch(agent37, /run a short test render|test render that bills/i);
    assert.match(p, /Secure entry is the secure entry card Muse presents; you type or paste your key on that card only; it goes to secure storage and is never shown back\./);
  });

  it("names the signup-link source and forbids searching or inventing links", () => {
    const p = composeEnginePrompt({ ...base, link: null });
    for (const sectionName of ["### 1. Your links", "### 5. Fish Audio"]) {
      const start = p.indexOf(sectionName);
      const end = p.indexOf("\n### ", start + sectionName.length);
      const section = p.slice(start, end < 0 ? undefined : end);
      assert.match(section, /my own saved offers \(list_my_offers\) or my referrer's link already on file/i);
      assert.match(section, /ask me for that one signup link in a single line, or I can skip/i);
      assert.match(section, /Never search for a signup link or invent one/i);
    }
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
