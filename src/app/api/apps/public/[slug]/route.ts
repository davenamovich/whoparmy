import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";
import { getHandoutAccess } from "@/lib/free-day-server";
import { verifyAnyBridgeToken } from "@/lib/muse-bridge";

export const runtime = "nodejs";

/**
 * GET /api/apps/public/{slug} — one public application as JSON
 * (Whop Army 2.0, Slice 3). 404 unless the application exists with
 * that slug AND its owner marked it public.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await db.application.findFirst({
    where: { slug, public: true },
    include: publicApplicationInclude,
  });
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const bearer = /^Bearer\s+(\S+)$/i.exec((req.headers.get("authorization") ?? "").trim())?.[1];
  const credential = app.handoutOptIn && bearer ? await verifyAnyBridgeToken(bearer) : null;
  const userId = credential?.kind === "spend" ? credential.session.user.id : credential?.userId ?? null;
  return NextResponse.json({ app: serializePublicApplication(app, app.agent, app.user), handout: await getHandoutAccess(app, userId) }, { headers: { "Cache-Control": "no-store" } });
}
