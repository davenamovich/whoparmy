import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { mnemosExport, mnemosPersonFor } from "@/lib/mnemos-bridge";

export const runtime = "nodejs";

/**
 * GET /api/memory/view — the member's Mnemos facts as JSON, for the
 * agent control center's Memory tab (SMB Agent Factory, 2026-11-18).
 * Memory is per-MEMBER, shared by all their agents (Dave's rule:
 * one Mnemos per member, not per bot) — the tab says so honestly.
 * The download stays at /api/memory/export; this is the read view.
 * Degrades to {available:false} when the bridge isn't configured.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const facts = await mnemosExport(mnemosPersonFor(user.id)).catch(() => [] as string[]);
    return NextResponse.json({ available: facts.length > 0, facts: facts.slice(0, 100) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Memory couldn't be read" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
