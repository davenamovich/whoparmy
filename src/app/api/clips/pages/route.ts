import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/clips/pages — the desk's page setup.
 *
 * Same shape as `clip_page_setup` on the bridge; kept separate so the
 * human path never depends on an agent tool being allowlisted.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as {
      name?: string;
      handle?: string;
      niche?: string;
      disclosure?: string;
    };

    const name = body.name?.trim();
    const handle = body.handle?.trim();
    const niche = body.niche?.trim();

    if (!name || !handle || !niche) {
      return NextResponse.json(
        { error: "A page needs a name, a handle and the one angle it runs." },
        { status: 400 },
      );
    }

    const created = await db.clipPage.create({
      data: {
        userId: user.id,
        name,
        handle: handle.startsWith("@") ? handle : `@${handle}`,
        niche,
        disclosure: body.disclosure?.trim() || null,
      },
    });

    return NextResponse.json({
      id: created.id,
      name: created.name,
      handle: created.handle,
      niche: created.niche,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the page." },
      { status: 500 },
    );
  }
}
