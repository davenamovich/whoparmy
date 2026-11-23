"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shouldTrackPageViews } from "@/lib/page-views";

/** Minimal first-party beacon. It sends the pathname only and respects DNT. */
export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!shouldTrackPageViews(navigator.doNotTrack) || !pathname || !pathname.startsWith("/")) return;
    const body = new Blob([JSON.stringify({ path: pathname })], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/view", body);
  }, [pathname]);
  return null;
}
