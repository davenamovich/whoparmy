import "server-only";
import { db } from "@/lib/db";
import { etDateString } from "@/lib/rotator";
import {
  hashIp,
  mintUserRotatorCode,
  pickSequential,
  pickWeighted,
  resolveSigningSecret,
  uaFamily,
  validateLinkSet,
  verifyUserRotatorCode,
  type PickableLink,
} from "@/lib/rotator-v2-core";

/**
 * ─── USER ROTATOR V2 — database operations ─────────────────────────
 *
 * This module connects each member's rotator to their own saved
 * EngineLinks, applies their daily hop caps, and records a privacy-safe
 * hop when a destination is served. If recording the hop fails, the
 * redirect still succeeds: analytics must never strand a visitor.
 */

function etMidnight(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;

  // Convert the ET calendar midnight into UTC, correcting for the offset
  // represented at the current guess (including daylight saving changes).
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
    guess += target - represented;
  }

  return new Date(guess);
}

const dayStart = (date: string) => etMidnight(date);

const dayEnd = (date: string) =>
  etMidnight(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(etMidnight(date).getTime() + 36 * 60 * 60 * 1000)),
  );

const secret = () => resolveSigningSecret(process.env);

export async function getMyRotator(userId: string) {
  const rotator = await db.userRotator.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const today = etDateString();
  const from = dayStart(today);
  const to = dayEnd(today);

  const [links, hops] = await Promise.all([
    db.userRotatorLink.findMany({
      where: { rotatorId: rotator.id },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: {
        rotatorId: rotator.id,
        counted: true,
        ts: { gte: from, lt: to },
        linkId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(hops.map((hop) => [hop.linkId!, hop._count._all]));
  const key = secret();

  return {
    ...rotator,
    code: key ? mintUserRotatorCode(rotator.id, key) : null,
    links: links.map((link) => ({ ...link, hopsToday: counts.get(link.id) ?? 0 })),
  };
}

export type RotatorUpdateResult = { ok: true } | { ok: false; error: string };

export async function updateMyRotator(userId: string, input: unknown): Promise<RotatorUpdateResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Invalid rotator settings." };
  }

  const body = input as Record<string, unknown>;
  if (body.mode !== undefined && body.mode !== "SEQUENTIAL" && body.mode !== "WEIGHTED") {
    return { ok: false, error: "Mode must be SEQUENTIAL or WEIGHTED." };
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { ok: false, error: "Enabled must be a boolean." };
  }

  let validated: ReturnType<typeof validateLinkSet> | undefined;
  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) {
      return { ok: false, error: "Links must be an array." };
    }

    const ids = body.links.map((link) =>
      link && typeof link === "object" ? (link as { engineLinkId?: unknown }).engineLinkId : null,
    );
    if (ids.some((id) => typeof id !== "string")) {
      return { ok: false, error: "Every link must belong to you." };
    }

    const ownedRows = await db.engineLink.findMany({
      where: { userId, id: { in: ids as string[] } },
      select: { id: true },
    });
    validated = validateLinkSet(new Set(ownedRows.map((row) => row.id)), body.links);
    if (!validated.ok) {
      return validated;
    }
  }

  const rotator = await db.userRotator.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  await db.$transaction(async (tx) => {
    await tx.userRotator.update({
      where: { id: rotator.id },
      data: {
        ...(body.mode ? { mode: body.mode as string } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled as boolean } : {}),
      },
    });

    if (validated?.ok) {
      await tx.userRotatorLink.deleteMany({ where: { rotatorId: rotator.id } });
      if (validated.links.length) {
        await tx.userRotatorLink.createMany({
          data: validated.links.map((link) => ({ ...link, rotatorId: rotator.id })),
        });
      }
    }
  });

  return { ok: true };
}

export async function serveUserRotator(
  code: string,
  meta: { ip: string | null; ua: string | null; referer: string | null },
): Promise<{ url: string } | null> {
  const key = secret();
  if (!key) {
    return null;
  }

  const verified = verifyUserRotatorCode(code, key);
  if (!verified) {
    return null;
  }

  const rotator = await db.userRotator.findUnique({
    where: { id: verified.rotatorId },
    include: { user: { select: { id: true } } },
  });
  if (!rotator?.enabled) {
    return null;
  }

  const today = etDateString();
  const from = dayStart(today);
  const to = dayEnd(today);
  const [rows, hopCount, hopRows] = await Promise.all([
    db.userRotatorLink.findMany({
      where: {
        rotatorId: rotator.id,
        enabled: true,
        engineLink: { userId: rotator.userId },
      },
      include: { engineLink: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    db.rotatorHop.count({
      where: { rotatorId: rotator.id, counted: true, ts: { gte: from, lt: to } },
    }),
    db.rotatorHop.groupBy({
      by: ["linkId"],
      where: {
        rotatorId: rotator.id,
        counted: true,
        ts: { gte: from, lt: to },
        linkId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map(hopRows.map((hop) => [hop.linkId!, hop._count._all]));
  const picks: PickableLink[] = rows.map((link) => ({
    linkId: link.id,
    weight: link.weight,
    position: link.position,
    hopsToday: counts.get(link.id) ?? 0,
    dailyCap: link.dailyCap,
  }));
  const pick =
    rotator.mode === "SEQUENTIAL"
      ? pickSequential(picks, hopCount)
      : pickWeighted(picks, Math.random());
  if (!pick) {
    return null;
  }

  const selected = rows.find((link) => link.id === pick.linkId)!;
  let refererHost: string | null = null;
  try {
    if (meta.referer) {
      refererHost = new URL(meta.referer).host;
    }
  } catch {
    // Bad referrers have no host.
  }

  try {
    await db.rotatorHop.create({
      data: {
        surface: "USER",
        rotatorId: rotator.id,
        userId: rotator.userId,
        linkId: selected.id,
        code: code.slice(0, 128),
        ipHash: hashIp(meta.ip),
        uaFamily: uaFamily(meta.ua),
        refererHost,
        filtered: false,
        counted: true,
      },
    });
  } catch (err) {
    console.error("[rotator-v2] hop recording failed:", err);
  }

  return { url: selected.engineLink.url };
}
