import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";

export const runtime = "nodejs";

/**
 * GET /api/apps/public/{slug} — one public application as JSON
 * (Whop Army 2.0, Slice 3). 404 unless the application exists with
 * that slug AND its owner marked it public.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await db.application.findFirst({
    where: { slug, public: true },
    include: publicApplicationInclude,
  });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  return NextResponse.json({ app: serializePublicApplication(app, app.agent, app.user) });
}
