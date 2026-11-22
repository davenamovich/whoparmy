/**
 * ─── Agent marketplace visuals — pure helpers ──────────────────────
 *
 * Small, deterministic helpers behind the /agents marketplace and the
 * /agent/{slug} profile: a generated avatar for agents without an
 * uploaded image, the 7-day sparkline path, ET day bucketing for the
 * sparkline, and the "2m ago" label on the activity feed. No imports,
 * so `node --test` loads it directly and client components can use it.
 */

/** FNV-1a 32-bit — stable across runtimes, good enough for colours. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface GeneratedAvatar {
  /** CSS background for the avatar tile. */
  background: string;
  /** 5×5 mirrored pattern, row-major; true = filled cell. */
  cells: boolean[];
  /** Initial shown over the pattern. */
  initial: string;
}

/**
 * Generated avatar: a warm two-stop gradient (hues kept in the
 * brand's orange→amber→rose band so the grid reads as one family)
 * plus a mirrored 5×5 identicon pattern. Same seed → same avatar.
 */
export function generatedAvatar(seed: string, name: string): GeneratedAvatar {
  const h = hashSeed(seed || name || "agent");
  const hueA = 10 + (h % 70); // 10–79: rose → orange → amber
  const hueB = (hueA + 25 + ((h >>> 8) % 40)) % 360;
  const angle = (h >>> 16) % 360;
  const background = `linear-gradient(${angle}deg, oklch(0.62 0.17 ${hueA}), oklch(0.42 0.12 ${hueB}))`;
  const cells: boolean[] = [];
  let bits = hashSeed(`${seed}:pattern`);
  for (let row = 0; row < 5; row++) {
    const half: boolean[] = [];
    for (let col = 0; col < 3; col++) {
      half.push((bits & 1) === 1);
      bits = bits >>> 1 || hashSeed(`${seed}:${row}:${col}`);
    }
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return { background, cells, initial };
}

/**
 * SVG path for a sparkline through `values`, scaled into a w×h box
 * with `pad` px of breathing room. All-zero (or empty) series draw a
 * flat baseline rather than nothing, so a quiet agent still reads as
 * "measured, zero" instead of "missing".
 */
export function sparkPath(values: readonly number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return `M${pad},${h - pad} L${w - pad},${h - pad}`;
  const max = Math.max(...values, 0);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => (max === 0 ? h - pad : h - pad - (v / max) * (h - pad * 2));
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
}

/** ET calendar date (yyyy-mm-dd) of an instant. */
export function etDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The last `n` ET days ending today, oldest first. */
export function lastEtDays(now: Date, n = 7): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(etDay(new Date(now.getTime() - i * 86_400_000)));
  // DST edges can repeat a day when stepping by 24h — dedupe, keep order.
  return [...new Set(days)];
}

/** Bucket timestamps into counts per ET day over `days` (oldest first). */
export function bucketByEtDay(timestamps: readonly Date[], days: readonly string[]): number[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const counts = days.map(() => 0);
  for (const ts of timestamps) {
    const i = index.get(etDay(ts));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

/** "just now" · "4m ago" · "3h ago" · "2d ago". */
export function timeAgo(then: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(then).getTime();
  if (!Number.isFinite(ms) || ms < 45_000) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
