import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import { serializeBrand } from "@/lib/serialize";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;

    const brand = await db.brandProfile.findFirst({ where: { id, userId: user.id } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) || null : undefined);
    const updated = await db.brandProfile.update({
      where: { id },
      data: {
        ...(str(body.name, 120) !== undefined ? { name: str(body.name, 120)! } : {}),
        ...(str(body.website) !== undefined ? { website: str(body.website) } : {}),
        ...(str(body.industry) !== undefined ? { industry: str(body.industry) } : {}),
        ...(str(body.description) !== undefined ? { description: str(body.description) } : {}),
        ...(str(body.products) !== undefined ? { products: str(body.products) } : {}),
        ...(str(body.audience) !== undefined ? { audience: str(body.audience) } : {}),
        ...(str(body.voice) !== undefined ? { voice: str(body.voice) } : {}),
        ...(str(body.cta) !== undefined ? { cta: str(body.cta) } : {}),
        ...(str(body.links) !== undefined ? { links: str(body.links) } : {}),
        ...(Array.isArray(body.languages) ? { languages: JSON.stringify(body.languages) } : {}),
        ...(body.research && typeof body.research === "object"
          ? { researchJson: JSON.stringify(body.research).slice(0, 60_000) }
          : {}),
      },
    });
    return NextResponse.json({ brand: serializeBrand(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update brand" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const brand = await db.brandProfile.findFirst({ where: { id, userId: user.id } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    await db.brandProfile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete brand" }, { status: 500 });
  }
}
