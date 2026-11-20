import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getMemberLanguage, setMemberLanguage } from "@/lib/member-language";

export const runtime = "nodejs";

/**
 * The member's language (Global expansion Phase 0): GET resolves
 * pick → UI-locale cookie → English; POST stores the explicit pick.
 * Every surface that speaks for the member reads this — agent jobs,
 * bridge briefs, Day-1 prompts, stack launches.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const hint = (await cookies()).get("NEXT_LOCALE")?.value ?? null;
    return NextResponse.json({ language: await getMemberLanguage(user.id, hint) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load your language" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { language?: string };
    if (!body.language || !(await setMemberLanguage(user.id, body.language))) {
      return NextResponse.json({ error: "Pick one of the 23 supported languages." }, { status: 400 });
    }
    return NextResponse.json({ language: await getMemberLanguage(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your language" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
