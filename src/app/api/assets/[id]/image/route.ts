import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/assets/[id]/image — same-origin proxy for an asset's image.
 *
 * Engine meme images live on the engine's host, which sends no CORS
 * headers, so the browser cannot load them into a canvas (the PNG
 * download compositor failed with "Image failed to load"). The client
 * loads THIS url instead — same origin, canvas stays untainted. Only
 * the URL stored on the member's own asset is ever fetched: there is
 * no arbitrary-url parameter, so this is not an open proxy.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getWhopUser(); // authorization anchor
    const { id } = await params;
    const asset = await db.asset.findFirst({ where: { id, userId: user.id } });
    if (!asset?.imageUrl) {
      return NextResponse.json({ error: "Asset image not found." }, { status: 404 });
    }

    // Locally stored images are already same-origin — send the
    // browser straight to them.
    if (asset.imageUrl.startsWith("/")) {
      return NextResponse.redirect(new URL(asset.imageUrl, req.nextUrl.origin));
    }

    const upstream = new URL(asset.imageUrl);
    if (upstream.protocol !== "https:" && upstream.protocol !== "http:") {
      return NextResponse.json({ error: "Unsupported image location." }, { status: 400 });
    }

    const res = await fetch(upstream, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: "The image could not be fetched." }, { status: 502 });
    }

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image fetch failed." },
      { status: 500 },
    );
  }
}
