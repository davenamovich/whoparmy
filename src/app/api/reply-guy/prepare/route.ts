import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchXPost, parseXPostUrl, writeReplyDraft } from "@/lib/reply-guy";
import { generateEngineMeme } from "@/lib/engine";
import { assertMonthlyAllowance } from "@/lib/usage-server";
import { recordUsage } from "@/lib/pr-engine";

export const runtime = "nodejs";

/**
 * Reply Guy, step 1 (lib/reply-guy.ts): read the X post, write the
 * reply options, generate the meme. The meme runs on the house
 * engine lane and counts 1 against the member's monthly allowance,
 * exactly like a Create meme (failed generations never charged —
 * usage is recorded only after the meme exists). Nothing posts
 * here; step 2 is the member's click.
 */
export async function POST(req: Request) {
  const user = await getWhopUser();
  const body = (await req.json().catch(() => null)) as { postUrl?: unknown; headline?: unknown; hook?: unknown } | null;
  const postUrl = typeof body?.postUrl === "string" ? body.postUrl : "";
  const ref = parseXPostUrl(postUrl);
  if (!ref) return NextResponse.json({ error: "That doesn't look like an X post link" }, { status: 400 });

  const post = await fetchXPost(ref);
  if (!post) {
    return NextResponse.json(
      { error: "Couldn't read that post — it may be deleted, private, or X's reader is having a moment. Nothing was generated or charged." },
      { status: 502 },
    );
  }

  const allowance = await assertMonthlyAllowance(user.id, user.plan, 1);
  if (!allowance.ok) return NextResponse.json({ error: allowance.error }, { status: 402 });

  const brand = await db.brandProfile.findFirst({ where: { userId: user.id }, select: { name: true } }).catch(() => null);
  const draft = await writeReplyDraft({
    post,
    headline: typeof body?.headline === "string" ? body.headline : undefined,
    hook: typeof body?.hook === "string" ? body.hook : undefined,
    businessName: brand?.name ?? null,
  });

  let meme: { imageUrl: string; pageUrl: string };
  try {
    const made = await generateEngineMeme({
      brief: `Meme to post as a reply under @${post.author}'s X post about: ${post.text.slice(0, 200)}. Meme concept: ${draft.memeBrief}. Native to X, funny, shareable, no watermark.`,
      languageName: "English",
    });
    meme = { imageUrl: made.imageUrl, pageUrl: made.pageUrl };
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The meme engine didn't answer. Nothing was charged." },
      { status: 502 },
    );
  }
  await recordUsage(user.id, "IMAGE", 1, "reply-guy meme");

  return NextResponse.json(
    { post: { ...post, id: ref.id, url: postUrl }, options: draft.options, meme },
    { headers: { "Cache-Control": "no-store" } },
  );
}
