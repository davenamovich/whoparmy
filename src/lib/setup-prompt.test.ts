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
  it("builds the engine as a Space in the member's own Muse", () => {
    const p = composeSetupPrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/CODE1" });
    assert.match(p, /BUILD MY AUTONOMOUS CONTENT ENGINE/);
    assert.match(p, /## 4\. Build my engine as a Space/);
    assert.match(p, /Acme Roofing — Content Engine/);
    assert.match(p, /Approvals inbox/);
    assert.doesNotMatch(p, /local web app/);
    assert.doesNotMatch(p, /agent management UI/i);
  });

  it("connects through the bridge link and turns on autopilot generation", () => {
    const p = composeSetupPrompt({ ...base, link: "https://whop.plunderandriffle.com/connect/CODE1" });
    assert.match(p, /https:\/\/whop\.plunderandriffle\.com\/connect\/CODE1/);
    assert.match(p, /## 5\. Turn on autopilot generation/);
    assert.match(p, /Schedule a daily run/);
    assert.match(p, /Approvals inbox/);
    // The one "go" covers generation inside the budget; publishing never rides along.
    assert.match(p, /My one "go" on this setup authorizes the build and autopilot GENERATION inside the budget/);
    assert.match(p, /Publishing, posting, and sending ALWAYS wait for my tap/);
    assert.match(p, /never spend past the cap/);
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
});
