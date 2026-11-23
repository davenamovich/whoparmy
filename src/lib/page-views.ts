const recent = new Map<string, number>();
const WINDOW_MS = 30_000;

export function normalizePagePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const path = value.split(/[?#]/, 1)[0];
  if (!path || path.length > 500 || path.includes("\\")) return null;
  return path;
}

export function getReferrerHost(value: string | null): string | null {
  if (!value) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host ? host.slice(0, 253) : null;
  } catch {
    return null;
  }
}

export function classifyUserAgent(value: string | null): "mobile" | "desktop" | "bot" | "other" {
  if (!value) return "other";
  if (/bot|crawler|spider|slurp|headless|curl|wget|preview|facebookexternalhit/i.test(value)) return "bot";
  if (/mobile|android|iphone|ipad|ipod|windows phone|kindle/i.test(value)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edg\//i.test(value)) return "desktop";
  return "other";
}

export function shouldTrackPageViews(doNotTrack: string | null | undefined): boolean {
  return doNotTrack !== "1";
}

/** Best-effort per-session/path suppression; bounded to prevent unbounded growth. */
export function shouldRecordPageView(memberId: string | null, path: string, now = Date.now()): boolean {
  for (const [key, seenAt] of recent) if (now - seenAt >= WINDOW_MS) recent.delete(key);
  const key = `${memberId ?? "anonymous"}\n${path}`;
  const previous = recent.get(key);
  if (previous !== undefined && now - previous < WINDOW_MS) return false;
  if (recent.size >= 10_000) recent.delete(recent.keys().next().value!);
  recent.set(key, now);
  return true;
}

export function clearPageViewRateLimitForTests() { recent.clear(); }
