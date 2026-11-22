import { NextRequest, NextResponse } from "next/server";
import { serveAgentRotator } from "@/lib/rotator-v2";
import { rotatorV2Enabled } from "@/lib/rotator-v2-core";

/**
 * Serves an agent's signed rotator link.
 * GET — pick an eligible saved EngineLink and redirect to its URL.
 * ?ref=<refCode> sends the visitor to that member's own link for the
 * agent's offers (a MEMBERS pool); without it, the round robin.
 */

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  if (!rotatorV2Enabled(process.env)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { code } = await context.params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  const result = await serveAgentRotator(code, {
    ip,
    ua: req.headers.get("user-agent"),
    referer: req.headers.get("referer"),
  }, { ref: req.nextUrl.searchParams.get("ref") });

  return result
    ? NextResponse.redirect(result.url, 302)
    : new NextResponse("Not found", { status: 404 });
}
