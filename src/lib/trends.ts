import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { starimgConfig, getLadder } from "@/lib/llm-policy";
import { languageLabel } from "@/lib/languages";
import { narrativePromptBlock } from "@/lib/narrative-hooks";

/**
 * ─── TRENDING — the day's default topics ────────────────────────────
 *
 * Dave's rule (2026-11-17): Trending settles on ONE default topic set
 * per ET day instead of reloading the wire on every refresh. The
 * first read of the day builds it — topics from public RSS (Google
 * Trends daily searches + Google News top stories — no keys, no
 * scraping) plus viral headlines written per topic by the volume
 * tier on Starimg, in the reader's language — and stores it in the
 * TrendDay table. Every refresh that day serves the stored snapshot:
 * no fresh RSS pull, no fresh headline call, same topics all day.
 * A new ET day builds a new set on first read. The topic list is
 * shared across languages (the day's first snapshot fixes it); only
 * the headlines are per language. If the day's build comes back
 * empty (RSS down at day start), nothing is stored and the old
 * short-cache live wire answers instead, so the surface never
 * blanks and the snapshot retries on the next refresh.
 *
 * This complements the viral3 Scout's weekly curated trend batches
 * (Video Studio): that is the deep scan; this is the daily wire.
 *
 * X LANE (Dave, 2026-11-18): the day's topics can also be seeded
 * from real X posts — Muse's daily job finds what's moving on X
 * for small-business owners (search → FxTwitter-verified reads),
 * writes SMB-ready headlines/hooks, and POSTs them to
 * /api/trends/ingest. They land here as the day's lang="x" snapshot:
 * buildDaySnapshot prefers that row's topic list over the RSS wire
 * for every language (headlines still generated per language from
 * the X topics), and ingesting clears the day's other rows so a
 * mid-day X drop replaces the wire everywhere. No X drop that day
 * → the RSS wire answers exactly as before.
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

// ─── The day's default topics (persisted snapshot) ──────────────────
// Accessed with raw SQL on purpose: the TrendDay table is created by
// the boot schema applier from prisma/schema.sql, and raw access
// means this surface never depends on a regenerated Prisma client.

interface DaySnapshot {
  builtAt: string;
  topics: TrendTopic[];
}

function etDayKey(now = new Date()): string {
  // en-CA formats as yyyy-mm-dd; the app's calendar day is ET
  // (same convention as RotatorDay).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseSnapshot(topicsJson: string): DaySnapshot | null {
  try {
    const parsed = JSON.parse(topicsJson) as Partial<DaySnapshot>;
    if (typeof parsed.builtAt === "string" && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      return { builtAt: parsed.builtAt, topics: parsed.topics as TrendTopic[] };
    }
  } catch {
    // a corrupt row is no snapshot; the day rebuilds below
  }
  return null;
}

async function readSnapshot(date: string, lang: string): Promise<DaySnapshot | null> {
  try {
    const rows = await db.$queryRaw<{ topicsJson: string }[]>`
      SELECT "topicsJson" FROM "TrendDay" WHERE "date" = ${date} AND "lang" = ${lang} LIMIT 1
    `;
    return rows.length > 0 ? parseSnapshot(rows[0].topicsJson) : null;
  } catch {
    return null; // table missing (pre-boot-applier dev DB) — build live
  }
}

async function readAnySnapshot(date: string): Promise<DaySnapshot | null> {
  try {
    // The X lane (lang "x") wins the day when it exists — its topic
    // list is the one every language builds headlines from.
    const rows = await db.$queryRaw<{ topicsJson: string }[]>`
      SELECT "topicsJson" FROM "TrendDay" WHERE "date" = ${date}
      ORDER BY CASE WHEN "lang" = 'x' THEN 0 ELSE 1 END LIMIT 1
    `;
    return rows.length > 0 ? parseSnapshot(rows[0].topicsJson) : null;
  } catch {
    return null;
  }
}

/**
 * Store the day's X-sourced topics (POST /api/trends/ingest) and
 * clear the day's per-language rows, so the next read in any
 * language rebuilds its headlines from the X topics instead of
 * serving a wire-built set. All of the day's in-process cache keys
 * are invalidated with the write.
 */
export async function ingestXTopics(topics: TrendTopic[]): Promise<void> {
  const date = etDayKey();
  const snapshot: DaySnapshot = { builtAt: new Date().toISOString(), topics };
  const json = JSON.stringify(snapshot);
  // One transaction: the X write, the localized-row delete and the
  // English write commit together or not at all. Three separate
  // writes could strand a mixed day (new X topics beside yesterday's
  // localized rows) on any mid-sequence failure.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO "TrendDay" ("id", "date", "lang", "topicsJson")
      VALUES (${randomUUID()}, ${date}, 'x', ${json})
      ON CONFLICT("date", "lang") DO UPDATE SET "topicsJson" = EXCLUDED."topicsJson"
    `,
    db.$executeRaw`DELETE FROM "TrendDay" WHERE "date" = ${date} AND "lang" <> 'x' AND "lang" <> 'en'`,
    // The payload's headlines are written in English by the ingest
    // job — store them as the day's en snapshot too, so English
    // readers get the crafted headlines instead of regenerated ones.
    // Other languages still rebuild (localized) from the x topics.
    db.$executeRaw`
      INSERT INTO "TrendDay" ("id", "date", "lang", "topicsJson")
      VALUES (${randomUUID()}, ${date}, 'en', ${json})
      ON CONFLICT("date", "lang") DO UPDATE SET "topicsJson" = EXCLUDED."topicsJson"
    `,
  ]);
  // Invalidate every cached language for the day, not just x/en:
  // a localized snapshot built from the old topics would otherwise
  // keep serving until restart.
  for (const key of [...dayCache.keys()]) {
    if (key.startsWith(`${date}:`)) dayCache.delete(key);
  }
  dayCache.set(`${date}:x`, snapshot);
  dayCache.set(`${date}:en`, snapshot);
}

async function storeSnapshot(date: string, lang: string, snapshot: DaySnapshot): Promise<void> {
  try {
    await db.$executeRaw`
      INSERT INTO "TrendDay" ("id", "date", "lang", "topicsJson")
      VALUES (${randomUUID()}, ${date}, ${lang}, ${JSON.stringify(snapshot)})
      ON CONFLICT("date", "lang") DO NOTHING
    `;
  } catch {
    // persistence is the optimisation, not the product — serving the
    // in-memory copy below is still correct for this process
  }
}

const dayCache = new Map<string, DaySnapshot>();
const dayInFlight = new Map<string, Promise<DaySnapshot | null>>();

async function buildDaySnapshot(date: string, lang: string): Promise<DaySnapshot | null> {
  // The topic list is the day's, whichever language asked first:
  // reuse it from today's existing snapshot when there is one.
  let raw: RawTopic[] | null = null;
  const any = await readAnySnapshot(date);
  if (any) {
    raw = any.topics.map((t) => ({
      title: t.title,
      traffic: t.traffic,
      source: t.source,
      link: t.link,
      publishedAt: t.publishedAt,
    }));
  }
  if (!raw || raw.length === 0) {
    const fetched = await getRawTopics();
    if (fetched.length > 0) raw = fetched;
  }
  if (!raw || raw.length === 0) return null;

  const headlines = await generateHeadlines(raw, lang);
  const snapshot: DaySnapshot = {
    builtAt: new Date().toISOString(),
    topics: raw.map((t, i) => ({
      ...t,
      headline: headlines.get(i)?.headline ?? t.title,
      hook: headlines.get(i)?.hook ?? "",
    })),
  };
  await storeSnapshot(date, lang, snapshot);
  return snapshot;
}

export async function getTrending(lang: string): Promise<{ topics: TrendTopic[]; updatedAt: string }> {
  const date = etDayKey();
  const cacheKey = `${date}:${lang}`;

  const cached = dayCache.get(cacheKey);
  if (cached) return { topics: cached.topics, updatedAt: cached.builtAt };

  const stored = await readSnapshot(date, lang);
  if (stored) {
    dayCache.set(cacheKey, stored);
    return { topics: stored.topics, updatedAt: stored.builtAt };
  }

  // First read of the day in this language: build once, even under
  // a burst of simultaneous refreshes.
  let inFlight = dayInFlight.get(cacheKey);
  if (!inFlight) {
    inFlight = buildDaySnapshot(date, lang).finally(() => dayInFlight.delete(cacheKey));
    dayInFlight.set(cacheKey, inFlight);
  }
  const built = await inFlight;
  if (built) {
    dayCache.set(cacheKey, built);
    return { topics: built.topics, updatedAt: built.builtAt };
  }

  // The day's build came back empty (RSS down at day start): store
  // nothing and answer from the short-cache live wire, so the next
  // refresh retries the snapshot instead of serving an empty day.
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
