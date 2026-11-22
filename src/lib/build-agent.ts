/**
 * ─── BUILD-AN-AGENT FLOW — pure core (Whop Army 2.0, Slice 4) ──────
 *
 * Dave's flow (2026-11-21): deep research about the user → a SHORT
 * interactive quiz → build their agent → hand them the prompt, with
 * the Super Muse repo as the agent's base and their own Muse
 * building out their Spaces so they hit the ground running.
 *
 * Everything testable lives here with NO imports (the house rule for
 * pure cores — node --test loads this file directly): the quiz
 * definition (7 questions, stable ids), answer validation, the
 * deterministic agent design (research + quiz → name / role /
 * category / capabilities / description / instructions), the
 * research-summary text builder, and the prompt ADDENDUM that turns
 * the existing Day-1 engine prompt (lib/setup-prompt-compose.ts)
 * into this flow's personalized build prompt. The server glue —
 * flow state in AppSetting, the research jobs lane, the HiredAgent
 * create, the bridge mint — lives in lib/build-agent-server.ts.
 *
 * The category list mirrors AGENT_CATEGORIES in
 * lib/agent-profile.ts verbatim (import-free cores cannot share by
 * import; keep the copies in step).
 */

export const BUILD_AGENT_CATEGORIES = [
  "Research",
  "Business",
  "Marketing",
  "Creative",
  "Developer",
  "Automation",
  "Finance",
  "Data",
  "Personal Assistant",
  "Content",
  "Computer Use",
  "Gaming",
  "AI Infrastructure",
  "Utilities",
  "Other",
] as const;

// ─── The quiz — 7 questions, never 20 ──────────────────────────────

export interface QuizOption {
  id: string;
  label: string;
  hint?: string;
}

export interface BuildQuizQuestion {
  id: string;
  prompt: string;
  kind: "choice" | "text";
  options?: QuizOption[];
  placeholder?: string;
  maxLength: number;
  required: boolean;
}

/**
 * Question ids are STABLE — flow state, the design mapping and the
 * prompt all key off them. Promoting options reuse the front-door
 * quiz's ids (lib/quiz-shared.ts PROMOTING_OPTIONS); runsOn reuses
 * its Muse / Agent37 ids and adds "unsure".
 */
export const BUILD_QUIZ: BuildQuizQuestion[] = [
  {
    id: "promoting",
    prompt: "What are you promoting?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { id: "business", label: "My business", hint: "I have a business — and a website for it" },
      { id: "affiliate", label: "Products & offers", hint: "I promote other people's products for commission" },
      { id: "creator", label: "My content", hint: "I'm a creator — posts, videos, a channel" },
      { id: "clients", label: "Clients' businesses", hint: "I run marketing for other businesses" },
      { id: "idea", label: "Just an idea", hint: "Nothing live yet — I'm starting from an idea" },
    ],
  },
  {
    id: "audience",
    prompt: "Who is it for?",
    kind: "text",
    required: true,
    maxLength: 200,
    placeholder: "e.g. Homeowners in Raleigh who need a roof they can trust",
  },
  {
    id: "firstJob",
    prompt: "What should your agent do first?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { id: "content", label: "Make content", hint: "Posts, memes, videos — a steady stream in your voice" },
      { id: "leads", label: "Find leads", hint: "Research prospects and the angle that fits each" },
      { id: "research", label: "Research for me", hint: "My market, my competitors, what to do next" },
      { id: "support", label: "Answer customers", hint: "Draft answers to customer questions from my facts" },
    ],
  },
  {
    id: "cadence",
    prompt: "How often should it work?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { id: "daily", label: "Every day", hint: "A fresh piece of work waiting each morning" },
      { id: "weekly", label: "A few times a week", hint: "A steady rhythm without daily noise" },
      { id: "ondemand", label: "Only when I ask", hint: "No schedule — it works when I tell it to" },
    ],
  },
  {
    id: "tone",
    prompt: "How should it sound?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { id: "mirror", label: "Like my website", hint: "Mirror my own voice and phrases" },
      { id: "bold", label: "Bold and direct", hint: "Short, confident, no fluff" },
      { id: "warm", label: "Warm and friendly", hint: "Approachable, human, easy to read" },
      { id: "expert", label: "Calm and expert", hint: "Measured, knowledgeable, trustworthy" },
    ],
  },
  {
    id: "runsOn",
    prompt: "Where will your agent run?",
    kind: "choice",
    required: true,
    maxLength: 40,
    options: [
      { id: "muse", label: "My own Muse", hint: "Built in my Muse, on my accounts" },
      { id: "agent37", label: "Agent37", hint: "The full team, around the clock" },
      { id: "unsure", label: "Not sure yet", hint: "Start with Muse — decide later" },
    ],
  },
  {
    id: "neverDo",
    prompt: "Anything it must never do?",
    kind: "text",
    required: false,
    maxLength: 300,
    placeholder: "e.g. Never promise same-day delivery. Never mention competitors by name.",
  },
];

export type BuildQuizAnswers = {
  promoting?: string;
  audience?: string;
  firstJob?: string;
  cadence?: string;
  tone?: string;
  runsOn?: string;
  neverDo?: string;
};

export function quizQuestion(id: string): BuildQuizQuestion | undefined {
  return BUILD_QUIZ.find((q) => q.id === id);
}

export function optionLabel(questionId: string, optionId: string | undefined): string {
  if (!optionId) return "";
  const q = quizQuestion(questionId);
  return q?.options?.find((o) => o.id === optionId)?.label ?? optionId;
}

/**
 * Validate raw answers (from the API body). Returns the cleaned
 * answers, or an error naming the first problem. Choice answers must
 * be one of the question's option ids; text answers are trimmed and
 * clamped; required questions must be answered.
 */
export function validateQuizAnswers(raw: unknown): { answers: BuildQuizAnswers } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Quiz answers must be an object." };
  const input = raw as Record<string, unknown>;
  const answers: BuildQuizAnswers = {};
  for (const q of BUILD_QUIZ) {
    const value = input[q.id];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      if (q.required) return { error: `Answer the quiz question: "${q.prompt}"` };
      continue;
    }
    if (typeof value !== "string") return { error: `Quiz answer "${q.id}" must be text.` };
    const trimmed = value.trim();
    if (q.kind === "choice") {
      if (!q.options?.some((o) => o.id === trimmed)) {
        return { error: `Pick one of the listed answers for: "${q.prompt}"` };
      }
      (answers as Record<string, string>)[q.id] = trimmed;
    } else {
      (answers as Record<string, string>)[q.id] = trimmed.slice(0, q.maxLength);
    }
  }
  return { answers };
}

/** Human-readable answer lines for the prompt and the agent's instructions. */
export function quizAnswerLines(answers: BuildQuizAnswers): { question: string; answer: string }[] {
  const lines: { question: string; answer: string }[] = [];
  for (const q of BUILD_QUIZ) {
    const value = (answers as Record<string, string | undefined>)[q.id];
    if (!value) continue;
    lines.push({ question: q.prompt, answer: q.kind === "choice" ? optionLabel(q.id, value) : value });
  }
  return lines;
}

// ─── Research summary (structural — mirrors lib/types ResearchSummary) ──

export interface BuildResearchSummary {
  brandName?: string;
  voice?: string;
  hashtag?: string;
  analysisSummary?: string;
  offer?: string;
  audience?: string;
  pains?: string[];
  angles?: string[];
  competitors?: string[];
  sourceUrl?: string;
}

export interface BuildResearchProfile {
  name?: string;
  industry?: string;
  description?: string;
  products?: string[];
  audience?: string;
  sellingPoints?: string[];
  differentiators?: string[];
}

/** Plain-text digest of the deep research, for prompts + instructions. Empty string when there is nothing real to say. */
export function researchSummaryText(research: BuildResearchSummary | null, profile: BuildResearchProfile | null): string {
  const lines: string[] = [];
  if (research) {
    if (research.analysisSummary) lines.push(`Summary: ${research.analysisSummary}`);
    if (research.offer) lines.push(`Offer: ${research.offer}`);
    if (research.audience) lines.push(`Audience: ${research.audience}`);
    if (research.voice) lines.push(`Voice: ${research.voice}`);
    if (research.pains?.length) lines.push(`Customer pains: ${research.pains.join("; ")}`);
    if (research.angles?.length) lines.push(`Content angles: ${research.angles.join("; ")}`);
    if (research.competitors?.length) lines.push(`Competitors: ${research.competitors.join(", ")}`);
  }
  if (profile) {
    if (profile.description && !lines.some((l) => l.includes(profile.description!))) lines.push(`About: ${profile.description}`);
    if (profile.products?.length) lines.push(`Products/services: ${profile.products.join(", ")}`);
    if (profile.audience && !research?.audience) lines.push(`Audience: ${profile.audience}`);
    if (profile.differentiators?.length) lines.push(`Differentiators: ${profile.differentiators.join("; ")}`);
  }
  return lines.join("\n").slice(0, 4000);
}

// ─── The deterministic agent design ────────────────────────────────

export interface AgentDesign {
  name: string;
  role: string;
  category: string;
  capabilities: string[];
  description: string;
  schedule: string;
}

const FIRST_JOB_DESIGN: Record<string, { noun: string; category: string; capabilities: string[]; mission: string }> = {
  content: {
    noun: "Content Agent",
    category: "Content",
    capabilities: ["Content Creation", "Social Media", "Video Creation"],
    mission: "make content — posts, memes and short videos in the owner's voice, filed for approval",
  },
  leads: {
    noun: "Growth Agent",
    category: "Marketing",
    capabilities: ["Lead Generation", "Marketing", "Research"],
    mission: "find leads — research prospects and the angle that fits each one",
  },
  research: {
    noun: "Research Agent",
    category: "Research",
    capabilities: ["Research", "Data Analysis"],
    mission: "research the market, the competitors and the next move, and report in plain language",
  },
  support: {
    noun: "Support Agent",
    category: "Business",
    capabilities: ["Customer Support", "Business Automation"],
    mission: "draft answers to customer questions from the owner's real facts — never invent one",
  },
};

const CADENCE_SCHEDULE: Record<string, string> = {
  daily: "Daily",
  weekly: "A few times a week",
  ondemand: "On demand",
};

const TONE_VOICE: Record<string, string> = {
  mirror: "mirror the voice on the owner's website — their own phrases, their register",
  bold: "bold and direct — short, confident, no fluff",
  warm: "warm and friendly — approachable and human",
  expert: "calm and expert — measured, knowledgeable, trustworthy",
};

export function designAgent(args: {
  brandName: string | null;
  website: string | null;
  research: BuildResearchSummary | null;
  profile: BuildResearchProfile | null;
  quiz: BuildQuizAnswers;
}): AgentDesign {
  const job = FIRST_JOB_DESIGN[args.quiz.firstJob ?? "content"] ?? FIRST_JOB_DESIGN.content;
  const brand = (args.brandName ?? args.profile?.name ?? "My Business").trim() || "My Business";
  const name = `${brand} ${job.noun}`.slice(0, 60).trim();
  const audience = (args.quiz.audience ?? args.research?.audience ?? args.profile?.audience ?? "its audience").trim();
  const role = `Built for ${brand}: its job is to ${job.mission} — for ${audience}.`.slice(0, 300);
  const offerLine = args.research?.offer?.trim() || args.research?.analysisSummary?.trim() || args.profile?.description?.trim() || "";
  const description = (
    offerLine
      ? `${name} — ${offerLine}`
      : `${name} — built from deep research on ${brand}${args.website ? ` (${args.website})` : ""} and its owner's answers: it works to ${job.mission}, for ${audience}.`
  ).slice(0, 300);
  return {
    name,
    role,
    category: job.category,
    capabilities: [...job.capabilities],
    description,
    schedule: CADENCE_SCHEDULE[args.quiz.cadence ?? "ondemand"] ?? "On demand",
  };
}

/** Standing instructions stored on the HiredAgent row (CUSTOM kind runs on these). */
export function composeAgentInstructions(args: {
  design: AgentDesign;
  website: string | null;
  researchText: string;
  quiz: BuildQuizAnswers;
}): string {
  const lines = [
    `You are ${args.design.name}. ${args.design.role}`,
    `Schedule: ${args.design.schedule}. Voice: ${TONE_VOICE[args.quiz.tone ?? "mirror"] ?? TONE_VOICE.mirror}.`,
    args.website ? `The business's website: ${args.website}` : null,
    args.researchText ? `\nWhat deep research found (work only from this — invent nothing):\n${args.researchText}` : null,
    args.quiz.audience ? `\nAudience, in the owner's words: ${args.quiz.audience}` : null,
    args.quiz.neverDo ? `\nNEVER: ${args.quiz.neverDo}` : null,
    `\nApproval rule: you draft and build — nothing publishes, posts, sends, or spends without the owner's tap, every time.`,
  ];
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}

// ─── The prompt addendum ───────────────────────────────────────────

export const SUPER_MUSE_REPO_URL = "https://github.com/davenamovich/super-muse";

/**
 * The Build-an-Agent addendum: appended to the Day-1 engine prompt
 * (lib/setup-prompt-compose.ts) so the delivered prompt is ONE
 * document — the engine build, plus this agent's research, quiz,
 * design, Super Muse base, Spaces build-out, and bridge agent
 * management. Pure: the server layer supplies the minted code/link.
 */
export function composeBuildAgentAddendum(args: {
  design: AgentDesign;
  website: string | null;
  researchText: string;
  quiz: BuildQuizAnswers;
  agentId: string;
  connectLink: string | null;
  bridgeCode: string | null;
  updateToken?: string | null;
}): string {
  const { design } = args;
  const quizLines = quizAnswerLines(args.quiz)
    .map((l) => `- ${l.question} ${l.answer}`)
    .join("\n");
  const connectBlock = args.connectLink
    ? `Connect link: ${args.connectLink}\nBridge code: ${args.bridgeCode ?? "(in the link)"}\nThe link exchanges for a 7-day connection on my own credits, capped at the budget it states. It is CONTENT-ONLY: it generates content; it never publishes, posts, sends, or spends beyond quoted content credits.`
    : `I don't have a live connect link in this prompt (my plan may not include the bridge yet). Tell me the one step to get it: in Whop Army (whop.plunderandriffle.com), mint my link, then follow its brief to connect. The connection is 7 days, on my own credits, content-only.`;
  return [
    `---`,
    ``,
    `# YOUR AGENT — BUILT FROM YOUR RESEARCH + QUIZ`,
    ``,
    `Whop Army's Build-an-Agent flow designed ONE agent for me from deep research on my business and my quiz answers. Build THIS agent as the lead of the engine in the brief above.`,
    `If Section 0 is present, complete its optional offer walkthrough before building; skipping or stopping it never blocks the build.`,
    ``,
    `## The agent`,
    `Name: ${design.name}`,
    `Role: ${design.role}`,
    `Category: ${design.category} · Capabilities: ${design.capabilities.join(", ")} · Schedule: ${design.schedule}`,
    args.website ? `Website: ${args.website}` : null,
    ``,
    `## What the research found`,
    args.researchText || "Deep research did not return a summary this time. Research my website yourself first and work only from what you actually find — invent nothing.",
    ``,
    `## My quiz answers`,
    quizLines || "(none on file)",
    args.quiz.neverDo ? `\nNEVER: ${args.quiz.neverDo} — this is law for this agent, on top of every other rule.` : null,
    ``,
    `## Your base: Super Muse`,
    `You are running Super Muse — the app handed to me in my Muse through Whop. Super Muse's source is the private master repository ${SUPER_MUSE_REPO_URL}: do NOT try to clone it (it is not a member surface and you have no access). Everything you need is already in the Super Muse app you are running: build my agent from its AGENT-SCAFFOLD and shape my prompt with its ULTIMATE-PROMPT-TEMPLATE, following its onboarding flow. If a step seems to need the repo, use the app module that carries it instead and tell me plainly if something is missing.`,
    ``,
    `## Build out my Spaces — I hit the ground running`,
    `Do not hand me a blank scaffold. Build out my Spaces in my Muse, finished and pre-populated, so day one is running the system — not setting it up:`,
    `- The home base Space from the brief above, built to its design standard and pre-populated with Mission Control, Approvals Studio, Daily Brief, Content Engine, My Links & Rotator, my business-specific app, and Settings; bake in my brand voice, saved offer links and this agent's standing instructions.`,
    `- ${design.name} stood up inside it: mission, schedule (${design.schedule}) and approval rules set from my quiz answers, its first work already queued from the research angles above.`,
    `- My first day's work already done or drafted and waiting in the Approvals inbox — the research summary at the top, so I see what you worked from.`,
    `If my answers call for another Space (a lead book for leads work, a research shelf for research work), build that too, the same way: populated, not empty.`,
    ``,
    `## Connect + manage through the bridge`,
    connectBlock,
    `Your permanent update connection: ${args.updateToken ?? "Create it from Whop Army → Build an agent."} Save it in your secure storage and use it for links sync and agent/app updates. It never expires; if it stops working, it was revoked — ask me for a fresh one. It cannot generate content.`,
    `My own P&R key: if I give you my P&R API key, save it in your secure storage and use it directly against the P&R MCP for generation on my credits. Never paste it into Whop Army, a Space, a file, or a log; never show it back to me in full.`,
    ``,
    `KEEP MY WHOP ARMY AGENT IN SYNC: the connection above gives you my bridge token (the prb_… token the connect link exchanges for). With it, you can update MY OWN agent's Whop Army record — the agent named at the top of this section:`,
    `PATCH https://whop.plunderandriffle.com/api/agents/${args.agentId}`,
    `Header: Authorization: Bearer <your prb_ token> · Content-Type: application/json`,
    `Fields you may update: name, description, category, capabilities (an array of strings), avatarUrl, demoUrl, appUrl, gitUrl, buildPrompt, spaceUrl — and publicProfile (true publishes my agent's profile at its /agent/ page; ask me before publishing).`,
    `So when you build my Spaces or ship an app for this agent, reflect it back: set spaceUrl to the Space, appUrl/demoUrl to what you built, and keep description and capabilities true to what the agent actually does now. The token is checked against ownership on every call — you can change only my agent, never anyone else's, and never its budgets or plan. This manages my agent's RECORD only; it is not a posting channel — content still publishes only after my tap, every time.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
