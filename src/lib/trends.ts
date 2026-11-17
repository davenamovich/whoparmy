import "server-only";
import { starimgConfig, getLadder } from "@/lib/llm-policy";
import { languageLabel } from "@/lib/languages";
import { narrativePromptBlock } from "@/lib/narrative-hooks";

/**
 * ─── TRENDING — the live wire ───────────────────────────────────────
 *
 * Real-time topics from public RSS (Google Trends daily searches +
 * Google News top stories — no keys, no scraping), refreshed on a
 * short cache. Viral headlines are written per topic by the volume
 * tier on Starimg (the cheapest fuel there is), in the reader's
 * language, cached against the topic set so a page view never burns
 * a fresh call. If the headline call fails, the topic title itself
 * is the headline — the wire never goes blank.
 *
 * This complements the viral3 Scout's weekly curated trend batches
 * (Video Studio): that is the deep scan; this is the live ticker.
 */

export interface TrendTopic {
  title: string;
  traffic: string | null; // e.g. "200K+" searches (Google Trends only)
  source: string; // "Google Trends" | news outlet name
  link: string;
  publishedAt: string | null;
  headline: string;
  hook: string;
}

const TRENDS_RSS = "https://trends.google.com/trending/rss?geo=US";
const NEWS_RSS = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
const TOPIC_TTL_MS = 10 * 60_000;
const HEADLINE_TTL_MS = 15 * 60_000;

function unescapeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unescapeXml(m[1]) : null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Whoparmy-Trending/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface RawTopic {
  title: string;
  traffic: string | null;
  source: string;
  link: string;
  publishedAt: string | null;
}

async function fetchRawTopics(): Promise<RawTopic[]> {
  const [trendsXml, newsXml] = await Promise.all([fetchText(TRENDS_RSS), fetchText(NEWS_RSS)]);
  const out: RawTopic[] = [];
  const seen = new Set<string>();
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 40);

  if (trendsXml) {
    for (const block of trendsXml.split("<item>").slice(1, 11)) {
      const title = tag(block, "title");
      if (!title || seen.has(norm(title))) continue;
      seen.add(norm(title));
      out.push({
        title,
        traffic: tag(block, "ht:approx_traffic"),
        source: "Google Trends",
        link: tag(block, "link") ?? "https://trends.google.com/trending?geo=US",
        publishedAt: tag(block, "pubDate"),
      });
    }
  }
  if (newsXml) {
    for (const block of newsXml.split("<item>").slice(1, 30)) {
      if (out.length >= 14) break;
      const rawTitle = tag(block, "title");
      if (!rawTitle) continue;
      // Google News titles end with " - Outlet"; split it off.
      const dash = rawTitle.lastIndexOf(" - ");
      const title = dash > 10 ? rawTitle.slice(0, dash) : rawTitle;
      const outlet = dash > 10 ? rawTitle.slice(dash + 3) : tag(block, "source") ?? "Google News";
      if (seen.has(norm(title))) continue;
      seen.add(norm(title));
      out.push({
        title,
        traffic: null,
        source: outlet,
        link: tag(block, "link") ?? "https://news.google.com",
        publishedAt: tag(block, "pubDate"),
      });
    }
  }
  return out;
}

let topicCache: { at: number; topics: RawTopic[] } | null = null;

async function getRawTopics(): Promise<RawTopic[]> {
  if (topicCache && Date.now() - topicCache.at < TOPIC_TTL_MS) return topicCache.topics;
  const topics = await fetchRawTopics();
  if (topics.length > 0) topicCache = { at: Date.now(), topics };
  return topics.length > 0 ? topics : (topicCache?.topics ?? []);
}

// ─── Viral headlines (Starimg volume tier) ──────────────────────────

const headlineCache = new Map<string, { at: number; byIndex: Map<number, { headline: string; hook: string }> }>();

async function generateHeadlines(topics: RawTopic[], lang: string): Promise<Map<number, { headline: string; hook: string }>> {
  const cacheKey = `${lang}:${topics.map((t) => t.title).join("|")}`;
  const hit = headlineCache.get(cacheKey);
  if (hit && Date.now() - hit.at < HEADLINE_TTL_MS) return hit.byIndex;

  const byIndex = new Map<number, { headline: string; hook: string }>();
  const cfg = starimgConfig();
  if (cfg && topics.length > 0) {
    try {
      const ladder = await getLadder("volume");
      const model = ladder[0];
      const list = topics.map((t, i) => `${i}. ${t.title}${t.traffic ? ` (${t.traffic} searches today)` : ""}`).join("\n");
      const res = await fetch(`${cfg.base}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a viral headline writer for small-business social content. For each trending topic, write ONE scroll-stopping headline a local business could ride (curiosity, contrast, or a bold claim — never clickbait lies, never advice about the news itself) and a one-line hook angle. " +
                "When a narrative frame fits the topic, write the headline AS that first-person story opener — it outperforms a clever headline.\n\n" +
                narrativePromptBlock(8) +
                `\n\nWrite ALL output in ${languageLabel(lang)} (${lang}). Reply with ONLY a JSON array: [{"i":0,"headline":"...","hook":"..."}] — no markdown, no extra text.`,
            },
            { role: "user", content: `Trending now:\n${list}` },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content ?? "";
        const start = text.indexOf("[");
        const end = text.lastIndexOf("]");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(text.slice(start, end + 1)) as { i?: number; headline?: string; hook?: string }[];
          for (const row of parsed) {
            if (typeof row.i === "number" && row.headline) {
              byIndex.set(row.i, { headline: String(row.headline).slice(0, 140), hook: String(row.hook ?? "").slice(0, 200) });
            }
          }
        }
      }
    } catch {
      // fall through — titles stand in as headlines
    }
  }
  headlineCache.set(cacheKey, { at: Date.now(), byIndex });
  return byIndex;
}

export async function getTrending(lang: string): Promise<{ topics: TrendTopic[]; updatedAt: string }> {
  const raw = await getRawTopics();
  const headlines = await generateHeadlines(raw, lang);
  return {
    topics: raw.map((t, i) => ({
      ...t,
      headline: headlines.get(i)?.headline ?? t.title,
      hook: headlines.get(i)?.hook ?? "",
    })),
    updatedAt: new Date(topicCache?.at ?? Date.now()).toISOString(),
  };
}
