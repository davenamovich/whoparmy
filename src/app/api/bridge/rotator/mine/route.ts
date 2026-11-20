import { NextRequest, NextResponse } from "next/server";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
import { getMyRotator, updateMyRotator } from "@/lib/rotator-v2";
import { rotatorV2Enabled } from "@/lib/rotator-v2-core";

/**
 * The member's user rotator settings.
 * GET  — load this member's rotator and saved links.
 * PUT  — update settings and replace its link set after validation.
 */

export async function GET() {
  if (!rotatorV2Enabled(process.env)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const user = await getWhopUser();
    return NextResponse.json({ rotator: await getMyRotator(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load rotator" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!rotatorV2Enabled(process.env)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const user = await getWhopUser();
    const result = await updateMyRotator(user.id, await req.json());
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ rotator: await getMyRotator(user.id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update rotator" },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
