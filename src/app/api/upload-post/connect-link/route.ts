import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { UpError, getUpConnection, upConnectLink } from "@/lib/upload-post";

export const runtime = "nodejs";

/**
 * POST {profile} → the 48-hour Upload-Post connect link for that
 * profile, generated with the member's own key. The member opens
 * it and links their socials on Upload-Post's OAuth screens.
 */
export async function POST(req: Request) {
  const user = await getWhopUser();
  const conn = await getUpConnection(user.id);
  if (!conn) return NextResponse.json({ error: "Connect your Upload-Post key first" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { profile?: unknown } | null;
  const profile = typeof body?.profile === "string" ? body.profile : "";
  if (!profile) return NextResponse.json({ error: "Missing profile" }, { status: 400 });
  try {
    const accessUrl = await upConnectLink(conn.apiKey, profile);
    return NextResponse.json({ accessUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't generate the connect link." }, { status: 502 });
  }
}
