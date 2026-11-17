import { NextResponse } from "next/server";
import { whopPublicStatus } from "@/lib/whop";

export const runtime = "nodejs";

/**
 * GET /api/whop/status — public integration status (booleans + public
 * checkout links; API keys and webhook secrets are never returned).
 */
export async function GET() {
  return NextResponse.json(whopPublicStatus());
}
