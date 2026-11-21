"use client";

import { useEffect, useState } from "react";

/**
 * Client countdown to the next 23:50 ET bidding close. The target
 * comes from GET /api/rotator/today (closesAt, computed server-side
 * in ET) — this component only ticks toward it.
 */
export function RotatorCountdown({ closesAt }: { closesAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(closesAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) {
    return <span>Bidding closes at 23:50 ET</span>;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span>
      Bidding closes in {pad(h)}:{pad(m)}:{pad(s)} · 23:50 ET
    </span>
  );
}
