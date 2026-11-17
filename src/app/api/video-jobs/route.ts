import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import {
  startVideoJob,
  serializeVideoJob,
  VIDEO_FORMATS,
  type VideoFormat,
} from "@/lib/video-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Video jobs (Dave, 2026-11-17): members start engine video-format
 * previews (sitdown family, funnel, scroll, infomercial, follow-up)
 * that run in the background and land in their library. Charged steps
 * cost 1 bridge credit each (reconciled live); scroll + infomercial
 * previews are free. MP4 rendering is NOT exposed here — it stays
 * behind the existing approval rules.
 */

const FUNNEL_FORMATS = ["captions", "memes", "stickfigures", "bestof"];
const FOLLOWUP_FORMATS = ["meme", "slideshow", "hottake", "imessage"];

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v) && v.length <= 500;
}

export async function GET() {
  const user = await getWhopUser();
  const jobs = await db.videoJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  // Source lists for the contextual actions (scroll / infomercial /
  // follow-up pick from the member's own finished jobs).
  const sources = await db.videoJob.findMany({
    where: { userId: user.id, status: "DONE", engineJobId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, format: true, engineJobId: true, pageUrl: true, createdAt: true },
  });
  return NextResponse.json({
    jobs: jobs.map(serializeVideoJob),
    sources: sources.map((s) => ({
      id: s.id,
      format: s.format,
      engineJobId: s.engineJobId,
      pageUrl: s.pageUrl,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getWhopUser();
  const body = (await req.json().catch(() => null)) as {
    format?: string;
    params?: Record<string, unknown>;
  } | null;
  const format = body?.format as VideoFormat;
  const params = (body?.params ?? {}) as Record<string, unknown>;
  if (!format || !(VIDEO_FORMATS as readonly string[]).includes(format)) {
    return bad("Unknown video format.");
  }

  // Resolve contextual sources server-side: the client names one of
  // the member's own finished VideoJobs; the engine id never comes
  // from client input.
  async function resolveSource(expected: VideoFormat[]): Promise<string | null> {
    const sourceId = typeof params.sourceJobId === "string" ? params.sourceJobId : "";
    if (!sourceId) return null;
    const src = await db.videoJob.findFirst({
      where: { id: sourceId, userId: user.id, status: "DONE" },
      select: { format: true, engineJobId: true },
    });
    if (!src?.engineJobId || !expected.includes(src.format as VideoFormat)) return null;
    return src.engineJobId;
  }

  switch (format) {
    case "RIDICULOUS": {
      if (typeof params.topic !== "string" || !params.topic.trim()) return bad("A topic is required.");
      params.topic = params.topic.slice(0, 400);
      break;
    }
    case "BEST_OF": {
      const links = Array.isArray(params.links) ? params.links.filter(isHttpUrl) : [];
      if (links.length < 1 || links.length > 5) {
        return bad("Give 1–5 links — single meme pages or direct media (.mp4/.gif/.png). Pack pages can't play in a reel.");
      }
      params.links = links;
      break;
    }
    case "NEWS": {
      if (typeof params.topic !== "string" && typeof params.mode !== "string") {
        return bad("Pick a news mode or give a topic.");
      }
      break;
    }
    case "PRESENT": {
      if (typeof params.topic !== "string" && typeof params.script !== "string") {
        return bad("Give a topic or a script.");
      }
      break;
    }
    case "BEFORE_PACK": {
      if (typeof params.input !== "string" || !params.input.trim()) {
        return bad("Give the business website or a sentence about it.");
      }
      params.input = params.input.slice(0, 1500);
      break;
    }
    case "FUNNEL": {
      if (!isHttpUrl(params.url)) return bad("Give the offer link (http/https).");
      if (typeof params.format !== "string" || !FUNNEL_FORMATS.includes(params.format)) {
        return bad("Pick a funnel format: captions, memes, stickfigures or bestof.");
      }
      break;
    }
    case "SCROLL":
    case "INFOMERCIAL": {
      const engineJobId = await resolveSource(["BEFORE_PACK"]);
      if (!engineJobId) return bad("Pick one of your finished Before packs as the source.");
      params.job_id = engineJobId;
      delete params.sourceJobId;
      break;
    }
    case "FOLLOWUP": {
      if (typeof params.format !== "string" || !FOLLOWUP_FORMATS.includes(params.format)) {
        return bad("Pick a follow-up format: meme, slideshow, hottake or imessage.");
      }
      const sitdownId = await resolveSource(["BEST_OF", "RIDICULOUS", "NEWS", "PRESENT"]);
      if (sitdownId) {
        params.job_id = sitdownId;
      } else {
        const packId = await resolveSource(["BEFORE_PACK"]);
        if (!packId) return bad("Pick one of your finished video jobs or Before packs as the source.");
        params.source_id = packId;
      }
      delete params.sourceJobId;
      break;
    }
  }

  const job = await startVideoJob(user.id, format, params);
  return NextResponse.json({ job: serializeVideoJob(job) });
}
