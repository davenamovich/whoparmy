import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { UpError, getUpConnection, upPost, type UpPostInput } from "@/lib/upload-post";

export const runtime = "nodejs";

/**
 * POST = publish (or schedule) one piece to the member's own
 * socials through their own Upload-Post key. This endpoint firing
 * IS the member's approve tap — the composer confirms the exact
 * accounts, caption and first comment before it calls here
 * (Dave's rule: posting only after the in-app approve tap; the
 * bridge token never gets this power).
 */
export async function POST(req: Request) {
  const user = await getWhopUser();
  const conn = await getUpConnection(user.id);
  if (!conn) return NextResponse.json({ error: "Connect your Upload-Post key first" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Partial<UpPostInput> | null;
  if (!body || typeof body.profile !== "string" || !Array.isArray(body.platforms) || typeof body.text !== "string") {
    return NextResponse.json({ error: "Missing profile, platforms or text" }, { status: 400 });
  }
  const kind = body.kind === "video" || body.kind === "photo" || body.kind === "text" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Unknown post kind" }, { status: 400 });
  try {
    const result = await upPost(conn.apiKey, {
      profile: body.profile,
      platforms: body.platforms.filter((p): p is string => typeof p === "string"),
      kind,
      mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : undefined,
      text: body.text,
      firstComment: typeof body.firstComment === "string" ? body.firstComment : undefined,
      scheduledDate: typeof body.scheduledDate === "string" ? body.scheduledDate : undefined,
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Posting failed." }, { status: 502 });
  }
}
