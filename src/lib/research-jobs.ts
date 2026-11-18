import "server-only";
import { db } from "./db";
import { runBrandAnalysis } from "./brand-research";
import { mnemosCapture, mnemosPersonFor } from "./mnemos-bridge";
import type { AnalyzeResponse } from "./types";

/**
 * Background brand-research jobs. research_brand takes ~2 minutes —
 * too long for one blocking HTTP request (proxy caps, impatient
 * members, lost work on refresh). POST creates a row and returns
 * immediately; the work runs detached in this server process (a
 * Railway container does not freeze after the response); clients poll
 * the job until done. A redeploy mid-job orphans the row in "running"
 * — reads sweep anything running longer than STALE_MS to failed.
 */

const STALE_MS = 7 * 60 * 1000; // research caps at ~4 min + profile build

export interface ResearchJobView {
  id: string;
  brandName: string;
  website: string;
  status: "running" | "done" | "failed";
  result?: AnalyzeResponse;
  error?: string;
  createdAt: number;
  elapsedSec: number;
}

type JobRow = {
  id: string;
  brandName: string;
  website: string;
  status: string;
  resultJson: string | null;
  error: string | null;
  createdAt: Date;
};

function toView(job: JobRow): ResearchJobView {
  const view: ResearchJobView = {
    id: job.id,
    brandName: job.brandName,
    website: job.website,
    status: job.status as ResearchJobView["status"],
    createdAt: job.createdAt.getTime(),
    elapsedSec: Math.max(0, Math.round((Date.now() - job.createdAt.getTime()) / 1000)),
  };
  if (job.status === "done" && job.resultJson) {
    try {
      view.result = JSON.parse(job.resultJson) as AnalyzeResponse;
    } catch {
      view.status = "failed";
      view.error = "The research result could not be read back. Please run it again.";
    }
  }
  if (job.status === "failed" && job.error) view.error = job.error;
  return view;
}

async function sweepStale(job: JobRow): Promise<JobRow> {
  if (job.status === "running" && Date.now() - job.createdAt.getTime() > STALE_MS) {
    const updated = await db.researchJob.update({
      where: { id: job.id },
      data: { status: "failed", error: "Research timed out before it could finish. Please run it again." },
    });
    return updated as JobRow;
  }
  return job;
}

/** Start a job, or return the one already running for this member + site. */
export async function startResearchJob(params: {
  userId: string;
  brandName: string;
  website: string;
}): Promise<ResearchJobView> {
  const running = await db.researchJob.findFirst({
    where: { userId: params.userId, website: params.website, status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (running) {
    const swept = await sweepStale(running as JobRow);
    if (swept.status === "running") return toView(swept);
  }

  const job = await db.researchJob.create({
    data: { userId: params.userId, brandName: params.brandName, website: params.website, status: "running" },
  });

  // Detached: the response returns now; the container keeps working.
  void (async () => {
    try {
      const result = await runBrandAnalysis(params.brandName, params.website);
      await db.researchJob.update({
        where: { id: job.id },
        data: { status: "done", resultJson: JSON.stringify(result) },
      });
      // Learn from the deep dive (Dave, 2026-11-18): the distilled
      // research lands in the member's Mnemos scope, so Ralph, the
      // bots and the AI assessment all work from the same findings
      // instead of re-deriving them. Awaited inside this detached
      // block; a memory outage never fails the research itself.
      if (result.researched && result.research) {
        const r = result.research;
        const lines = [
          `Deep research on ${params.brandName} (${params.website}):`,
          r.analysisSummary ? `Summary: ${r.analysisSummary}` : null,
          r.offer ? `Offer: ${r.offer}` : null,
          r.audience ? `Audience: ${r.audience}` : null,
          r.pains.length ? `Customer pains: ${r.pains.join("; ")}` : null,
          r.angles.length ? `Content angles: ${r.angles.join("; ")}` : null,
          r.competitors.length ? `Competitors: ${r.competitors.join(", ")}` : null,
        ].filter(Boolean);
        await mnemosCapture(
          mnemosPersonFor(params.userId),
          lines.join("\n").slice(0, 1800),
          `Brand deep research for ${params.brandName}`,
        ).catch(() => false);
      }
    } catch (err) {
      await db.researchJob
        .update({
          where: { id: job.id },
          data: {
            status: "failed",
            error: err instanceof Error ? err.message : "Research failed. Please try again.",
          },
        })
        .catch(() => undefined);
    }
  })();

  return toView(job as JobRow);
}

export async function getResearchJob(userId: string, jobId: string): Promise<ResearchJobView | null> {
  const job = await db.researchJob.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;
  return toView(await sweepStale(job as JobRow));
}

/** The member's most recent job for a website — lets a reopened dialog resume. */
export async function latestResearchJob(userId: string, website: string): Promise<ResearchJobView | null> {
  const job = await db.researchJob.findFirst({
    where: { userId, website },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return null;
  return toView(await sweepStale(job as JobRow));
}
