// Agent handoff (Dave, 2026-11-19): the manual studios are gone —
// content starts as a job handed to the member's own agent, never
// as a form the member fills in by hand. This helper finds the
// member's Meme Smith and queues a MEME job with the given brief.
// Used by Trending's headline button and by Ralph's topic taps.

export interface HandoffResult {
  ok: boolean;
  /** True when the member has no Meme Smith on their floor at all. */
  noAgent?: boolean;
  message: string;
}

interface HireLike {
  id: string;
  templateKey?: string;
  status?: string;
}

export async function handBriefToMemeSmith(brief: string, pieces = 3): Promise<HandoffResult> {
  try {
    const res = await fetch("/api/agents", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) return { ok: false, message: json.error ?? "Could not load your agents." };
    const hires: HireLike[] = json.hires ?? [];
    const smith =
      hires.find((h) => h.templateKey === "meme-smith" && h.status === "ACTIVE") ??
      hires.find((h) => h.templateKey === "meme-smith" && h.status !== "PAUSED");
    if (!smith) {
      return {
        ok: false,
        noAgent: true,
        message: "No Meme Smith on your floor yet — set one up and trends become one-tap jobs.",
      };
    }
    const job = await fetch(`/api/agents/${smith.id}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "MEME", brief, pieces }),
    });
    const jobJson = (await job.json().catch(() => ({}))) as { error?: string };
    if (!job.ok) return { ok: false, message: jobJson.error ?? "Your Meme Smith could not take that job." };
    return { ok: true, message: "Handed to your Meme Smith — the pack lands in your Library when it's done." };
  } catch {
    return { ok: false, message: "Could not reach your agents — try again in a moment." };
  }
}
