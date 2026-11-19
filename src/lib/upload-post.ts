import "server-only";
import { db } from "@/lib/db";

/**
 * ─── UPLOAD-POST, MEMBER LANE (Dave, 2026-11-18) ────────────────────
 * "Add Upload-Post API connection and build out capabilities: look
 * up users' accounts based on API key, support multiple accounts
 * and whatever socials, and first comment for FB & YT."
 *
 * The model (decided with Dave earlier today): the member connects
 * THEIR OWN Upload-Post account — their key, their profiles, their
 * socials, connected inside Upload-Post by OAuth (we never see a
 * social login). The key lives server-side only (AppSetting,
 * `uploadpost:<userId>`), is masked in every response, and posting
 * happens only from the member's explicit in-app tap (the bridge
 * token stays content-only; this lane is the member's own hand).
 *
 * API facts, verified live 2026-11-18 against the house account:
 * base https://api.upload-post.com/api, auth = the bare key in the
 * Authorization header (the "Apikey " prefix 401s). Profiles:
 * GET /uploadposts/users → { profiles: [{ username, social_accounts:
 * { platform: {handle, display_name, social_images, reauth_required}
 * | "" } }] } — multiple profiles per key, one account per platform
 * per profile. Connect links: POST /uploadposts/users/generate-jwt
 * → access_url (48h) where the member links socials. Posting:
 * POST /upload (video file), /upload_photos (photos[] files),
 * /upload_text — fields user, platform[], title|text, first_comment,
 * scheduled_date. First comment is supported on facebook, youtube,
 * instagram, threads, bluesky, x, linkedin, tiktok (provider docs).
 */

const BASE = "https://api.upload-post.com/api";
const KEY_PREFIX = "uploadpost:";

export const FIRST_COMMENT_PLATFORMS = [
  "facebook",
  "youtube",
  "instagram",
  "threads",
  "bluesky",
  "x",
  "linkedin",
  "tiktok",
] as const;

export interface UpSocialAccount {
  platform: string;
  handle: string | null;
  displayName: string | null;
  image: string | null;
  reauthRequired: boolean;
}

export interface UpProfile {
  username: string;
  facebookPageName: string | null;
  accounts: UpSocialAccount[];
}

export interface UpConnection {
  apiKey: string;
  email: string | null;
  plan: string | null;
  connectedAt: string;
}

/** The house referral link for members with no Upload-Post account
 *  yet — Dave's saved hub offer (upload-post.com/?ref=VESSEL). */
export const UPLOAD_POST_SIGNUP_URL = "https://upload-post.com/?ref=VESSEL";

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

export async function getUpConnection(userId: string): Promise<UpConnection | null> {
  const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as UpConnection;
    return typeof parsed.apiKey === "string" && parsed.apiKey ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveUpConnection(userId: string, conn: UpConnection): Promise<void> {
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    create: { key: keyFor(userId), value: JSON.stringify(conn) },
    update: { value: JSON.stringify(conn) },
  });
}

export async function clearUpConnection(userId: string): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: keyFor(userId) } });
}

export function maskKey(apiKey: string): string {
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

export class UpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function upFetch(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      redirect: "manual",
      headers: { Authorization: apiKey, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new UpError(502, "Upload-Post is unreachable right now. Nothing was posted.");
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401 || res.status === 403) {
    throw new UpError(401, "Upload-Post rejected that API key. Check the key and try again.");
  }
  if (!res.ok) {
    const msg = (data && (data.message as string)) || `Upload-Post returned ${res.status}`;
    throw new UpError(res.status, String(msg));
  }
  return data;
}

export async function upFetchAccount(apiKey: string): Promise<{ email: string | null; plan: string | null }> {
  const data = (await upFetch(apiKey, "/uploadposts/me")) as { email?: string; plan?: string } | null;
  return { email: data?.email ?? null, plan: data?.plan ?? null };
}

export function normalizeProfiles(raw: unknown): UpProfile[] {
  const profiles = (raw as { profiles?: unknown[] } | null)?.profiles;
  if (!Array.isArray(profiles)) return [];
  const out: UpProfile[] = [];
  for (const p of profiles as Record<string, unknown>[]) {
    if (typeof p?.username !== "string") continue;
    const socials = (p.social_accounts ?? {}) as Record<string, unknown>;
    const accounts: UpSocialAccount[] = [];
    for (const [platform, v] of Object.entries(socials)) {
      if (!v || typeof v !== "object") continue; // "" / null = not connected
      const a = v as Record<string, unknown>;
      accounts.push({
        platform,
        handle: typeof a.handle === "string" ? a.handle : null,
        displayName: typeof a.display_name === "string" ? a.display_name : null,
        image: typeof a.social_images === "string" ? a.social_images : null,
        reauthRequired: a.reauth_required === true,
      });
    }
    accounts.sort((x, y) => x.platform.localeCompare(y.platform));
    out.push({
      username: p.username,
      facebookPageName: typeof p.facebook_page_name === "string" ? p.facebook_page_name : null,
      accounts,
    });
  }
  return out;
}

export async function upFetchProfiles(apiKey: string): Promise<UpProfile[]> {
  return normalizeProfiles(await upFetch(apiKey, "/uploadposts/users"));
}

/** Generate the 48-hour connect link for one profile — the member
 *  opens it and links their socials on Upload-Post's own OAuth
 *  screens. Their passwords never touch us. */
export async function upConnectLink(apiKey: string, profileUsername: string): Promise<string> {
  const data = (await upFetch(apiKey, "/uploadposts/users/generate-jwt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: profileUsername }),
  })) as { access_url?: string; url?: string } | null;
  const url = data?.access_url ?? data?.url;
  if (!url) throw new UpError(502, "Upload-Post didn't return a connect link. Try again in a moment.");
  return url;
}

export interface UpPostInput {
  profile: string;
  platforms: string[];
  kind: "video" | "photo" | "text";
  /** Public media URL for video/photo kinds — downloaded server-side
   *  and re-uploaded; Upload-Post takes files, not URLs. */
  mediaUrl?: string;
  text: string;
  firstComment?: string;
  scheduledDate?: string;
  /** X only: post as a reply to this tweet id (Upload-Post
   *  reply_to_id — supported on upload, upload_photos, upload_text
   *  per the provider docs). Powers the Reply Guy. */
  replyToId?: string;
}

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export async function upPost(apiKey: string, input: UpPostInput): Promise<unknown> {
  if (!input.platforms.length) throw new UpError(400, "Pick at least one account to post to.");
  const firstComment =
    input.firstComment && input.platforms.some((p) => (FIRST_COMMENT_PLATFORMS as readonly string[]).includes(p))
      ? input.firstComment
      : undefined;

  if (input.kind === "text") {
    const form = new FormData();
    form.set("user", input.profile);
    for (const p of input.platforms) form.append("platform[]", p);
    form.set("text", input.text);
    if (firstComment) form.set("first_comment", firstComment);
    if (input.scheduledDate) form.set("scheduled_date", input.scheduledDate);
    if (input.replyToId) form.set("reply_to_id", input.replyToId);
    return upFetch(apiKey, "/upload_text", { method: "POST", body: form });
  }

  if (!input.mediaUrl) throw new UpError(400, "That piece has no media to post.");
  let media: Response;
  try {
    media = await fetch(input.mediaUrl, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new UpError(502, "Couldn't fetch that media file to post it. Nothing was posted.");
  }
  if (!media.ok) throw new UpError(502, "Couldn't fetch that media file to post it. Nothing was posted.");
  const blob = await media.blob();
  if (blob.size > MAX_MEDIA_BYTES) throw new UpError(413, "That file is too large to post through Upload-Post.");
  const filename = input.mediaUrl.split("/").pop()?.split("?")[0] || (input.kind === "video" ? "video.mp4" : "image.png");

  const form = new FormData();
  form.set("user", input.profile);
  for (const p of input.platforms) form.append("platform[]", p);
  form.set("title", input.text);
  if (firstComment) form.set("first_comment", firstComment);
  if (input.scheduledDate) form.set("scheduled_date", input.scheduledDate);
  if (input.replyToId) form.set("reply_to_id", input.replyToId);
  if (input.kind === "video") {
    form.append("video", blob, filename);
    return upFetch(apiKey, "/upload", { method: "POST", body: form });
  }
  form.append("photos[]", blob, filename);
  return upFetch(apiKey, "/upload_photos", { method: "POST", body: form });
}
