/**
 * The starter brief — the thing a stranger takes away before they pay anything.
 *
 * Where `clips/brief.ts` briefs a clipping run, this briefs a BUSINESS: who they
 * are, what they sell, who buys it, and the rules that never bend. It is the
 * artifact the Day 0 videos hand out, so it has to survive two harsher tests
 * than a member's brief does:
 *
 *   1. It is pasted into someone else's assistant (Muse or any agent they own),
 *      so the gates travel inside the text — not in a page they never open.
 *   2. It is read by someone who is not in AI at all, in their own language.
 *      Labels are not enough: the gates, the steps and the credit line are all
 *      written per language, because a rule that arrives in English reaches a
 *      Japanese reader as decoration.
 *
 * The credit line deliberately names the provider. Free tokens come from the
 * assistant's provider, never from us, and the brief says so — a third party
 * can change their terms without telling anyone, and the reader will remember
 * who appeared to promise.
 *
 * Nothing here calls a model or a tool: a brief is a value. Parse it, render
 * it, hand it over.
 */

export const STARTER_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ru", label: "Russian", native: "Русский" },
] as const;

export type StarterLanguage = (typeof STARTER_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: StarterLanguage = "en";

export interface StarterBrief {
  /** The business, in the member's own words. */
  business: string;
  /** What it sells. */
  sells: string;
  /** Who buys it. */
  buyer: string;
  /** Where the agent may read the member's own material. */
  sourceUrl?: string;
  language: StarterLanguage;
  /** Never optional: how credits work, and who is paying. */
  creditPolicy: string;
}

export interface StarterBriefInput {
  business?: unknown;
  sells?: unknown;
  buyer?: unknown;
  source_url?: unknown;
  sourceUrl?: unknown;
  language?: unknown;
  credit_policy?: unknown;
  creditPolicy?: unknown;
}

/**
 * Per-language copy. Each entry carries the four gates in its own language; the
 * marker string is what portability checks look for, so a translation cannot
 * quietly drop the gate.
 */
interface StarterCopy {
  heading: (b: StarterBrief) => string;
  context: (b: StarterBrief) => string[];
  stepsHeading: string;
  steps: string[];
  creditsHeading: string;
  rulesHeading: string;
  gates: string[];
  /** Substring that proves the "never invent a number" gate survived. */
  noNumberMarker: string;
  defaultCreditPolicy: string;
  handout: string;
}

const COPY: Record<StarterLanguage, StarterCopy> = {
  en: {
    heading: (b) => `You are building content for a business I own: ${b.business}.`,
    context: (b) => [
      `What I sell: ${b.sells}`,
      `Who buys it: ${b.buyer}`,
      ...(b.sourceUrl ? [`Read my own material here: ${b.sourceUrl}`] : []),
    ],
    stepsHeading: "What to do:",
    steps: [
      "Ask me for anything above that is missing. Do not fill a gap with a guess.",
      "Read my material and list the claims I already make, in my words.",
      "Write 5 short video ideas: hook, the point, what I ask for at the end.",
      "Show all 5 as previews. Do not make or publish anything yet.",
      "After I pick one, build the preview, then stop and wait for my OK.",
    ],
    creditsHeading: "Credits:",
    rulesHeading: "Rules that do not bend:",
    gates: [
      "Use only material I gave you: my site, my posts, my reviews.",
      "Never invent a number. No views, followers, customers or income — not in the hook, not in the caption.",
      "Show a preview first. Nothing is made until I approve it.",
      "You never post. I post, or I approve a file.",
      "If you do not have the material, say so instead of filling the gap.",
    ],
    noNumberMarker: "never invent a number",
    defaultCreditPolicy:
      "Work on the free credits your assistant already gives you. Those credits come from your assistant's provider, not from me — I cannot promise them or renew them. Never buy credits or start anything paid without asking me first.",
    handout:
      "Paste this into your assistant. It works with any agent you own, and it still works if you stop using ours.",
  },
  ja: {
    heading: (b) => `あなたは、私が経営する事業のコンテンツを作ります。事業名: ${b.business}`,
    context: (b) => [
      `販売しているもの: ${b.sells}`,
      `買う人: ${b.buyer}`,
      ...(b.sourceUrl ? [`私の素材はここにあります: ${b.sourceUrl}`] : []),
    ],
    stepsHeading: "やること:",
    steps: [
      "上で足りない情報があれば私に聞いてください。推測で埋めないでください。",
      "私の素材を読み、私がすでに言っている主張を、私の言葉で書き出してください。",
      "短い動画のアイデアを5つ書いてください。冒頭・要点・最後の呼びかけ。",
      "5つともプレビューとして見せてください。まだ制作も公開もしないでください。",
      "私が1つ選んだら、プレビューを作り、そこで止まって私のOKを待ってください。",
    ],
    creditsHeading: "クレジット:",
    rulesHeading: "曲げないルール:",
    gates: [
      "私が渡した素材だけを使ってください。私のサイト、投稿、レビュー。",
      "数字を作らないでください。再生数・フォロワー・顧客数・収入を、冒頭にも文面にも書かないでください。",
      "まずプレビューを見せてください。私が承認するまで何も作りません。",
      "あなたは投稿しません。私が投稿するか、私がファイルを承認します。",
      "素材がない場合は、埋めずに「ない」と言ってください。",
    ],
    noNumberMarker: "数字を作らないでください",
    defaultCreditPolicy:
      "あなたのアシスタントがすでに用意している無料クレジットの範囲で進めてください。そのクレジットはアシスタントの提供元が出しているもので、私からの約束ではありません。更新も保証もできません。クレジットの購入や有料の手続きは、私に確認する前に絶対にしないでください。",
    handout:
      "これをあなたのアシスタントに貼り付けてください。手持ちのどのエージェントでも動きますし、うちのサービスをやめても動きます。",
  },
  ru: {
    heading: (b) => `Вы создаёте контент для бизнеса, которым владею я: ${b.business}.`,
    context: (b) => [
      `Что я продаю: ${b.sells}`,
      `Кто это покупает: ${b.buyer}`,
      ...(b.sourceUrl ? [`Мои материалы здесь: ${b.sourceUrl}`] : []),
    ],
    stepsHeading: "Что делать:",
    steps: [
      "Спросите меня о том, чего не хватает выше. Не подставляйте догадку вместо ответа.",
      "Прочитайте мои материалы и выпишите утверждения, которые я уже делаю, моими словами.",
      "Напишите 5 идей коротких видео: крючок, суть, призыв в конце.",
      "Покажите все 5 как превью. Пока ничего не создавайте и не публикуйте.",
      "Когда я выберу одну, сделайте превью и остановитесь, пока я не подтвержу.",
    ],
    creditsHeading: "Кредиты:",
    rulesHeading: "Правила, которые не меняются:",
    gates: [
      "Используйте только те материалы, которые я дал: мой сайт, мои посты, мои отзывы.",
      "Не придумывайте цифры. Ни просмотров, ни подписчиков, ни клиентов, ни дохода — ни в начале, ни в тексте.",
      "Сначала покажите превью. Пока я не подтвердил, ничего не создаётся.",
      "Вы не публикуете. Публикую я или я подтверждаю файл.",
      "Если материала нет — так и скажите, не заполняйте пробел.",
    ],
    noNumberMarker: "Не придумывайте цифры",
    defaultCreditPolicy:
      "Работайте на бесплатных кредитах, которые уже даёт ваш ассистент. Эти кредиты выдаёт поставщик ассистента, а не я: я не могу их обещать или продлевать. Не покупайте кредиты и не начинайте ничего платного, не спросив меня.",
    handout:
      "Вставьте это в своего ассистента. Это работает с любым вашим агентом и продолжит работать, если вы перестанете пользоваться нашим.",
  },
};

/** Forbidden anywhere in a rendered brief: promises we cannot keep. */
export const STARTER_FORBIDDEN = [
  "guaranteed",
  "free forever",
  "unlimited free",
  "we will give you",
  "we give you",
];

export function isStarterLanguage(value: unknown): value is StarterLanguage {
  return typeof value === "string" && STARTER_LANGUAGES.some((l) => l.code === value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/**
 * Build a brief from what the member typed. Missing fields stay missing on
 * purpose: `isPortableStarterBrief` refuses them, which is how the tool refuses
 * to hand someone a brief that aims at nothing.
 */
export function starterBriefFromInput(input: StarterBriefInput): StarterBrief {
  const language = isStarterLanguage(input.language) ? input.language : DEFAULT_LANGUAGE;
  const copy = COPY[language];
  return {
    business: str(input.business),
    sells: str(input.sells),
    buyer: str(input.buyer),
    sourceUrl: str(input.sourceUrl ?? input.source_url) || undefined,
    language,
    creditPolicy: str(input.creditPolicy ?? input.credit_policy) || copy.defaultCreditPolicy,
  };
}

/** The prompt a stranger pastes into their own assistant. Plain text, portable. */
export function renderStarterBrief(brief: StarterBrief): string {
  const copy = COPY[brief.language] ?? COPY[DEFAULT_LANGUAGE];
  const lines = [copy.heading(brief), ...copy.context(brief), "", copy.stepsHeading];
  copy.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push("", copy.creditsHeading, brief.creditPolicy || copy.defaultCreditPolicy);
  lines.push("", copy.rulesHeading, ...copy.gates.map((g) => `- ${g}`));
  return lines.join("\n");
}

/**
 * The cheap portability check, run before a brief is handed out. A brief that
 * aims at nothing, has no credit policy, or lost its gates in translation is
 * not a brief — it is a paragraph that will produce invented results.
 */
export function isPortableStarterBrief(brief: StarterBrief): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!brief.business) problems.push("No business named — an agent cannot write for nobody.");
  if (!brief.sells) problems.push("Nothing said about what is sold.");
  if (!brief.buyer) problems.push("No buyer named.");
  if (!brief.creditPolicy.trim()) problems.push("No credit policy — the brief is not portable without one.");
  if (!isStarterLanguage(brief.language)) problems.push(`Unsupported language: ${String(brief.language)}.`);

  const rendered = renderStarterBrief(brief);
  const copy = COPY[brief.language] ?? COPY[DEFAULT_LANGUAGE];
  const renderedLower = rendered.toLowerCase();
  if (!renderedLower.includes(copy.noNumberMarker.toLowerCase())) {
    problems.push("The no-invented-numbers gate is missing from the rendered brief.");
  }

  for (const phrase of STARTER_FORBIDDEN) {
    if (renderedLower.includes(phrase)) problems.push(`Rendered brief contains a promise we cannot keep: "${phrase}".`);
  }
  return { ok: problems.length === 0, problems };
}

// ── The bridge tool family ───────────────────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface StarterToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function text(body: string, isError = false): StarterToolResult {
  return isError ? { content: [{ type: "text", text: body }], isError: true } : { content: [{ type: "text", text: body }] };
}

export const STARTER_TOOLS: McpToolDef[] = [
  {
    name: "starter_brief",
    description:
      "Turn what a member tells you about their business into a portable starter brief: a plain-text prompt they can paste into Muse or any agent they own. Renders in English, Japanese or Russian, with the no-invented-numbers, preview-then-approve and agent-never-posts rules written inside the text. Free — this call consumes no credits.",
    inputSchema: {
      type: "object",
      properties: {
        business: { type: "string", description: 'The business, in their words, e.g. "Hollis and Sons Plumbing".' },
        sells: { type: "string", description: "What it sells, plainly." },
        buyer: { type: "string", description: "Who buys it, e.g. \"homeowners within 20 miles\"." },
        source_url: { type: "string", description: "Their own site or page the agent may read. Omit if they have none." },
        language: {
          type: "string",
          enum: STARTER_LANGUAGES.map((l) => l.code),
          description: "en, ja or ru. Defaults to en.",
        },
        credit_policy: {
          type: "string",
          description: "Override the credit line. Omit to use the honest default that names the assistant's provider.",
        },
      },
      required: ["business", "sells", "buyer"],
    },
  },
  {
    name: "starter_brief_language",
    description:
      "List the languages the starter brief renders in. Free. Use this when someone asks whether their language is supported before you build a brief.",
    inputSchema: { type: "object", properties: {} },
  },
];

export function isStarterTool(name: string): boolean {
  return STARTER_TOOLS.some((t) => t.name === name);
}

export async function callStarterTool(name: string, args: Record<string, unknown> = {}): Promise<StarterToolResult> {
  if (name === "starter_brief_language") {
    return text(
      [
        "The starter brief renders in:",
        ...STARTER_LANGUAGES.map((l) => `- ${l.code} — ${l.label} (${l.native})`),
        "",
        "Pass language: \"en\", \"ja\" or \"ru\". The gates are translated, not just the labels.",
      ].join("\n"),
    );
  }

  if (name !== "starter_brief") return text(`The starter brief family has no tool called ${name}.`, true);

  const brief = starterBriefFromInput(args as StarterBriefInput);
  const check = isPortableStarterBrief(brief);
  if (!check.ok) {
    return text(
      [
        "I cannot hand out this brief yet:",
        ...check.problems.map((p) => `- ${p}`),
        "",
        "Ask the member for the missing pieces in plain words — business, what it sells, who buys it. A brief with a gap produces invented content, so it is better to send nothing.",
      ].join("\n"),
      true,
    );
  }

  const copy = COPY[brief.language];
  return text(`${copy.handout}\n\n---\n\n${renderStarterBrief(brief)}`);
}
