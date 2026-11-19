import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { chatCompletion, parseJsonSafe, recordUsage } from "@/lib/pr-engine";
import { languageLabel } from "@/lib/languages";
import { assertMonthlyAllowance } from "@/lib/usage-server";
import { awardXp } from "@/lib/game";

export const runtime = "nodejs";
export const maxDuration = 120;

interface PackBody {
  title: string;
  product?: string;
  description: string;
  targetUrl?: string;
  audience?: string;
  languages: string[];
}

/**
 * P&R MCP content generation for a campaign mission: builds a
 * ready-to-review pack (announcement, meme captions, social posts, CTA)
 * in the mission's primary language. The owner approves before any
 * distribution happens.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as PackBody;

    if (!body.title?.trim() || !body.description?.trim()) {
      return NextResponse.json({ error: "Mission title and description are required to generate a content pack." }, { status: 400 });
    }

    // A mission content pack is a billed generation (one TEXT item) — the
    // same monthly allowance that gates campaign assets gates packs here.
    const allowance = await assertMonthlyAllowance(user.id, user.plan, 1);
    if (!allowance.ok) {
      return NextResponse.json(
        { error: allowance.error, code: "limit_reached", plan: allowance.plan.key, used: allowance.used, limit: allowance.limit },
        { status: 402 },
      );
    }

    const langs = (body.languages ?? ["en"]).filter((l) => typeof l === "string");
    const primary = langs[0] ?? "en";
    const primaryLabel = languageLabel(primary);

    const system = `You are P&R MCP, the content engine behind Meme Army mission campaigns.
Generate a ready-to-share campaign content pack for a Telegram mission announcement.
Language: write natively in ${primaryLabel} (code: ${primary}). Culturally adapt — never word-for-word.

The pack must contain exactly 6 items:
1. kind "ANNOUNCEMENT": the daily mission announcement (mission briefing, what members must do today, CTA) — 60-110 words, high energy, with a clear mission checklist.
2. kind "MEME": a meme caption idea — title = concept name, body = "TOP: <top text> | BOTTOM: <bottom text>" (max 60 chars each).
3. kind "MEME": a second, different meme caption idea.
4. kind "POST": a short social post members can adapt and share (max 80 words).
5. kind "POST": a one-liner share blurb for X/Twitter-style reposting (max 200 chars).
6. kind "CTA": 3 short call-to-action lines members can use, numbered in the body.

Respond with STRICT JSON only: {"items":[{"kind":string,"title":string,"body":string}]}`;

    const userPrompt = [
      `Campaign: ${body.title}`,
      body.product ? `Product/Offer: ${body.product}` : "",
      `Description: ${body.description}`,
      body.targetUrl ? `Link: ${body.targetUrl}` : "",
      body.audience ? `Audience: ${body.audience}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await chatCompletion(system, userPrompt).catch(async (err: unknown) => {
      // failed generations are never charged — and the usage write is
      // awaited, not floated: a fire-and-forget write raced the
      // response and could be lost when the invocation ended.
      await recordUsage(user.id, "FAILED", 1, "meme-army-pack");
      throw err;
    });
    const parsed = parseJsonSafe<{ items?: { kind?: string; title?: string; body?: string }[] }>(raw);
    if (!parsed?.items?.length) {
      await recordUsage(user.id, "FAILED", 1, "meme-army-pack:unreadable");
      return NextResponse.json({ error: "The engine returned an unreadable content pack. Try again." }, { status: 502 });
    }

    await recordUsage(user.id, "TEXT", 1, "meme-army-pack");
    // War Room: a generated pack is a real work event — it earns XP.
    // XP is a reward, never a gate: a failure here must not fail the pack.
    void awardXp(user.id, "PACK_GENERATED", body.title?.slice(0, 80)).catch(() => {});

    const items = parsed.items.slice(0, 6).map((it) => ({
      kind: (it.kind ?? "POST").toString().toUpperCase().slice(0, 16),
      title: (it.title ?? "").toString().slice(0, 140),
      body: (it.body ?? "").toString(),
    }));

    return NextResponse.json({ pack: items, language: primary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Pack generation failed: ${err.message}` : "Pack generation failed" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
