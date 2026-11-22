"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { stashRefFromUrl } from "@/lib/ref-stash";

/** Preserve incoming attribution and hand every member to the primary setup flow. */
export default function BridgePage() {
  const router = useRouter();
  useEffect(() => {
    stashRefFromUrl();
    const query = window.location.search;
    router.replace(`/build${query}`);
  }, [router]);
  return <main className="min-h-screen grid place-items-center bg-background text-muted-foreground">Taking you to build your agent…</main>;
}
