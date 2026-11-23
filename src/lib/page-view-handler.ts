import { classifyUserAgent, getReferrerHost, normalizePagePath, shouldRecordPageView } from "./page-views.ts";

export function createPageViewHandler(deps: {
  getMemberId: () => Promise<string | null>;
  write: (data: { path: string; referrerHost: string | null; userAgentClass: "mobile" | "desktop" | "bot" | "other"; memberId: string | null }) => Promise<void>;
  shouldRecord?: typeof shouldRecordPageView;
}) {
  return async function POST(request: Request) {
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
    const path = normalizePagePath((body as { path?: unknown } | null)?.path);
    if (!path) return Response.json({ ok: false }, { status: 400 });

    let memberId: string | null = null;
    try { memberId = await deps.getMemberId(); } catch { /* remain anonymous if session parsing fails */ }
    if (!(deps.shouldRecord ?? shouldRecordPageView)(memberId, path)) return new Response(null, { status: 204 });
    await deps.write({ path, referrerHost: getReferrerHost(request.headers.get("referer")), userAgentClass: classifyUserAgent(request.headers.get("user-agent")), memberId });
    return new Response(null, { status: 204 });
  };
}
