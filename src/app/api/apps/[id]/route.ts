import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, isDesignatedOperator, UnauthorizedError } from "@/lib/auth";
import { cleanAppFields, isValidSlug, slugify, type AppFieldInput } from "@/lib/application";

export const runtime = "nodejs";

interface AppPatchBody extends AppFieldInput {
  slug?: string;
}

/** Load the app and enforce owner-or-operator, mirroring the
 *  agents/[id] PATCH rule (Whop Army 2.0, Slice 3). */
async function loadOwnedApp(id: string) {
  const user = await getWhopUser();
  const app = await db.application.findFirst({ where: { id } });
  if (!app) return { error: NextResponse.json({ error: "Application not found." }, { status: 404 }) };
  if (app.userId !== user.id && !isDesignatedOperator(user)) {
    return { error: NextResponse.json({ error: "This application belongs to another member." }, { status: 403 }) };
  }
  return { app };
}

/** Update one of your applications (owner or designated operator). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadOwnedApp(id);
    if ("error" in loaded) return loaded.error;

    const body = (await req.json()) as AppPatchBody;
    const cleaned = cleanAppFields(body, true);
    if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    const data: typeof cleaned.data & { slug?: string } = { ...cleaned.data };

    if (body.slug !== undefined) {
      const slug = typeof body.slug === "string" ? slugify(body.slug) : "";
      if (!isValidSlug(slug)) {
        return NextResponse.json({ error: "Slug must be 2–60 chars of lowercase letters, numbers and hyphens." }, { status: 400 });
      }
      const taken = await db.application.findFirst({ where: { slug, id: { not: id } }, select: { id: true } });
      if (taken) return NextResponse.json({ error: "That slug is already taken by another application." }, { status: 400 });
      data.slug = slug;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const app = await db.application.update({ where: { id }, data });
    return NextResponse.json({ app });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

/** Delete one of your applications (owner or designated operator). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loaded = await loadOwnedApp(id);
    if ("error" in loaded) return loaded.error;
    await db.application.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
