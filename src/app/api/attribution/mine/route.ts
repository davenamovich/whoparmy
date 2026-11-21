import { NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  aliasesForUser,
  maskIdentityValue,
  type IdentityDb,
} from "@/lib/identity";

export const runtime = "nodejs";

/**
 * GET /api/attribution/mine — the signed-in member's own identity
 * bindings (Spine A, 2026-11-21). Alias values are masked to the
 * last 4 characters (a Telegram id is an identifier, not a secret,
 * but there is no reason to echo the whole thing back). Reporting
 * dashboards are Spine C; this is the minimal read surface.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const [aliases, me] = await Promise.all([
      aliasesForUser(db as unknown as IdentityDb, user.id),
      db.user.findUnique({
        where: { id: user.id },
        select: { referredById: true },
      }),
    ]);
    return NextResponse.json({
      aliases: aliases.map((a) => ({
        kind: a.kind,
        value: maskIdentityValue(a.kind, a.value),
        verifiedAt: a.verifiedAt,
      })),
      referrerBound: Boolean(me?.referredById),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load identity links" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
