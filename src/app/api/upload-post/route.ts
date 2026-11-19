import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import {
  HOUSE_ACCOUNT_EMAIL,
  UpError,
  clearUpConnection,
  getUpConnection,
  maskKey,
  saveUpConnection,
  upFetchAccount,
  upFetchProfiles,
  type UpProfile,
} from "@/lib/upload-post";

export const runtime = "nodejs";

/**
 * The member's Upload-Post connection (lib/upload-post.ts):
 * GET = state + live profiles/accounts looked up by their key;
 * POST {apiKey} = validate against Upload-Post, then store;
 * DELETE = disconnect. The full key never leaves the server —
 * responses carry only the masked hint.
 */

interface StateBody {
  connected: boolean;
  house?: boolean;
  email?: string | null;
  plan?: string | null;
  keyHint?: string;
  profiles?: UpProfile[];
  profilesError?: string;
}

async function stateFor(userId: string): Promise<StateBody> {
  const conn = await getUpConnection(userId);
  if (!conn) return { connected: false };
  const base: StateBody = {
    connected: true,
    house: conn.email === HOUSE_ACCOUNT_EMAIL,
    email: conn.email,
    plan: conn.plan,
    keyHint: maskKey(conn.apiKey),
  };
  try {
    base.profiles = await upFetchProfiles(conn.apiKey);
  } catch (err) {
    base.profiles = [];
    base.profilesError = err instanceof Error ? err.message : "Couldn't load your profiles.";
  }
  return base;
}

export async function GET() {
  const user = await getWhopUser();
  return NextResponse.json(await stateFor(user.id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getWhopUser();
  const body = (await req.json().catch(() => null)) as { apiKey?: unknown } | null;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) return NextResponse.json({ error: "Paste your Upload-Post API key" }, { status: 400 });
  try {
    const account = await upFetchAccount(apiKey);
    await saveUpConnection(user.id, {
      apiKey,
      email: account.email,
      plan: account.plan,
      connectedAt: new Date().toISOString(),
    });
    return NextResponse.json(await stateFor(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Couldn't connect to Upload-Post." }, { status: 502 });
  }
}

export async function DELETE() {
  const user = await getWhopUser();
  await clearUpConnection(user.id);
  return NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
}
