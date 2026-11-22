export const runtime = "nodejs";

/** Member Barry launcher retired. The house Barry remains available through /api/admin/launch. */
export async function POST() {
  return new Response("Barry now works for the house only — build your own agent at /build", {
    status: 410,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
