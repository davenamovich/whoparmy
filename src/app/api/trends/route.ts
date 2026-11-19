import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getTrending } from "@/lib/trends";
import { isSupportedLanguage } from "@/lib/languages";

export const runtime = "nodejs";

/** The day's default topics: trending topics with viral headlines,
 *  settled once per ET day (see lib/trends.ts) so refreshes serve
 *  the same set instead of reloading the wire. Any signed-in member
 *  can read it — it's the lobby that feeds one-click creation.
 *  Headlines come back in the requested content language (Dave's
 *  rule: selected language out). */
export async function GET(req: NextRequest) {
  try {
    await getWhopUser();
    const langParam = req.nextUrl.searchParams.get("lang") ?? "en";
    const lang = isSupportedLanguage(langParam) ? langParam : "en";
    const { topics, updatedAt } = await getTrending(lang);
    return NextResponse.json({ topics, updatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load trending" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
