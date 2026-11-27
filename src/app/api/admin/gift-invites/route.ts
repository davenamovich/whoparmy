import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { getSessionOperator } from "@/lib/site-gate";
import { serializeGiftInvite, validateGiftInviteInput } from "@/lib/gift-invite-core";

export const runtime = "nodejs";

/**
 * Gift-lane invites (Dave, 2026-11-27) — ADMIN ONLY, NOT LAUNCHED.
 *
 * An operator creates a draft record for a named recipient + Starimg
 * token tier (1M / 10M) + the Starimg sub-key that will serve it,
 * recorded BY REFERENCE ONLY (cabinet sub-key name + account label +
 * cap — see lib/gift-invite-core.ts; a raw key value is never accepted
 * or stored). Nothing here sends, emails, or grants anything; invites
 * exist so the key assignment is figured out and recorded before the
 * lane launches. Designated-operator session only; everyone else gets
 * a 404, matching the other /api/admin routes.
 */

export async function GET() {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const invites = await db.giftInvite.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json(
    { invites: invites.map(serializeGiftInvite) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const validated = validateGiftInviteInput(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const invite = await db.giftInvite.create({
    data: {
      code: `gift_${randomBytes(9).toString("hex")}`,
      ...validated.value,
      status: "draft",
      createdById: operator.id,
    },
  });
  return NextResponse.json(
    { ok: true, invite: serializeGiftInvite(invite) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
