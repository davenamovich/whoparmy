import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_AGENT_CATEGORIES,
  BUILD_QUIZ,
  SUPER_MUSE_REPO_URL,
  composeAgentInstructions,
  composeBuildAgentAddendum,
  designAgent,
  quizAnswerLines,
  researchSummaryText,
  validateQuizAnswers,
  type BuildQuizAnswers,
  type BuildResearchSummary,
} from "./build-agent.ts";

const FULL_ANSWERS: BuildQuizAnswers = {
  promoting: "business",
  audience: "Homeowners in Raleigh",
  firstJob: "content",
  cadence: "daily",
  tone: "bold",
  runsOn: "muse",
  neverDo: "Never promise same-day delivery.",
};

const RESEARCH: BuildResearchSummary = {
  analysisSummary: "A trusted local roofing company with strong reviews.",
  offer: "Free roof inspections with a written report",
  audience: "Homeowners in Raleigh",
  voice: "Plain-spoken and direct",
  pains: ["Storm damage anxiety", "Contractor distrust"],
  angles: ["Storm-season checklist"],
  competitors: ["BigRoof Co"],
};

describe("BUILD_QUIZ definition", () => {
  it("is short: 6–8 questions", () => {
    assert.ok(BUILD_QUIZ.length >= 6 && BUILD_QUIZ.length <= 8, `got ${BUILD_QUIZ.length}`);
  });

  it("has unique, stable ids", () => {
    const ids = BUILD_QUIZ.map((q) => q.id);
    assert.deepEqual(ids, ["promoting", "audience", "firstJob", "cadence", "tone", "runsOn", "neverDo"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("covers Dave's six topics", () => {
    const prompts = BUILD_QUIZ.map((q) => q.prompt).join(" ");
    assert.match(prompts, /promoting/i);
    assert.match(prompts, /Who is it for/);
    assert.match(prompts, /do first/);
    assert.match(prompts, /How often/);
    assert.match(prompts, /sound/);
    assert.match(prompts, /run/);
    assert.match(prompts, /never do/);
  });

  it("every choice question has at least two options; promoting reuses the front-door ids", () => {
    for (const q of BUILD_QUIZ) {
      if (q.kind === "choice") assert.ok((q.options?.length ?? 0) >= 2, q.id);
    }
    const promoting = BUILD_QUIZ.find((q) => q.id === "promoting")!;
    assert.deepEqual(
      promoting.options!.map((o) => o.id),
      ["business", "affiliate", "creator", "clients", "idea"],
    );
  });
});

describe("validateQuizAnswers", () => {
  it("accepts a full valid set and trims text", () => {
    const out = validateQuizAnswers({ ...FULL_ANSWERS, audience: "  Homeowners in Raleigh  " });
    assert.ok("answers" in out);
    if ("answers" in out) assert.equal(out.answers.audience, "Homeowners in Raleigh");
  });

  it("rejects an unknown choice id", () => {
    const out = validateQuizAnswers({ ...FULL_ANSWERS, firstJob: "everything" });
    assert.ok("error" in out);
  });

  it("rejects a missing required answer and non-objects", () => {
    const { audience: _drop, ...missing } = FULL_ANSWERS;
    assert.ok("error" in validateQuizAnswers(missing));
    assert.ok("error" in validateQuizAnswers(null));
    assert.ok("error" in validateQuizAnswers("answers"));
  });

  it("neverDo is optional and clamped", () => {
    const { neverDo: _drop, ...noNever } = FULL_ANSWERS;
    assert.ok("answers" in validateQuizAnswers(noNever));
    const long = validateQuizAnswers({ ...FULL_ANSWERS, neverDo: "x".repeat(900) });
    assert.ok("answers" in long);
    if ("answers" in long) assert.ok((long.answers.neverDo ?? "").length <= 300);
  });
});

describe("designAgent mapping", () => {
  it("maps each firstJob to its category + capabilities", () => {
    const cases: Record<string, { category: string; capability: string }> = {
      content: { category: "Content", capability: "Content Creation" },
      leads: { category: "Marketing", capability: "Lead Generation" },
      research: { category: "Research", capability: "Research" },
      support: { category: "Business", capability: "Customer Support" },
    };
    for (const [firstJob, want] of Object.entries(cases)) {
      const design = designAgent({
        brandName: "Acme Roofing",
        website: "https://acme.example",
        research: RESEARCH,
        profile: null,
        quiz: { ...FULL_ANSWERS, firstJob },
      });
      assert.equal(design.category, want.category, firstJob);
      assert.ok(design.capabilities.includes(want.capability), firstJob);
      assert.ok(BUILD_AGENT_CATEGORIES.includes(design.category as never), firstJob);
    }
  });

  it("names the agent from the brand + job, and prefers the research offer in the description", () => {
    const design = designAgent({ brandName: "Acme Roofing", website: null, research: RESEARCH, profile: null, quiz: FULL_ANSWERS });
    assert.equal(design.name, "Acme Roofing Content Agent");
    assert.match(design.description, /Free roof inspections/);
    assert.match(design.role, /Homeowners in Raleigh/);
  });

  it("falls back honestly with no research", () => {
    const design = designAgent({ brandName: null, website: "https://x.example", research: null, profile: null, quiz: FULL_ANSWERS });
    assert.ok(design.name.length >= 2);
    assert.match(design.description, /deep research/i);
  });

  it("carries cadence into the schedule", () => {
    const design = designAgent({ brandName: "Acme", website: null, research: null, profile: null, quiz: { ...FULL_ANSWERS, cadence: "weekly" } });
    assert.equal(design.schedule, "A few times a week");
  });
});

describe("researchSummaryText", () => {
  it("includes summary, offer, pains and competitors", () => {
    const text = researchSummaryText(RESEARCH, null);
    assert.match(text, /trusted local roofing/);
    assert.match(text, /Free roof inspections/);
    assert.match(text, /Storm damage anxiety/);
    assert.match(text, /BigRoof Co/);
  });

  it("is empty when there is nothing real", () => {
    assert.equal(researchSummaryText(null, null), "");
    assert.equal(researchSummaryText({}, {}), "");
  });
});

describe("composeAgentInstructions", () => {
  it("carries the never-do rule and the approval rule", () => {
    const design = designAgent({ brandName: "Acme Roofing", website: null, research: RESEARCH, profile: null, quiz: FULL_ANSWERS });
    const text = composeAgentInstructions({ design, website: "https://acme.example", researchText: researchSummaryText(RESEARCH, null), quiz: FULL_ANSWERS });
    assert.match(text, /NEVER: Never promise same-day delivery\./);
    assert.match(text, /nothing publishes, posts, sends, or spends without the owner's tap/);
  });
});

describe("composeBuildAgentAddendum", () => {
  const design = designAgent({ brandName: "Acme Roofing", website: "https://acme.example", research: RESEARCH, profile: null, quiz: FULL_ANSWERS });
  const base = {
    design,
    website: "https://acme.example",
    researchText: researchSummaryText(RESEARCH, null),
    quiz: FULL_ANSWERS,
    agentId: "agent_123",
  };

  it("bakes in the research summary and the quiz answers", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: "https://whop.plunderandriffle.com/connect/ABCD", bridgeCode: "ABCD-1234" });
    assert.match(text, /trusted local roofing/);
    assert.match(text, /What are you promoting\? My business/);
    assert.match(text, /Acme Roofing Content Agent/);
  });

  it("references Super Muse correctly: app hand-out, scaffold + template, never clone", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: null, bridgeCode: null });
    assert.ok(text.includes(SUPER_MUSE_REPO_URL));
    assert.match(text, /do NOT try to clone it/i);
    assert.match(text, /AGENT-SCAFFOLD/);
    assert.match(text, /ULTIMATE-PROMPT-TEMPLATE/);
    assert.match(text, /handed to me in my Muse through Whop/);
  });

  it("instructs the Spaces build-out, pre-populated, ground running", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: null, bridgeCode: null });
    for (const part of ["design standard", "Mission Control", "Approvals Studio", "Daily Brief", "Content Engine", "My Links & Rotator", "business-specific app", "Settings"]) {
      assert.ok(text.includes(part), part);
    }
    assert.doesNotMatch(text, /Dashboard \/ Approvals inbox \/ Content library \/ Jobs \/ Costs/);
    assert.match(text, /hit the ground running/i);
    assert.match(text, /Do not hand me a blank scaffold/);
    assert.match(text, /first work already queued/);
  });

  it("carries the bridge code + connect link, and the approval rule", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: "https://whop.plunderandriffle.com/connect/ABCD", bridgeCode: "ABCD-1234" });
    assert.match(text, /My connect link: https:\/\/whop\.plunderandriffle\.com\/connect\/ABCD/);
    assert.match(text, /complete brief[\s\S]*cap, and expiry are the truth/);
    assert.doesNotMatch(text, /ABCD-1234|7-day connection|CONTENT-ONLY/);
    assert.match(text, /Nothing publishes without my approval/);
  });

  it("is honest when no bridge code was minted", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: null, bridgeCode: null });
    assert.match(text, /don't have a live connect link/i);
    assert.doesNotMatch(text, /Bridge code: \(in the link\)/);
  });

  it("does not add credential exchange or agent record PATCH instructions", () => {
    const text = composeBuildAgentAddendum({ ...base, connectLink: null, bridgeCode: null });
    assert.match(text, /actions offered by the connection page/);
    assert.doesNotMatch(text, /PATCH https:\/\/whop\.plunderandriffle\.com\/api\/agents|Authorization: Bearer|permanent update|key-claim/);
  });

  it("quizAnswerLines renders labels, not ids", () => {
    const lines = quizAnswerLines(FULL_ANSWERS);
    assert.ok(lines.some((l) => l.answer === "Make content"));
    assert.ok(lines.some((l) => l.answer === "Never promise same-day delivery."));
  });
});
