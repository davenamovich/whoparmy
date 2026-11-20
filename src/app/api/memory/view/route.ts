import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { MemoryUnavailableError, mnemosExport, mnemosPersonFor } from "@/lib/mnemos-bridge";

export const runtime = "nodejs";

/**
 * GET /api/memory/view — the member's Mnemos facts as JSON, for the
 * agent control center's Memory tab (SMB Agent Factory, 2026-11-18).
 * Memory is per-MEMBER, shared by all their agents (Dave's rule:
 * one Mnemos per member, not per bot) — the tab says so honestly.
 * The download stays at /api/memory/export; this is the read view.
 *
 * `status` keeps apart the states the tab must not blur together:
 *   "ok"           facts below are the member's memory
 *   "empty"        the store answered and holds nothing yet
 *   "unconfigured" memory isn't switched on for this deployment
 *   "unavailable"  the store couldn't be read right now — NOT empty
 * `available` is kept for older clients: true only when facts exist.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    try {
      const facts = await mnemosExport(mnemosPersonFor(user.id));
      return NextResponse.json({
        status: facts.length > 0 ? "ok" : "empty",
        available: facts.length > 0,
        facts: facts.slice(0, 100),
      });
    } catch (err) {
      if (!(err instanceof MemoryUnavailableError)) throw err;
      console.warn("[memory view] unavailable:", err.reason);
      return NextResponse.json({
        status: err.reason === "unconfigured" ? "unconfigured" : "unavailable",
        available: false,
        facts: [],
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Memory couldn't be read" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
