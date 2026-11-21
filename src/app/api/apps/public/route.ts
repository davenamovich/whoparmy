import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publicApplicationInclude, serializePublicApplication } from "@/lib/application";

export const runtime = "nodejs";

/**
 * GET /api/apps/public — the public applications showcase as JSON
 * (Whop Army 2.0, Slice 3). Only applications the owner marked
 * public, only through serializePublicApplication. This is the read
 * API Muse and external agents use for discovery.
 */
export async function GET() {
  const apps = await db.application.findMany({
    where: { public: true },
    orderBy: [{ createdAt: "desc" }],
    include: publicApplicationInclude,
  });
  return NextResponse.json({ apps: apps.map((app) => serializePublicApplication(app, app.agent, app.user)) });
}
