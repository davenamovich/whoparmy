import { createPickaphoneSession } from "@/lib/doors/pickaphone";
import { papError, papJson, papOptions } from "@/lib/doors/pickaphone-route";

const creations = new Map<string, number[]>();

export async function POST(req: Request) {
  try {
    try { await req.json(); } catch { return papJson(req, { error: "bad_json" }, 400); }
    const key = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const recent = (creations.get(key) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
    if (recent.length >= 30) return papJson(req, { error: "rate_limited" }, 429);
    recent.push(now); creations.set(key, recent);
    // Process-local soft limit; the claim layer is where value is controlled.
    return papJson(req, await createPickaphoneSession());
  } catch (err) { return papError(req, err); }
}

export function OPTIONS(req: Request) { return papOptions(req); }
