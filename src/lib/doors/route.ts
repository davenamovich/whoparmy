/**
 * route.ts — shared plumbing for the /api/doors routes: Whop auth, the
 * wa_locale cookie (Addendum v3: locale rides in a cookie, never the
 * URL), and DoorsError → HTTP mapping. Mirrors the shape of
 * src/app/api/referrals/route.ts.
 */

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isUiLocale, type UiLocale } from "@/i18n/config";
import { DOORS_TEST_WHOPIID, DoorsError } from "./game";
import { BidError } from "./auction";

/** Test play (Dave, 2026-11-17): a request carrying the header
 *  `x-doors-test: <DOORS_TEST_KEY>` plays as a dedicated shadow user
 *  (whopId "doors-test") instead of the signed-in member. Prizes, XP and
 *  points land on the throwaway account only — no real account is
 *  touched and no real member's daily game is consumed. Without the
 *  env key set, test mode does not exist. */

async function doorsTestUser(): Promise<User | null> {
  const key = process.env.DOORS_TEST_KEY;
  if (!key) return null;
  const hdrs = await headers();
  if (hdrs.get("x-doors-test") !== key) return null;
  return db.user.upsert({
    where: { whopId: DOORS_TEST_WHOPIID },
    create: {
      whopId: DOORS_TEST_WHOPIID,
      whopUsername: "doors-test",
      email: "doors-test@plunderandriffle.com",
      name: "Doors Test (shadow)",
    },
    update: {},
  });
}

export async function doorsContext(): Promise<{ user: User; locale: UiLocale }> {
  const user = (await doorsTestUser()) ?? (await getWhopUser());
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
