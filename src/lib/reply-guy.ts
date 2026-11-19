import "server-only";
import { starimgConfig, getLadder } from "@/lib/llm-policy";

/**
 * ─── REPLY GUY (Dave, 2026-11-18) ───────────────────────────────────
 * "Add a reply guy agent — lets us generate memes, one-click reply
 * to X." The agent lives on Trending's X topics: it reads the
 * original post (FxTwitter — the X skills' read chain, keyless),
 * writes reply options in reply-guy voice, and briefs a meme from
 * the P&R engine. Posting is the member's one click in the dialog,
 * through their own Upload-Post X account with reply_to_id
 * (lib/upload-post.ts) — the approve-tap rule holds, the bridge
 * stays content-only.
 *
 * Reply copy rules (from the Upload-Post X docs): X strips URLs
 * from posts unless the account has the Links add-on, so replies
 * carry NO links — the meme carries the brand. Keep each reply
 * under 270 characters so it posts as a single tweet.
 */

export interface XPostRef {
  user: string;
  id: string;
}

export function parseXPostUrl(url: string): XPostRef | null {
  const m = /^https:\/\/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,})(?:[/?#].*)?$/.exec(url.trim());
  return m ? { user: m[1], id: m[2] } : null;
}

export interface XPost {
  author: string;
  authorName: string | null;
  text: string;
  views: number | null;
  likes: number | null;
  createdAt: string | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** FxTwitter first, vxTwitter as the fallback — the skill's order.
 *  One attempt each; a failed method is never repeated. */
export async function fetchXPost(ref: XPostRef): Promise<XPost | null> {
  try {
    const res = await fetch(`https://api.fxtwitter.com/${ref.user}/status/${ref.id}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { tweet?: Record<string, unknown> };
      const t = data.tweet;
      if (t && typeof t.text === "string") {
        const a = (t.author ?? {}) as Record<string, unknown>;
        return {
          author: typeof a.screen_name === "string" ? a.screen_name : ref.user,
          authorName: typeof a.name === "string" ? a.name : null,
          text: t.text,
          views: num(t.views),
          likes: num(t.likes),
          createdAt: typeof t.created_at === "string" ? t.created_at : null,
        };
      }
    }
  } catch {
    // fall through to vxTwitter
  }
  try {
    const res = await fetch(`https://api.vxtwitter.com/${ref.user}/status/${ref.id}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const t = (await res.json()) as Record<string, unknown>;
      if (typeof t.text === "string") {
        return {
          author: typeof t.user_screen_name === "string" ? t.user_screen_name : ref.user,
          authorName: typeof t.user_name === "string" ? t.user_name : null,
          text: t.text,
          views: null, // vxTwitter carries no views
          likes: num(t.likes),
          createdAt: typeof t.date === "string" ? t.date : null,
        };
      }
    }
  } catch {
    // both read methods failed
  }
  return null;
}

export interface ReplyDraft {
  options: string[];
  memeBrief: string;
}

const FALLBACK: ReplyDraft = {
  options: [
    "This is the part nobody posts about — and it's the part that actually makes the money.",
    "Every small business owner needs to read this twice. The gap between knowing it and doing it is the whole game.",
    "Saving this. The businesses that win this year are the ones acting on exactly this.",
  ],
  memeBrief: "A small business owner having a lightbulb moment reading a post on their phone, relatable and funny",
};

/** Reply options + a meme brief, written by the volume tier. The
 *  member's business name rides along when we know it. */
export async function writeReplyDraft(input: {
  post: XPost;
  headline?: string;
  hook?: string;
  businessName?: string | null;
}): Promise<ReplyDraft> {
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
              "You are the Reply Guy for a small-business marketing app: you write X replies that make people click the profile. Voice: sharp, warm, a little funny, zero corporate. HARD RULES: each reply under 270 characters; NO links or URLs ever; no hashtags except at most one; never fake being a customer; add a real angle (agreement + a twist, a mini-story, or a useful add-on) — never empty praise like 'great post'. Also write ONE meme brief (one sentence describing a funny relatable meme image a business could post as the reply image, no text instructions). " +
              `Reply with ONLY JSON: {"options":["...","...","..."],"memeBrief":"..."}`,
          },
          {
            role: "user",
            content:
              `Original post by @${input.post.author}: "${input.post.text.slice(0, 600)}"\n` +
              (input.headline ? `Trending headline angle: ${input.headline}\n` : "") +
              (input.businessName ? `The replier runs: ${input.businessName} — weave it in only where it sounds natural, in at most one option.\n` : "") +
              "Write 3 reply options and the meme brief.",
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
    const parsed = JSON.parse(text.slice(start, end + 1)) as { options?: unknown; memeBrief?: unknown };
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0 && o.length <= 280 && !/https?:\/\//.test(o)).slice(0, 3)
      : [];
    if (options.length === 0) return FALLBACK;
    return {
      options,
      memeBrief: typeof parsed.memeBrief === "string" && parsed.memeBrief.trim() ? parsed.memeBrief.slice(0, 300) : FALLBACK.memeBrief,
    };
  } catch {
    return FALLBACK;
  }
}
