"use client";

import { useEffect, useState } from "react";

/**
 * Client countdown to the next spot-window reset (23:50 ET). The
 * target comes from the server (the stats block's spots.resetsAt,
 * computed in ET) — this component only ticks toward it. Modeled on
 * RotatorCountdown, with spot copy instead of bidding copy.
 */
export function SpotResetCountdown({ resetsAt }: { resetsAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(resetsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) {
    return <span>Spots reset at 11:50 PM ET</span>;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span>
      Spots reset in {pad(h)}:{pad(m)}:{pad(s)} · 11:50 PM ET
    </span>
  );
}
