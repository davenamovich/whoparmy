"use client";

import { useEffect } from "react";
import { stashOwnerRef, stashRefFromUrl } from "@/lib/ref-stash";

/**
 * Referral capture for server-rendered surfaces (agent pages, the
 * daily rotator). On mount: an explicit ?ref= in the URL is stashed
 * (and always wins); when the surface has an owner — an agent page —
 * the owner's code is stashed as the visitor's referrer only if
 * nothing is stashed yet (lib/ref-stash.ts, Dave 2026-11-24: users
 * coming through an agent's page are that owner's referrals until
 * they get their own links in Muse; the stash is applied set-once
 * when they connect, via POST /api/referrals on /build and /muse-week).
 */
export function RefStash({ ownerCode }: { ownerCode?: string | null }) {
  useEffect(() => {
    stashRefFromUrl();
    if (ownerCode) stashOwnerRef(ownerCode);
  }, [ownerCode]);
  return null;
}
