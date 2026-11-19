import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestXTopics, type TrendTopic } from "@/lib/trends";

export const runtime = "nodejs";

/**
 * POST the day's X-sourced trending topics (lib/trends.ts "X lane").
 * Caller: Muse's daily X-trends job — it finds the posts moving on
 * X for small-business owners, verifies them with FxTwitter reads,
 * and sends finished topics. Auth: the shared TRENDS_INGEST_KEY in
 * the x-trends-key header (503 until configured, 401 on mismatch) —
 * the same arming pattern as the claim bridge. Body: { topics } in
 * TrendTopic shape; fields are clamped, never trusted.
 */

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clamp = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const clampOrNull = (v: unknown, max: number): string | null => {
  const s = clamp(v, max);
  return s ? s : null;
};

export async function POST(req: Request) {
  const expected = process.env.TRENDS_INGEST_KEY?.trim() ?? "";
  if (!expected) {
    return NextResponse.json({ error: "X trends ingest is not configured" }, { status: 503 });
  }
  const given = req.headers.get("x-trends-key") ?? "";
  if (!keyMatches(given, expected)) {
    return NextResponse.json({ error: "Invalid ingest key" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { topics?: unknown } | null;
  if (!body || !Array.isArray(body.topics)) {
    return NextResponse.json({ error: "Body must be { topics: [...] }" }, { status: 400 });
  }
  const topics: TrendTopic[] = [];
  for (const raw of body.topics.slice(0, 14)) {
    const t = (raw ?? {}) as Record<string, unknown>;
    const title = clamp(t.title, 200);
    const link = clamp(t.link, 500);
    if (!title || !/^https:\/\/(x\.com|twitter\.com)\//.test(link)) continue; // X posts only
    topics.push({
      title,
      traffic: clampOrNull(t.traffic, 40),
      source: clamp(t.source, 80) || "X",
      link,
      publishedAt: clampOrNull(t.publishedAt, 60),
      headline: clamp(t.headline, 140) || title,
      hook: clamp(t.hook, 200),
    });
  }
  if (topics.length === 0) {
    return NextResponse.json({ error: "No valid X topics in the payload" }, { status: 400 });
  }
  await ingestXTopics(topics);
  return NextResponse.json({ ok: true, stored: topics.length }, { headers: { "Cache-Control": "no-store" } });
}
