import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeVideoJob } from "@/lib/video-jobs";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getWhopUser();
  const { id } = await params;
  const job = await db.videoJob.findFirst({ where: { id, userId: user.id } });
  if (!job) return NextResponse.json({ error: "Video job not found" }, { status: 404 });
  return NextResponse.json({ job: serializeVideoJob(job) });
}
