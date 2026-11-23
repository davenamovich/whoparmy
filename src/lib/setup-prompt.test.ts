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
    assert.match(p, /Color with meaning/);
    assert.match(p, /Self-QA gate/);
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

  it("without a link, the prompt carries the get-your-link step instead", () => {
    const p = composeSetupPrompt({ ...base, link: null });
    assert.match(p, /I don't have a live connect link in this prompt/);
    assert.match(p, /Operator and Agency plans/);
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

  it("adds the optional offer walkthrough with resolved referrer links only when passed", () => {
    const offer = { step: "salarium", name: "DH Media", signupUrl: "https://referrer.example/dh", signupSource: "referrer" as const };
    const withWalkthrough = composeSetupPrompt({ ...base, link: null, walkthroughOffers: [offer] });
    assert.match(withWalkthrough, /## 0\. Set me up first — walk me through my offers/);
    assert.match(withWalkthrough, /DH Media: https:\/\/referrer\.example\/dh — this is my referrer's link/);
    assert.match(withWalkthrough, /Logins and passwords are mine to enter/);
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
      "My LLM key — Starimg or any OpenAI-compatible inference key",
      "My Giphy key — free to get",
      "My Agent37 renderer — save it as my worker",
      "My Fish Audio key",
    ].map((item) => p.indexOf(item, unlock));
    assert.ok(items.every((index) => index >= 0));
    assert.deepEqual(items, [...items].sort((a, b) => a - b));
    assert.match(p, /My links saved unlock my key at the \$0\.01 generation rate\. All five saves unlock full BYOK/);
    assert.match(p, /test render that bills 1 credit/);
    assert.match(p, /If it bills 25 credits, the worker is saved under a different record and this step is NOT done/);
    assert.match(p, /Skipping an unlock never blocks the build; the rest finishes later from Mission Control's Unlock panel/);
  });
});
