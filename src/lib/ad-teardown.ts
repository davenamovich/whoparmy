import { starimgConfig, getLadder } from "@/lib/llm-policy";
import { parseXPostUrl, fetchXPost } from "@/lib/reply-guy";

/**
 * Ad teardown (Dave, 2026-11-19, from the Linus/laurgrowth system):
 * "AI finds the ads already printing in your niche → turns them
 * into angles → writes every script + prompt → saves the whole
 * thing as ONE command." Our version, on our stack: a member
 * pastes a competitor's post or ad link; we READ it for real (X
 * posts through the FxTwitter chain, other pages server-side),
 * tear it down (hook / angle / mechanism / CTA), spin fresh
 * angles for the MEMBER's business, and hand back ONE agent
 * command the member gives their agent — the agent generates
 * from the angles on the member's key, under the bridge's
 * quote-first / never-publish rules.
 */

export interface AdSource {
  kind: "x" | "page";
  label: string; // "@handle" or the page host
  url: string;
  text: string;
}

export async function fetchAdSource(rawUrl: string): Promise<AdSource | null> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) return null;

  const xRef = parseXPostUrl(url);
  if (xRef) {
    const post = await fetchXPost(xRef);
    if (!post) return null;
    return {
      kind: "x",
      label: `@${post.author}`,
      url,
      text: post.text.slice(0, 1800),
    };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    const desc =
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})["']/i.exec(html)?.[1]?.trim() ??
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,400})["']/i.exec(html)?.[1]?.trim() ??
      "";
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const text = [title, desc, body.slice(0, 2200)].filter(Boolean).join("\n").slice(0, 2600);
    if (text.length < 40) return null;
    return { kind: "page", label: new URL(url).hostname.replace(/^www\./, ""), url, text };
  } catch {
    return null;
  }
}

export interface TeardownAngle {
  title: string;
  hook: string;
  format: string; // meme | video | post — the lanes an agent can actually make here
}

export interface AdTeardown {
  hook: string;
  angle: string;
  mechanism: string;
  cta: string;
  angles: TeardownAngle[];
}

const FALLBACK: AdTeardown = {
  hook: "A bold claim up front, then the proof",
  angle: "Borrow the structure, not the words: lead with the outcome your customer wants",
  mechanism: "Curiosity gap — the payoff is promised fast and shown, not explained",
  cta: "One clear next step",
  angles: [
    { title: "The outcome first", hook: "Show the result your customer wants before you mention your business", format: "meme" },
    { title: "The mistake everyone makes", hook: "Name the common mistake in your trade and the one-line fix", format: "post" },
    { title: "Watch it happen", hook: "A short clip of the job being done beats any promise about it", format: "video" },
  ],
};

export async function writeTeardown(input: {
  source: AdSource;
  businessName?: string | null;
  businessUrl?: string | null;
}): Promise<AdTeardown> {
  const cfg = starimgConfig();
  if (!cfg) return FALLBACK;
  try {
    const ladder = await getLadder("volume");
    const model = ladder[0];
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You tear down ads and posts for a small-business marketing app. You extract the real persuasion structure (never invent claims the source does not make) and spin FRESH angles for the member's own business — same mechanism, their material, never copying the source's words or pretending their results. Formats are only: meme, video, post. " +
              `Reply with ONLY JSON: {"hook":"...","angle":"...","mechanism":"...","cta":"...","angles":[{"title":"...","hook":"...","format":"meme|video|post"}]} with exactly 6 angles.`,
          },
          {
            role: "user",
            content:
              `Source (${input.source.label}, ${input.source.url}):\n"""${input.source.text}"""\n` +
              (input.businessName
                ? `The member's business: ${input.businessName}${input.businessUrl ? ` (${input.businessUrl})` : ""}. Spin the 6 angles for THIS business.\n`
                : "The member's business is unknown — spin the 6 angles generically for a local service business.\n") +
              "Tear it down and write the angles.",
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return FALLBACK;
    const p = JSON.parse(text.slice(start, end + 1)) as Partial<AdTeardown>;
    const angles = Array.isArray(p.angles)
      ? p.angles
          .filter(
            (a): a is TeardownAngle =>
              !!a && typeof a.title === "string" && typeof a.hook === "string" && ["meme", "video", "post"].includes(a.format as string),
          )
          .slice(0, 6)
      : [];
    if (!p.hook || !p.angle || angles.length < 3) return FALLBACK;
    return {
      hook: String(p.hook).slice(0, 300),
      angle: String(p.angle).slice(0, 300),
      mechanism: String(p.mechanism ?? FALLBACK.mechanism).slice(0, 300),
      cta: String(p.cta ?? FALLBACK.cta).slice(0, 200),
      angles,
    };
  } catch {
    return FALLBACK;
  }
}

/** The ONE command the member gives their agent. */
export function agentCommand(input: {
  source: AdSource;
  teardown: AdTeardown;
  businessUrl?: string | null;
}): string {
  const t = input.teardown;
  const lines = [
    `Tear-down assignment — a competitor's ${input.source.kind === "x" ? "post" : "page"} that is working: ${input.source.url}`,
    `What makes it work — hook: ${t.hook} | angle: ${t.angle} | mechanism: ${t.mechanism} | CTA: ${t.cta}`,
    input.businessUrl
      ? `My business: ${input.businessUrl} — research it first if you have not.`
      : "Ask me for my website if you do not have it, then research it.",
    "Make content from these angles (my version — never copy their words or claim their results):",
    ...t.angles.map((a, i) => `${i + 1}. [${a.format}] ${a.title} — ${a.hook}`),
    "Rules: quote the credit cost before generating and wait for my go; use my P&R connection; never publish or post anything — bring the finished pieces back to me for approval.",
  ];
  return lines.join("\n");
}
