import { db } from "@/lib/db";
import {
  ClipGuardError,
  assertNotTakedown,
  dedupeBatch,
  isPublicSource,
} from "./guards";
import { assertClipAllowance, type ClipAllowance } from "./usage";

/**
 * Intake: one implementation, two callers.
 *
 * The `/clips` desk (a signed-in human) and `clip_batch` on the Muse
 * bridge both come through here, so the guards cannot drift apart the
 * way two copies of a job pipeline always do. Nothing here renders —
 * rows land as `queued` and Agent37 picks them up.
 */

export interface IntakeUser {
  id: string;
  plan: string;
  /** True when the member has connected their own P&R key. */
  byok?: boolean;
}

export interface IntakeLink {
  url: string;
  credit?: string;
  creditUrl?: string;
  hook?: string;
  clipSeconds?: number;
}

export interface IntakeRefusal {
  url: string;
  reason: string;
  code: string;
}

export interface IntakeResult {
  ok: boolean;
  created: string[];
  refused: IntakeRefusal[];
  allowance: ClipAllowance | null;
  error?: string;
}

function reasonOf(err: unknown): { reason: string; code: string } {
  if (err instanceof ClipGuardError) return { reason: err.hint, code: err.code };
  return { reason: err instanceof Error ? err.message : "That did not work.", code: "INTERNAL" };
}

export async function queueClipLinks(
  user: IntakeUser,
  pageId: string,
  links: IntakeLink[],
  defaultSeconds = 15,
  bridgeTokenId?: string,
): Promise<IntakeResult> {
  const page = await db.clipPage.findFirst({ where: { id: pageId, userId: user.id } });
  if (!page) {
    return { ok: false, created: [], refused: [], allowance: null, error: "No page with that id belongs to you." };
  }

  let unique: string[];
  try {
    unique = dedupeBatch(links.map((l) => l.url));
  } catch (err) {
    const { reason, code } = reasonOf(err);
    return { ok: false, created: [], refused: [{ url: `${links.length} links`, reason, code }], allowance: null, error: reason };
  }

  if (unique.length === 0) {
    return { ok: false, created: [], refused: [], allowance: null, error: "No links in that batch." };
  }

  // Charge before any row is written: 25 links is 25 renders on the
  // member's key, and the allowance is the only thing that bounds it.
  // BYOK members are uncapped here — their own key pays for the renders.
  const allowance = await assertClipAllowance(user.id, user.plan, unique.length, user.byok === true);
  if (!allowance.ok) {
    return { ok: false, created: [], refused: [], allowance, error: allowance.error };
  }

  const byUrl = new Map(links.map((l) => [l.url.trim(), l]));
  const takedowns = await db.clipTakedown.findMany({ select: { creator: true } });
  const pageBlock = new Set(
    parseList(page.creatorBlock).map((c) => c.toLowerCase().replace(/^@/, "")),
  );
  const pageAllow = parseList(page.creatorAllow)
    .map((c) => c.toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  const created: string[] = [];
  const refused: IntakeRefusal[] = [];

  for (const url of unique) {
    const link = byUrl.get(url) ?? { url };
    try {
      const verdict = isPublicSource(url);

      const handle = (link.credit ?? "").toLowerCase().replace(/^@/, "");
      if (handle && pageBlock.has(handle)) {
        throw new ClipGuardError("CREATOR_BLOCKED", `@${handle} is on this page's block list.`);
      }
      if (pageAllow.length && handle && !pageAllow.includes(handle)) {
        throw new ClipGuardError(
          "CREATOR_BLOCKED",
          `@${handle} is not on this page's allow list (${pageAllow.map((c) => `@${c}`).join(", ")}).`,
        );
      }
      assertNotTakedown(handle, takedowns);

      const job = await db.clipJob.create({
        data: {
          userId: user.id,
          pageId: page.id,
          status: "queued",
          sourceUrl: url,
          sourceKind: verdict.kind,
          sourceHost: verdict.host,
          bridgeTokenId: bridgeTokenId ?? null,
          clipSeconds: link.clipSeconds ?? defaultSeconds,
          hook: link.hook ?? null,
          creditWho: link.credit ?? null,
          creditUrl: link.creditUrl ?? null,
        },
      });
      created.push(job.id);
    } catch (err) {
      refused.push({ url, ...reasonOf(err) });
    }
  }

  return { ok: created.length > 0, created, refused, allowance };
}

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
