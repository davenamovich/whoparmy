import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionOperator } from "@/lib/site-gate";
import { serializeGiftInvite, validateGiftInviteStatus } from "@/lib/gift-invite-core";

export const runtime = "nodejs";

/**
 * Manual status moves for a gift-lane invite (draft → ready →
 * handed_over → exhausted / revoked), set by the operator by hand —
 * the lane is not launched, so nothing transitions automatically.
 * Designated-operator session only; everyone else gets a 404.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const operator = await getSessionOperator();
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const validated = validateGiftInviteStatus(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const existing = await db.giftInvite.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const updated = await db.giftInvite.update({ where: { id }, data: { status: validated.status } });
  return NextResponse.json(
    { ok: true, invite: serializeGiftInvite(updated) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
