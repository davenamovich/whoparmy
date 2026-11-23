import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOperator } from "@/lib/site-gate";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

/**
 * Admin credit grants (Dave, 2026-11-18): a designated operator can
 * add generation credits to any user — including themselves. Credits
 * land in User.freeGenBalance, the same pool referral rewards pay
 * into: generations beyond the plan's monthly cap draw it down
 * (lib/usage-server.ts). Designated-operator session only; everyone
 * else gets a 404, matching the other /api/admin routes.
 */

const MAX_GRANT = 100_000;

export async function GET() {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, name: true, email: true, plan: true, freeGenBalance: true },
  });
  return NextResponse.json(
    { operatorId: operator.id, users },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; email?: unknown; amount?: unknown };
  const amount = typeof body.amount === "number" ? Math.floor(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_GRANT) {
    return NextResponse.json({ error: `Amount must be a whole number between 1 and ${MAX_GRANT}.` }, { status: 400 });
  }
  const target =
    typeof body.userId === "string" && body.userId
      ? await db.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, email: true } })
      : typeof body.email === "string" && body.email
        ? await db.user.findUnique({ where: { email: body.email.trim().toLowerCase() }, select: { id: true, name: true, email: true } })
        : null;
  if (!target) return NextResponse.json({ error: "User not found — pass a userId or an exact account email." }, { status: 404 });

  const updated = await db.$transaction(async (tx) => {
    await tx.creditGrant.create({ data: { userId: target.id, source: "admin", externalId: `admin:${randomUUID()}`, amount } });
    return tx.user.update({ where: { id: target.id }, data: { freeGenBalance: { increment: amount } }, select: { freeGenBalance: true } });
  });
  return NextResponse.json(
    { ok: true, granted: amount, user: target, balance: updated.freeGenBalance, grantedBy: operator.id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
