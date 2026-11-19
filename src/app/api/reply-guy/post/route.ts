import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { UpError, getUpConnection, upPost } from "@/lib/upload-post";

export const runtime = "nodejs";

/**
 * Reply Guy, step 2 — the one click. Posts the meme as a reply to
 * the original tweet through the member's own Upload-Post X
 * account (reply_to_id). This call firing IS the member's approve
 * tap; the dialog shows the exact account, text and image first.
 * Known provider caveat (Upload-Post docs): X can 403 a reply when
 * the account has never engaged with that author — the error is
 * surfaced verbatim so the member knows it isn't us.
 */
export async function POST(req: Request) {
  const user = await getWhopUser();
  const conn = await getUpConnection(user.id);
  if (!conn) return NextResponse.json({ error: "Connect your Upload-Post key first" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { profile?: unknown; postId?: unknown; text?: unknown; imageUrl?: unknown } | null;
  const profile = typeof body?.profile === "string" ? body.profile : "";
  const postId = typeof body?.postId === "string" ? body.postId : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : "";
  if (!profile || !/^\d{5,}$/.test(postId) || !text || !imageUrl) {
    return NextResponse.json({ error: "Missing profile, post, text or meme image" }, { status: 400 });
  }
  if (text.length > 280) return NextResponse.json({ error: "Reply is over 280 characters — trim it first" }, { status: 400 });
  try {
    const result = await upPost(conn.apiKey, {
      profile,
      platforms: ["x"],
      kind: "photo",
      mediaUrl: imageUrl,
      text,
      replyToId: postId,
    });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "The reply didn't post." }, { status: 502 });
  }
}
