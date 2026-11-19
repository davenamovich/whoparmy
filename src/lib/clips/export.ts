/**
 * Export — the one path from `approved` to a file, and it cannot be walked
 * twice.
 *
 * Three things have to agree before an MP4 exists:
 *   1. the clip is `approved` with a preview (lib/clips/guards.ts),
 *   2. an unspent, unexpired export token exists for that exact clip,
 *   3. the engine reports the MP4 job finished.
 *
 * The token is the interesting part. It is minted by the human approval click,
 * stored hashed, marked spent the moment it is used, and it is bound to one
 * clip — so an approved clip cannot be exported by replaying a request, and an
 * agent cannot export at all because no tool mints or spends one.
 */

export interface ExportableClip {
  status: string;
  pageUrl?: string | null;
  mp4Url?: string | null;
}

export function canExport(clip: ExportableClip): { ok: true } | { ok: false; reason: string } {
  if (clip.mp4Url) return { ok: false, reason: "Already exported — the file link is on the card." };
  if (clip.status === "exporting") return { ok: false, reason: "Already rendering the MP4." };
  if (clip.status !== "approved") {
    return {
      ok: false,
      reason:
        clip.status === "ready"
          ? "Not approved yet. Approve it at /clips first — that is what mints the export token."
          : `This clip is ${clip.status}. Only an approved clip exports.`,
    };
  }
  if (!clip.pageUrl) return { ok: false, reason: "Approved but no preview exists. Render it again." };
  return { ok: true };
}

export interface ExportTokenRow {
  expiresAt: Date;
  usedAt?: Date | null;
}

export function tokenIsUsable(row: ExportTokenRow | null | undefined, now: Date = new Date()): boolean {
  if (!row) return false;
  if (row.usedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

/**
 * The engine's MP4 answer → our state. `done` without a URL is a failure for the
 * same reason a sit-down without a preview is: there is nothing to hand over.
 */
export function mp4State(engine: {
  status?: string;
  mp4Url?: string;
  mp4_url?: string;
  url?: string;
  error?: string | null;
}): { status: "exported" | "exporting" | "failed"; url?: string; error?: string } {
  const raw = (engine.status ?? "").toLowerCase();
  const url = engine.mp4Url ?? engine.mp4_url ?? engine.url;

  if (raw === "failed" || raw === "error") {
    return { status: "failed", error: engine.error ?? "The engine reported a failed render." };
  }
  if (url) return { status: "exported", url };
  if (raw === "done" || raw === "complete" || raw === "completed") {
    return { status: "failed", error: "The engine finished without an MP4 link." };
  }
  return { status: "exporting" };
}

/** What the member is told, in words that do not promise a file. */
export function exportMessage(state: "started" | "exported" | "exporting" | "failed"): string {
  switch (state) {
    case "started":
      return "Rendering the MP4. The card updates when the file is ready.";
    case "exported":
      return "Done — the MP4 link is on the card.";
    case "exporting":
      return "Still rendering. Check the card in a minute.";
    case "failed":
      return "The render failed. Nothing was charged twice; try again, or export from the preview page.";
  }
}
