import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { RALPH_MENU, ralphAction, ralphActions, ralphFreeText, ralphGreeting, type RalphActionId } from "@/lib/ralph";

export const runtime = "nodejs";

/**
 * ─── RALPH CHAT API ─────────────────────────────────────────────────
 * GET  → greeting (brand + memory aware) + the full action menu.
 * POST → { actionId } runs a deterministic dispatcher action;
 *        { text } runs the free-text brain (Starimg, menu-bound).
 * Every reply carries the next one-click actions — no dead ends.
 * Ralph can navigate and summarize; publishing/sending/spending are
 * not reachable from this route.
 */

function localeOf(req: NextRequest, body?: { locale?: string }): string {
  const raw = body?.locale ?? req.nextUrl.searchParams.get("locale") ?? "en";
  return ["en", "es", "ja", "ru"].includes(raw) ? raw : "en";
}

export async function GET(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const locale = localeOf(req);
    const greeting = await ralphGreeting(user.id, locale);
    return NextResponse.json({ reply: greeting, menu: ralphActions(locale) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ralph is unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as {
      actionId?: string;
      text?: string;
      locale?: string;
      history?: { role: string; text: string }[];
    };
    const locale = localeOf(req, body);
    if (body.actionId) {
      if (!(RALPH_MENU as string[]).includes(body.actionId)) {
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
      }
      const reply = await ralphAction(user.id, locale, body.actionId as RalphActionId);
      return NextResponse.json({ reply, menu: ralphActions(locale) });
    }
    const text = (body.text ?? "").trim().slice(0, 2000);
    if (!text) {
      return NextResponse.json({ error: "Say something, or tap a button." }, { status: 400 });
    }
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const reply = await ralphFreeText(user.id, locale, text, history);
    return NextResponse.json({ reply, menu: ralphActions(locale) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ralph is unavailable" }, { status: 500 });
  }
}
