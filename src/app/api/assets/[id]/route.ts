import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { serializeAsset } from "@/lib/serialize";
import { deleteMemeImage } from "@/lib/pr-engine";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { title?: string; body?: string; topText?: string; bottomText?: string };

    const asset = await db.asset.findFirst({ where: { id, userId: user.id } });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const updated = await db.asset.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.slice(0, 160) } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.topText !== undefined ? { topText: body.topText.slice(0, 90) } : {}),
        ...(body.bottomText !== undefined ? { bottomText: body.bottomText.slice(0, 90) } : {}),
      },
    });
    return NextResponse.json({ asset: serializeAsset(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update asset" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser();
    const { id } = await ctx.params;

    const asset = await db.asset.findFirst({ where: { id, userId: user.id } });
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    if (asset.type === "MEMES") await deleteMemeImage(asset.imageUrl);
    await db.asset.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete asset" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
