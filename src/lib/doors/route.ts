/**
 * route.ts — shared plumbing for the /api/doors routes: Whop auth, the
 * wa_locale cookie (Addendum v3: locale rides in a cookie, never the
 * URL), and DoorsError → HTTP mapping. Mirrors the shape of
 * src/app/api/referrals/route.ts.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getWhopUser } from "@/lib/auth";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isUiLocale, type UiLocale } from "@/i18n/config";
import { DoorsError } from "./game";
import { BidError } from "./auction";

export async function doorsContext(): Promise<{ user: User; locale: UiLocale }> {
  const user = await getWhopUser();
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isUiLocale(raw) ? raw : DEFAULT_LOCALE;
  return { user, locale };
}

export function doorsError(err: unknown): NextResponse {
  if (err instanceof DoorsError) {
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
  if (err instanceof BidError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Doors request failed" },
    { status: 500 },
  );
}
