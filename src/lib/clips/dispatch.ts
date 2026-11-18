import type { ClipBrief } from "./brief";

/**
 * The dispatcher — the one piece the engine does not already have.
 *
 * What exists: P&R MCP renders (`create_sitdown`), and the engine provisions a
 * per-member Agent37 renderer instance and routes the work to it, billed to
 * that member's own Agent37 wallet. So there is no renderer to write.
 *
 * What is missing: nothing picks up a queued row in THIS app and issues the
 * call. That is all this is. Two phases per tick, so a tick is cheap:
 *
 *   1. POLL  — rows already rendering: ask the engine how it is going.
 *   2. CLAIM — a few queued rows: issue one `create_sitdown` each.
 *
 * Three turns per clip is the ceiling (MAX_TURNS_PER_CLIP in packs.ts). A tick
 * must never loop, never retry blindly, and never claim more than it can finish.
 */

export const MAX_CLAIMS_PER_TICK = 3;
export const MAX_POLLS_PER_TICK = 10;
export const MAX_ATTEMPTS = 2;

export interface DispatchJob {
  id: string;
  sourceUrl: string;
  clipSeconds: number;
  hook?: string | null;
  creditWho?: string | null;
  creditUrl?: string | null;
  spoiler?: boolean;
  attempts: number;
  engineJobId?: string | null;
}

export interface DispatchPage {
  niche: string;
  handle: string;
  disclosure?: string | null;
}

/** Arguments for `create_sitdown`, built exactly as the clipping agent expects. */
export function buildSitdownArgs(job: DispatchJob, page: DispatchPage) {
  const args: Record<string, unknown> = {
    clip: job.sourceUrl,
    video_style: "captions",
    clip_seconds: job.clipSeconds,
  };
  if (job.hook) args.hook = job.hook;
  if (job.spoiler) args.spoiler = true;
  if (job.creditWho && job.creditUrl) {
    args.credit = { who: job.creditWho, url: job.creditUrl };
  }
  // The page's own rules travel with the job: title carries the niche, and a
  // fan page's disclosure is the caller's business, not a default.
  if (page.disclosure) args.disclosure = page.disclosure;
  return args;
}

/**
 * A clip whose credit is missing cannot be rendered into something publishable,
 * so it is blocked before it costs a call — the engine would happily render it
 * and hand back a placeholder credit that the guard then refuses at approval.
 */
export function preflight(job: DispatchJob): { ok: true } | { ok: false; code: string; hint: string } {
  if (!job.creditWho || !job.creditUrl) {
    return {
      ok: false,
      code: "NO_CREDIT",
      hint: "No creator credit on this clip — rendering it now would only produce something the desk refuses.",
    };
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    return { ok: false, code: "ATTEMPTS", hint: `Failed ${job.attempts} times. Needs a human, not another try.` };
  }
  return { ok: true };
}

/** Engine status → our status. Unknown answers keep the row rendering. */
export function statusFromEngine(engine: {
  status?: string;
  pageUrl?: string | null;
  caption?: string | null;
  warnings?: string[];
  error?: string | null;
}): {
  status: "ready" | "failed" | "rendering";
  pageUrl?: string;
  caption?: string;
  warnings?: string[];
  error?: string;
} {
  const raw = (engine.status ?? "").toLowerCase();
  if (raw === "done" || raw === "complete" || raw === "completed" || engine.pageUrl) {
    if (!engine.pageUrl) return { status: "failed", error: "Engine finished without a preview page." };
    return {
      status: "ready",
      pageUrl: engine.pageUrl,
      caption: engine.caption ?? undefined,
      warnings: engine.warnings ?? [],
    };
  }
  if (raw === "failed" || raw === "error") {
    return { status: "failed", error: engine.error ?? "The engine reported a failure." };
  }
  return { status: "rendering" };
}

/**
 * Which rows to claim, in order. Oldest first so a page's queue drains the way
 * it was added, and only rows that can actually render.
 */
export function claimOrder(jobs: DispatchJob[]): DispatchJob[] {
  return jobs
    .filter((job) => job.attempts < MAX_ATTEMPTS)
    .slice(0, MAX_CLAIMS_PER_TICK);
}

/** The caption the desk shows, with the credit line it must carry. */
export function deskCaption(caption: string | null | undefined, job: DispatchJob): string {
  const body = (caption ?? "").trim();
  const credit = job.creditWho ? `🎬 ${job.creditWho}` : "🎬 credit missing";
  return [body, credit].filter(Boolean).join("\n\n");
}

/** A brief-shaped view of a stored job, for the engine's `hook` derivation. */
export function briefForJob(job: DispatchJob, page: DispatchPage): Pick<ClipBrief, "niche" | "clipSeconds"> {
  return { niche: page.niche, clipSeconds: job.clipSeconds };
}
