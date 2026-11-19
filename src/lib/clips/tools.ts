import { db } from "@/lib/db";
import { ClipGuardError, clipSeconds } from "./guards";
import { queueClipLinks, type IntakeLink } from "./intake";
import { assertClipAllowance, countMonthlyClips } from "./usage";

/**
 * The Clipper's local tool family, served on the Muse bridge.
 *
 * `/api/bridge/mcp` hands any `clip_*` call here instead of forwarding it
 * to the engine. Muse can set up a page, add links, read the queue and
 * revise a draft. It cannot approve, export or publish — those are not
 * tools it can reach, and `approved` is only ever written by the signed-in
 * review desk.
 *
 * Ground rule: these handlers never render. They write rows. Agent37
 * claims `queued` rows and calls P&R MCP on the member's own key.
 */

export interface ClipUser {
  id: string;
  plan: string;
  /** Set when the member's own P&R key is connected (BYOK). */
  byok?: boolean;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const CLIP_TOOLS: McpToolDef[] = [
  {
    name: "clip_page_setup",
    description:
      "Set up or update a clipping page: name, handle, the one niche angle, platforms, timezone, cadence, and any creator allow/block list. The clipping agent asks these once per page and never again. Publication controls stay with the member.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Update this page instead of creating one." },
        name: { type: "string", description: 'Page name, e.g. "GTA 6 Daily".' },
        handle: { type: "string", description: "The page's handle, e.g. @gtadaily6." },
        niche: { type: "string", description: "The single angle this page runs. One sentence." },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: 'Where it posts, e.g. ["tiktok","reels","shorts"].',
        },
        timezone: { type: "string", description: "IANA timezone, e.g. Europe/London." },
        approval_hours: { type: "string", description: '"09:00-22:00" — nothing is approved outside it.' },
        cadence: {
          type: "object",
          description: 'Clips per day by platform, e.g. {"tiktok":2,"reels":1}.',
        },
        disclosure: {
          type: "string",
          description: 'Required for fan pages, e.g. "Not affiliated with Rockstar Games". Goes in the copy.',
        },
        creator_allow: { type: "array", items: { type: "string" }, description: "Only clip these creators. Empty = any public source." },
        creator_block: { type: "array", items: { type: "string" }, description: "Never clip these creators on this page." },
      },
      required: ["name", "handle", "niche"],
    },
  },
  {
    name: "clip_page_get",
    description:
      "Read a page's setup. Pass no page_id to list every page the member runs, with its clip counts by state.",
    inputSchema: {
      type: "object",
      properties: { page_id: { type: "string" } },
    },
  },
  {
    name: "clip_batch",
    description:
      "Add up to 25 public clip links to a page's queue. Each link is guard-checked first (public, not a leak, resolvable) and the batch is charged against the member's monthly clip allowance. This queues work — Agent37 renders it. Nothing is exported, approved or posted by this call. Pass a creator credit per link or the clip cannot leave the queue later.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        links: {
          type: "array",
          description:
            'Up to 25. Either plain URLs, or objects { url, credit, credit_url, hook, clip_seconds }.',
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  url: { type: "string" },
                  credit: { type: "string", description: "The creator's handle, e.g. @studio." },
                  credit_url: { type: "string", description: "The creator's own post." },
                  hook: { type: "string", description: "First-second on-screen line. Omit to derive from the clip." },
                  clip_seconds: { type: "number", description: "3–30. Default 15." },
                },
                required: ["url"],
              },
            ],
          },
        },
        clip_seconds: { type: "number", description: "Default length for links that don't set one." },
      },
      required: ["page_id", "links"],
    },
  },
  {
    name: "clip_queue",
    description:
      "Read the page's clips by state (draft, queued, rendering, ready, approved, exported, failed, blocked). Read-only; nothing is charged.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string" },
        status: { type: "string", description: "Filter to one state. Omit for everything open." },
        limit: { type: "number", description: "Default 25, max 100." },
      },
    },
  },
  {
    name: "clip_get",
    description:
      "Read one clip: hook, caption, the engine's QA warnings in plain words, and its state. Use this before telling the member anything about a clip.",
    inputSchema: {
      type: "object",
      properties: { clip_id: { type: "string" } },
      required: ["clip_id"],
    },
  },
  {
    name: "clip_revise",
    description:
      "Rewrite the hook or caption of a clip that has not been approved, and send it back to the queue to render again. Charged as a new render. An approved clip cannot be revised — approval would not survive the change.",
    inputSchema: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        hook: { type: "string" },
        caption: { type: "string" },
      },
      required: ["clip_id"],
    },
  },
  {
    name: "clip_mark_posted",
    description:
      "Record that the member posted a clip themselves, so the cadence board is honest. Log only — this does not post anything and does not publish anywhere.",
    inputSchema: {
      type: "object",
      properties: {
        clip_id: { type: "string" },
        platform: { type: "string" },
        external_url: { type: "string" },
      },
      required: ["clip_id", "platform"],
    },
  },
];

const CLIP_TOOL_NAMES = new Set(CLIP_TOOLS.map((t) => t.name));

export function isClipTool(name: string): boolean {
  return CLIP_TOOL_NAMES.has(name);
}

// ─── argument helpers ───────────────────────────────────────────────

function asString(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ClipGuardError("NOT_PUBLIC", `${field} is required.`);
    return undefined;
  }
  if (typeof value !== "string") throw new ClipGuardError("NOT_PUBLIC", `${field} must be text.`);
  return value.trim();
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function text(message: string, isError = false) {
  return { content: [{ type: "text" as const, text: message }], ...(isError ? { isError: true } : {}) };
}

function guardText(err: unknown): string {
  if (err instanceof ClipGuardError) return `${err.hint} (${err.code})`;
  return err instanceof Error ? err.message : "That did not work.";
}

// ─── handlers ───────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function pageSetup(user: ClipUser, args: Args) {
  const pageId = asString(args.page_id, "page_id");
  const data = {
    name: asString(args.name, "name", !pageId),
    handle: asString(args.handle, "handle", !pageId),
    niche: asString(args.niche, "niche", !pageId),
    platforms: args.platforms !== undefined ? JSON.stringify(asStringArray(args.platforms) ?? []) : undefined,
    timezone: asString(args.timezone, "timezone"),
    approvalHours: asString(args.approval_hours, "approval_hours"),
    cadence: args.cadence !== undefined ? JSON.stringify(args.cadence) : undefined,
    disclosure: asString(args.disclosure, "disclosure"),
    creatorAllow: args.creator_allow !== undefined ? JSON.stringify(asStringArray(args.creator_allow) ?? []) : undefined,
    creatorBlock: args.creator_block !== undefined ? JSON.stringify(asStringArray(args.creator_block) ?? []) : undefined,
  };

  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (!pageId) {
    const created = await db.clipPage.create({ data: { userId: user.id, ...clean } as never });
    return text(
      `Page "${created.name}" is set up at @${created.handle.replace(/^@/, "")}. Nothing renders until you add links with clip_batch.\n\n${JSON.stringify(created.platforms)} · ${created.timezone}${created.disclosure ? `\nDisclosure in every caption: ${created.disclosure}` : ""}`,
    );
  }

  const owned = await db.clipPage.findFirst({ where: { id: pageId, userId: user.id } });
  if (!owned) return text("No page with that id belongs to you.", true);
  const updated = await db.clipPage.update({ where: { id: pageId }, data: clean as never });
  return text(`Updated "${updated.name}". Existing clips keep their settings.`);
}

async function pageGet(user: ClipUser, args: Args) {
  const pageId = asString(args.page_id, "page_id");

  if (pageId) {
    const page = await db.clipPage.findFirst({ where: { id: pageId, userId: user.id } });
    if (!page) return text("No page with that id belongs to you.", true);
    const counts = await db.clipJob.groupBy({ by: ["status"], where: { pageId: page.id }, _count: true });
    const byState = counts.map((c) => `${c.status} ${c._count}`).join(", ") || "no clips yet";
    return text(
      `@${page.handle.replace(/^@/, "")} — ${page.name}\n` +
        `Niche: ${page.niche}\nPlatforms: ${parseJson<string[]>(page.platforms, []).join(", ") || "none set"}\n` +
        `Cadence: ${JSON.stringify(parseJson<Record<string, number>>(page.cadence, {}))}\n` +
        `Approval hours: ${page.approvalHours ?? "any"}\n` +
        `Disclosure: ${page.disclosure ?? "none"}\n` +
        `Clips: ${byState}`,
    );
  }

  const pages = await db.clipPage.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: "asc" } });
  if (pages.length === 0) return text("No clipping pages yet. Set one up with clip_page_setup.");
  const used = await countMonthlyClips(user.id);
  return text(
    `${pages.length} page${pages.length === 1 ? "" : "s"} · ${used} clips charged this month\n\n` +
      pages.map((p) => `• ${p.name} (@${p.handle.replace(/^@/, "")}) — ${p.niche}`).join("\n"),
  );
}

interface LinkInput {
  url: string;
  credit?: string;
  creditUrl?: string;
  hook?: string;
  clipSeconds?: number;
}

function readLinks(raw: unknown, defaultSeconds: number): LinkInput[] {
  if (!Array.isArray(raw)) throw new ClipGuardError("NOT_PUBLIC", "links must be a list of URLs.");
  return raw.map((item, i) => {
    if (typeof item === "string") return { url: item, clipSeconds: defaultSeconds };
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const url = typeof obj.url === "string" ? obj.url : "";
      if (!url) throw new ClipGuardError("NOT_PUBLIC", `Link ${i + 1} has no url.`);
      return {
        url,
        credit: typeof obj.credit === "string" ? obj.credit : undefined,
        creditUrl: typeof obj.credit_url === "string" ? obj.credit_url : undefined,
        hook: typeof obj.hook === "string" ? obj.hook : undefined,
        clipSeconds: obj.clip_seconds !== undefined ? clipSeconds(obj.clip_seconds) : defaultSeconds,
      };
    }
    throw new ClipGuardError("NOT_PUBLIC", `Link ${i + 1} is not a URL or an object.`);
  });
}

async function batch(user: ClipUser, args: Args, bridgeTokenId?: string) {
  const pageId = asString(args.page_id, "page_id", true)!;
  const defaultSeconds = clipSeconds(args.clip_seconds);
  const links = readLinks(args.links, defaultSeconds);

  const result = await queueClipLinks(
    user,
    pageId,
    links.map((l) => ({
      url: l.url,
      credit: l.credit,
      creditUrl: l.creditUrl,
      hook: l.hook,
      clipSeconds: l.clipSeconds,
    })),
    defaultSeconds,
    bridgeTokenId,
  );

  if (result.error && result.created.length === 0 && result.refused.length === 0) {
    return text(result.error, true);
  }

  const lines: string[] = [];
  lines.push(
    result.created.length
      ? `${result.created.length} clip${result.created.length === 1 ? "" : "s"} queued. Agent37 renders them on the member's own key; each one waits for approval at /clips before anything is exported.`
      : "Nothing was queued.",
  );
  if (result.allowance && result.allowance.lane !== "byok") {
    const left = Math.max(0, result.allowance.left);
    const paid = result.allowance.paidLeft > 0 ? ` (${result.allowance.paidLeft} bought, rest on the plan)` : "";
    lines.push(`Left after this batch: ${left}${paid}.`);
  } else if (result.allowance?.lane === "byok") {
    lines.push("You are on your own key, so nothing counts against a cap.");
  }
  if (result.refused.length) {
    lines.push(`\n${result.refused.length} refused:`);
    lines.push(...result.refused.map((r) => `• ${r.url} — ${r.reason}`));
  }
  lines.push("\nA clip with no creator credit will not leave the queue — pass credit and credit_url when you can.");
  return text(lines.join("\n"), result.created.length === 0);
}

async function queue(user: ClipUser, args: Args) {
  const pageId = asString(args.page_id, "page_id");
  const status = asString(args.status, "status");
  const limitRaw = typeof args.limit === "number" ? args.limit : Number(args.limit ?? 25);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 25));

  const where = {
    userId: user.id,
    ...(pageId ? { pageId } : {}),
    ...(status ? { status } : { status: { in: ["queued", "rendering", "ready", "approved", "blocked", "failed"] } }),
  };

  const clips = await db.clipJob.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
  if (clips.length === 0) return text(status ? `No clips in ${status}.` : "The queue is empty.");

  return text(
    clips
      .map((c) => {
        const credit = c.creditWho ? ` · ${c.creditWho}` : " · no credit yet";
        const hook = c.hook ? `\n   hook: ${c.hook}` : "";
        const why = c.blockedReason ? `\n   ${c.blockedReason}` : "";
        return `• [${c.status}] ${c.id.slice(-6)} ${c.sourceUrl}${credit}${hook}${why}`;
      })
      .join("\n"),
  );
}

async function get(user: ClipUser, args: Args) {
  const id = asString(args.clip_id, "clip_id", true)!;
  const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
  if (!clip) return text("No clip with that id belongs to you.", true);

  const warnings = parseJson<string[]>(clip.warnings, []);
  const lines = [
    `${clip.status.toUpperCase()} — ${clip.sourceUrl}`,
    `Hook: ${clip.hook ?? "not set (derived from the clip when it renders)"}`,
    `Caption: ${clip.caption ?? "not rendered yet"}`,
    `Credit: ${clip.creditWho ?? "MISSING — this clip cannot be exported until it has one"}`,
    `Preview: ${clip.pageUrl ?? "none yet"}`,
  ];
  if (warnings.length) {
    lines.push(`\nEngine warnings:`);
    lines.push(...warnings.map((w) => `• ${w}`));
  }
  if (clip.blockedReason) lines.push(`\nBlocked: ${clip.blockedReason}`);
  if (clip.status === "approved") lines.push("\nApproved by the member. Export is theirs to trigger.");
  return text(lines.join("\n"));
}

async function revise(user: ClipUser, args: Args) {
  const id = asString(args.clip_id, "clip_id", true)!;
  const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
  if (!clip) return text("No clip with that id belongs to you.", true);
  if (clip.status === "approved" || clip.status === "exported") {
    return text(
      "That clip is approved already. Changing it would make the approval meaningless — approve again after a new render, or leave it as it is.",
      true,
    );
  }
  const hook = asString(args.hook, "hook");
  const caption = asString(args.caption, "caption");
  if (!hook && !caption) return text("Nothing to change: pass a hook or a caption.", true);

  const allowance = await assertClipAllowance(user.id, user.plan, 1);
  if (!allowance.ok) return text(allowance.error ?? "No allowance left this month.", true);

  await db.clipJob.update({
    where: { id: clip.id },
    data: {
      hook: hook ?? clip.hook,
      caption: caption ?? clip.caption,
      status: "queued",
      approvedAt: null,
      pageUrl: null,
      mp4Url: null,
      error: null,
    },
  });
  return text("Queued for a fresh render. The old preview is gone — approve the new one at /clips.");
}

async function markPosted(user: ClipUser, args: Args) {
  const id = asString(args.clip_id, "clip_id", true)!;
  const platform = asString(args.platform, "platform", true)!;
  const externalUrl = asString(args.external_url, "external_url");

  const clip = await db.clipJob.findFirst({ where: { id, userId: user.id } });
  if (!clip) return text("No clip with that id belongs to you.", true);
  if (clip.status !== "exported" && clip.status !== "approved") {
    return text(`That clip is ${clip.status}. Nothing is posted from a clip that was never approved and exported.`, true);
  }

  await db.clipPost.create({
    data: { userId: user.id, clipId: clip.id, platform, externalUrl: externalUrl ?? null },
  });
  return text(`Logged: posted to ${platform}. The cadence board counts it; nothing else changed.`);
}

// ─── dispatch ───────────────────────────────────────────────────────

export type ClipToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export async function callClipTool(user: ClipUser, name: string, args: Args = {}, bridgeTokenId?: string): Promise<ClipToolResult> {
  try {
    switch (name) {
      case "clip_page_setup":
        return await pageSetup(user, args);
      case "clip_page_get":
        return await pageGet(user, args);
      case "clip_batch":
        return await batch(user, args, bridgeTokenId);
      case "clip_queue":
        return await queue(user, args);
      case "clip_get":
        return await get(user, args);
      case "clip_revise":
        return await revise(user, args);
      case "clip_mark_posted":
        return await markPosted(user, args);
      default:
        return text(`The Clipper has no tool called ${name}.`, true);
    }
  } catch (err) {
    return text(guardText(err), true);
  }
}
