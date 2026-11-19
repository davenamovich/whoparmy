/**
 * ─── FACTORY TOOL REGISTRY ─────────────────────────────────────────
 * The only tools the Agent Architect may put on a custom agent —
 * every entry maps to a job kind (or engine lane) that exists today.
 * The architect picks from this list; anything else it invents is
 * stripped at validation below. Publishing and sending are NOT tools:
 * they stay with the owner's approve tap. (Defined here, in the pure
 * core, so it unit-tests without the db; lib/agents.ts re-exports it.)
 */
export interface FactoryTool {
  id: string;
  label: string;
  kind: string; // job kind this tool runs as
  blurb: string;
}

export const FACTORY_TOOLS: FactoryTool[] = [
  { id: "scout", label: "Trend & competitor scouting", kind: "SCOUT", blurb: "Scout reports: trends, competitor angles, the strongest pick." },
  { id: "research", label: "Business research (P&R research_brand)", kind: "SCOUT", blurb: "Deep brand/business research the agent works from." },
  { id: "memes", label: "Meme packs (P&R creative)", kind: "MEME", blurb: "Meme concepts with TOP/BOTTOM copy and image scenes." },
  { id: "hooks", label: "Hooks & headlines", kind: "HOOK", blurb: "Scroll-stopping hooks, ranked, with the ship pick marked." },
  { id: "campaigns", label: "Campaign & social packs", kind: "CAMPAIGN", blurb: "Announcement post, memes, social posts and CTAs — drafts for approval." },
  { id: "qa", label: "QA & editing pass", kind: "QA", blurb: "Claude-grade review: flags the weak, returns a tightened final." },
  { id: "video", label: "Video lane (P&R engine)", kind: "VIDEO", blurb: "Engine video previews from a topic brief, delivered to the library." },
  { id: "assessor", label: "Assessment offer (bridge)", kind: "ASSESS", blurb: "Hands your own Muse the /before-pack + $999 assessment-offer run, on your credits." },
];

export function factoryToolById(id: string): FactoryTool | undefined {
  return FACTORY_TOOLS.find((t) => t.id === id);
}

/**
 * ─── AGENT ARCHITECT — pure core ───────────────────────────────────
 *
 * The SMB Agent Factory's architect turns a plain-English brief into
 * an agent config. This file holds the parts with no I/O: the tool
 * allowlist validation and the LLM-output parser. The architect may
 * only select tools from FACTORY_TOOLS (lib/agents.ts) — anything it
 * invents is stripped here, so a custom agent can never be installed
 * with a capability Whoparmy doesn't actually have. Kept import-light
 * (no server-only, no db) so it unit-tests under `node --test`.
 */

export interface AgentConfig {
  name: string;
  role: string;
  instructions: string;
  tools: FactoryTool[];
  defaultKind: string;
  successMetric: string;
  summary: string;
}

const NAME_MAX = 60;
const ROLE_MAX = 300;
const INSTRUCTIONS_MAX = 4_000;
const METRIC_MAX = 200;
const SUMMARY_MAX = 600;

/** Validate raw tool ids against the registry; dedupe, keep order. */
export function sanitizeToolIds(ids: unknown): FactoryTool[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: FactoryTool[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const tool = factoryToolById(raw.trim().toLowerCase());
    if (!tool || seen.has(tool.id)) continue;
    seen.add(tool.id);
    out.push(tool);
  }
  return out;
}

/** Serialize the tools a hire carries (HiredAgent.toolsJson). */
export function toolsToJson(tools: FactoryTool[]): string {
  return JSON.stringify(tools.map((t) => ({ id: t.id, label: t.label, kind: t.kind })));
}

/** Read a hire's toolsJson back into registry tools (unknown ids drop). */
export function toolsFromJson(json: string | null | undefined): FactoryTool[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ id?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    return sanitizeToolIds(parsed.map((p) => p?.id));
  } catch {
    return [];
  }
}

function clampText(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Parse the architect LLM's reply into a safe AgentConfig. The reply
 * should be strict JSON, but models wrap it in fences and prose —
 * extract the first {...} block. A reply with no usable name or no
 * valid tools falls back to a general custom agent built from the
 * member's own brief, so the factory never dead-ends the owner.
 */
export function parseArchitectConfig(raw: string, brief: string): AgentConfig {
  let obj: Record<string, unknown> = {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }

  const tools = sanitizeToolIds(obj.tools);
  const fallbackTools = tools.length > 0 ? tools : [FACTORY_TOOLS[0], FACTORY_TOOLS[4]]; // scout + campaigns
  const finalTools = tools.length > 0 ? tools : fallbackTools;

  const name = clampText(obj.name, NAME_MAX) || "Custom AI Employee";
  const role =
    clampText(obj.role, ROLE_MAX) ||
    `Works the job the owner described: ${brief.trim().slice(0, 160)}`;
  const instructions =
    clampText(obj.instructions, INSTRUCTIONS_MAX) ||
    `You are ${name}, an AI employee for the owner's business. The owner's brief: ${brief.trim().slice(0, 800)}\nWork each job brief concretely and specifically for this business. Use only facts the owner or the research provided — invent nothing. Everything you produce is a draft for the owner's approval: never claim to have published, sent, or contacted anything.`;
  // A custom agent's home kind is CUSTOM — its jobs run on its own
  // instructions. The only exceptions are the two lanes that are not
  // LLM passes at all: VIDEO (engine) and ASSESS (bridge handoff),
  // when the architect actually picked them.
  const defaultKindRaw = clampText(obj.defaultKind, 20).toUpperCase();
  const defaultKind =
    (defaultKindRaw === "VIDEO" || defaultKindRaw === "ASSESS") &&
    finalTools.some((t) => t.kind === defaultKindRaw)
      ? defaultKindRaw
      : "CUSTOM";

  return {
    name,
    role,
    instructions,
    tools: finalTools,
    defaultKind,
    successMetric: clampText(obj.successMetric, METRIC_MAX) || "Jobs delivered that the owner approves without major edits.",
    summary: clampText(obj.summary, SUMMARY_MAX) || role,
  };
}

/** The architect's system prompt (the interview is one shot in v1:
 *  brief + business research in, complete config out). */
export function architectSystemPrompt(): string {
  const toolLines = FACTORY_TOOLS.map((t) => `- "${t.id}" (${t.kind}): ${t.blurb}`).join("\n");
  return [
    "You are the Agent Architect inside Plunder & Riffle's Whoparmy — you design AI employees for small-business owners who know nothing about AI, APIs or prompts.",
    "From the owner's brief (and the business research when provided), design ONE agent that does the job. Reply with STRICT JSON only — no prose, no markdown fences:",
    '{"name": "short human name for the agent, e.g. Commercial Lead Researcher", "role": "one or two plain sentences: what this agent does for the business", "instructions": "the agent\'s standing instructions: who it is, the business it serves, exactly what it produces for each job brief, the standards it works to, and the rule that everything is a draft for the owner\'s approval — it never publishes, sends, buys or contacts anyone", "tools": ["ids from the tool list"], "defaultKind": "the job kind most jobs will use", "successMetric": "how the owner knows it is working, in their terms", "summary": "two sentences the owner reads before installing: what they are getting"}',
    "",
    "TOOLS — pick ONLY from these ids, and only what the job truly needs:",
    toolLines,
    "",
    "Rules: work only from facts in the brief and the research — invent no facts about the business. Keep the name under 40 characters. Instructions must be concrete enough that the agent can start work from a one-line job brief. If the brief asks for sending, publishing or contacting people, design the agent to DRAFT that work for the owner's approval and say so in the role and instructions — agents here never send or publish on their own.",
  ].join("\n");
}
