/**
 * Quiz option tables — client-safe (no server imports). The server
 * half (persistence) lives in lib/quiz.ts; the card renders from
 * here. See lib/quiz.ts for the design note.
 */

export const PROMOTING_OPTIONS = [
  { id: "business", label: "My business", hint: "I have a business — and a website for it", view: "create" },
  { id: "affiliate", label: "Products & offers", hint: "I promote other people's products for commission", view: "create" },
  { id: "creator", label: "My content", hint: "I'm a creator — posts, videos, a channel", view: "create" },
  { id: "clients", label: "Clients' businesses", hint: "I run marketing for other businesses", view: "agents" },
  { id: "idea", label: "Just an idea", hint: "Nothing live yet — I'm starting from an idea", view: "ralph" },
] as const;

export const AGENT_OPTIONS = [
  { id: "muse", label: "My own agent — Muse", hint: "Baby steps: one agent of mine that leads the crew" },
  { id: "agent37", label: "The full team — Agent37", hint: "A whole workforce of agents, around the clock" },
  { id: "self", label: "I'll drive the app myself", hint: "No agent for now — I'll use the tools directly" },
] as const;

export type PromotingId = (typeof PROMOTING_OPTIONS)[number]["id"];
export type AgentPathId = (typeof AGENT_OPTIONS)[number]["id"];

export function viewForPromoting(id: PromotingId | null): string {
  return PROMOTING_OPTIONS.find((o) => o.id === id)?.view ?? "create";
}
