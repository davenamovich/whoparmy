import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { validateIntakeInput } from "@/lib/intake";
import { createIntake } from "@/lib/intake-server";

export const runtime = "nodejs";

/**
 * POST /api/intake — the logged-out homepage claim (SITE-REDO-SPEC
 * 2026-11-26 §4). Works logged-out by design: a Whop session only
 * stamps userId on the record when one exists. Validation lives in
 * lib/intake.ts; there is deliberately no GET — intake rows are
 * claims, not a public listing.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const validated = validateIntakeInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    let userId: string | null = null;
    try {
      const user = await getWhopUser();
      userId = user.id;
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) throw err;
      // Anonymous claim — the common case. Onboarding happens later,
      // in the member's own Muse, after they sign in.
    }

    const intake = await createIntake(validated.value, userId);
    return NextResponse.json({ intake }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Intake failed" }, { status: 500 });
  }
}
