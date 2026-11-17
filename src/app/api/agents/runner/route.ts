import { NextResponse, after } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { runQueuedJobsForUser } from "@/lib/agent-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Drain the signed-in member's queued agent jobs. Jobs normally run
 * automatically the moment they're ordered; this exists to recover
 * jobs that queued while the Starimg key was missing from the app
 * environment — set the key, hit run, the queue drains.
 */
export async function POST() {
  try {
    const user = await getWhopUser();
    after(async () => {
      await runQueuedJobsForUser(user.id, 5).catch(() => {});
    });
    return NextResponse.json({ ok: true, note: "Runner started for your queued jobs — refresh the queue in a few seconds." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Runner failed to start" }, { status: 500 });
  }
}
