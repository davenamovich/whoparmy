import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_AGENT_CATEGORIES,
  BUILD_QUIZ,
  NO_WEBSITE_NOTE,
  SUPER_MUSE_REPO_URL,
  buildStep1Complete,
  composeAgentInstructions,
  composeBuildAgentAddendum,
  designAgent,
  noWebsiteBrandName,
  noWebsiteFirstResult,
  noWebsiteProfile,
  quizAnswerLines,
  starterFirstResult,
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

describe("no-website path (P0-1)", () => {
  it("completes step 1 on the business name alone — no research is faked", () => {
    assert.equal(noWebsiteBrandName("  Acme Roofing  "), "Acme Roofing");
    assert.equal(noWebsiteBrandName(""), null);
    assert.equal(noWebsiteBrandName("   "), null);
    assert.equal(noWebsiteBrandName(undefined), null);
    const profile = noWebsiteProfile("Acme Roofing");
    assert.deepEqual(profile, { name: "Acme Roofing" });
    // A name-only profile yields NO research text — nothing for a prompt to dress up as findings.
    assert.equal(researchSummaryText(null, profile), "");
    assert.match(NO_WEBSITE_NOTE, /No website yet/);
    assert.doesNotMatch(NO_WEBSITE_NOTE, /research on file/i);
  });

  it("opens the build gate: step 1 complete at no-website + quiz saved — website gate unchanged", () => {
    assert.equal(buildStep1Complete("no-website"), true);
    assert.equal(buildStep1Complete("done"), true);
    assert.equal(buildStep1Complete("reused"), true);
    // The website lane's gate is not weakened: non-terminal statuses still block the build.
    assert.equal(buildStep1Complete("running"), false);
    assert.equal(buildStep1Complete("failed"), false);
    assert.equal(buildStep1Complete(undefined), false);
    assert.equal(buildStep1Complete(null), false);
    // The create gate's other half: a full valid quiz validates clean.
    assert.ok("answers" in validateQuizAnswers(FULL_ANSWERS));
  });

  it("designs the agent from name + answers without claiming deep research", () => {
    const design = designAgent({ brandName: "Acme Roofing", website: null, research: null, profile: noWebsiteProfile("Acme Roofing"), quiz: FULL_ANSWERS });
    assert.equal(design.name, "Acme Roofing Content Agent");
    assert.doesNotMatch(design.description, /deep research/i);
    assert.match(design.description, /owner's answers/);
  });

  it("the prompt carries no fake research claim for a no-website member", () => {
    const design = designAgent({ brandName: "Acme Roofing", website: null, research: null, profile: noWebsiteProfile("Acme Roofing"), quiz: FULL_ANSWERS });
    const text = composeBuildAgentAddendum({
      design,
      website: null,
      researchText: researchSummaryText(null, noWebsiteProfile("Acme Roofing")),
      quiz: FULL_ANSWERS,
      agentId: "agent_123",
      connectLink: null,
      bridgeCode: null,
      noWebsite: true,
    });
    assert.match(text, /no website yet/i);
    assert.match(text, /do not claim any website research was done/i);
    assert.doesNotMatch(text, /deep research on my business/);
    assert.doesNotMatch(text, /Research my website yourself/);
    assert.doesNotMatch(text, /research angles above/);
    // The brand block still comes through: name + quiz answers.
    assert.match(text, /Acme Roofing Content Agent/);
    assert.match(text, /What are you promoting\? My business/);
    assert.match(text, /Homeowners in Raleigh/);
  });

  it("builds the starter goal from the member's own quiz answers — never the account blueprint's objective", () => {
    // The live defect: this house goal sat in a bakery member's prompt
    // because the mint took the account blueprint's objective as-is.
    const otherBusinessGoal = "Turn Plunder & Riffle's own website, ideas, and voice into a steady stream of memes and short content that earns signups through its referral links — no views, follower, or income promises attached.";
    const bakeryQuiz: BuildQuizAnswers = {
      ...FULL_ANSWERS,
      audience: "Local customers in Raleigh who want fresh bread, pastries and cakes",
    };
    const goal = starterFirstResult({
      noWebsite: true,
      brandName: "Test Bakery Raleigh",
      quiz: bakeryQuiz,
      blueprintObjective: otherBusinessGoal,
    });
    assert.equal(
      goal,
      "Make content — posts, memes and short videos in my voice — that brings Local customers in Raleigh who want fresh bread, pastries and cakes to Test Bakery Raleigh",
    );
    assert.doesNotMatch(goal, /Plunder & Riffle/);
    // The website path keeps the blueprint objective, byte for byte.
    assert.equal(
      starterFirstResult({ noWebsite: false, brandName: "Test Bakery Raleigh", quiz: bakeryQuiz, blueprintObjective: otherBusinessGoal }),
      otherBusinessGoal,
    );
  });

  it("shapes the no-website goal from each first-job answer, with the member's audience + business", () => {
    const cases: Record<string, RegExp> = {
      content: /Make content — posts, memes and short videos in my voice — that brings Homeowners in Raleigh to Acme Roofing/,
      leads: /Find leads for Acme Roofing — research Homeowners in Raleigh and the angle that fits each one/,
      research: /Research Acme Roofing's market, competitors and next move — with Homeowners in Raleigh in mind — and report in plain language/,
      support: /Answer questions from Homeowners in Raleigh for Acme Roofing, drafted from my real facts — never invent an answer/,
    };
    for (const [firstJob, want] of Object.entries(cases)) {
      const goal = noWebsiteFirstResult({ brandName: "Acme Roofing", quiz: { ...FULL_ANSWERS, firstJob } });
      assert.match(goal, want, firstJob);
    }
    // No audience on file: the goal still names the business and the job, inventing no audience.
    const bare = noWebsiteFirstResult({ brandName: "Acme Roofing", quiz: { firstJob: "leads" } });
    assert.match(bare, /Find leads for Acme Roofing/);
    assert.doesNotMatch(bare, /Homeowners/);
  });

  it("quiz Q1 no longer assumes a website", () => {
    const promoting = BUILD_QUIZ.find((q) => q.id === "promoting")!;
    const business = promoting.options!.find((o) => o.id === "business")!;
    assert.doesNotMatch(business.hint ?? "", /a website for it/);
  });
});
