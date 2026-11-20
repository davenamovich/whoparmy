import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * ─── USER ROTATOR V2 — pure core ───────────────────────────────────
 *
 * Dave's rule: a rotator can only point at the owner's own saved
 * EngineLinks. The code and pick helpers live here so that ownership,
 * link limits, and destination selection are easy to validate without
 * database state. Hop records keep only a hash of the IP, never the raw
 * address, and a failed hop write must never interrupt a redirect.
 */

export function rotatorV2Enabled(env: NodeJS.ProcessEnv): boolean {
  return env.ROTATOR_V2 === "1";
}

export function resolveSigningSecret(env: NodeJS.ProcessEnv): string | null {
  return env.ROTATOR_SIGNING_SECRET?.trim() || env.SESSION_SECRET?.trim() || null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintUserRotatorCode(rotatorId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ r: rotatorId })).toString("base64url");
  return `v1.${payload}.${sign(payload, secret)}`;
}

export function verifyUserRotatorCode(code: string, secret: string): { rotatorId: string } | null {
  const parts = String(code ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }

  const expected = sign(parts[1], secret);
  const actualBytes = Buffer.from(parts[2]);
  const expectedBytes = Buffer.from(expected);

  // timingSafeEqual requires equal-length buffers, so check lengths first.
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    return null;
  }

  try {
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return value && typeof value.r === "string" && value.r ? { rotatorId: value.r } : null;
  } catch {
    return null;
  }
}

export interface PickableLink {
  linkId: string;
  weight: number;
  position: number;
  hopsToday: number;
  dailyCap: number | null;
}

function eligible(links: PickableLink[]): PickableLink[] {
  // Capped links leave the pool as soon as today's counted hops reach the cap.
  return links
    .filter((link) => link.dailyCap === null || link.hopsToday < link.dailyCap)
    .sort((a, b) => a.position - b.position || a.linkId.localeCompare(b.linkId));
}

export function pickSequential(links: PickableLink[], hopIndex: number): PickableLink | null {
  const available = eligible(links);
  if (!available.length) {
    return null;
  }

  return available[((hopIndex % available.length) + available.length) % available.length];
}

export function pickWeighted(links: PickableLink[], rand: number): PickableLink | null {
  const available = eligible(links);
  const weights = available.map((link) => Math.max(1, link.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!available.length || total <= 0) {
    return null;
  }

  let bucket = Math.min(Math.max(rand, 0), 0.999999999) * total;
  for (let i = 0; i < available.length; i++) {
    if (bucket < weights[i]) {
      return available[i];
    }
    bucket -= weights[i];
  }

  return available[available.length - 1];
}

export function uaFamily(ua: string | null): string {
  const value = ua ?? "";
  if (!value) {
    return "Other";
  }
  if (/bot|spider|crawler|slurp/i.test(value)) {
    return "Bot";
  }
  if (/Edg\//i.test(value)) {
    return "Edge";
  }
  if (/Chrome\//i.test(value)) {
    return "Chrome";
  }
  if (/Firefox\//i.test(value)) {
    return "Firefox";
  }
  if (/Safari\//i.test(value)) {
    return "Safari";
  }
  return "Other";
}

export function hashIp(ip: string | null): string | null {
  return ip == null ? null : createHash("sha256").update(ip).digest("hex");
}

export type LinkInput = {
  engineLinkId: unknown;
  weight?: unknown;
  dailyCap?: unknown;
  position?: unknown;
  enabled?: unknown;
};

export function validateLinkSet(
  owned: Set<string>,
  links: unknown,
):
  | {
      ok: true;
      links: Array<{
        engineLinkId: string;
        weight: number;
        dailyCap: number | null;
        position: number;
        enabled: boolean;
      }>;
    }
  | { ok: false; error: string } {
  if (!Array.isArray(links)) {
    return { ok: false, error: "Links must be an array." };
  }

  const output: Array<{
    engineLinkId: string;
    weight: number;
    dailyCap: number | null;
    position: number;
    enabled: boolean;
  }> = [];
  const seenEngineLinkIds = new Set<string>();

  for (const raw of links as LinkInput[]) {
    if (!raw || typeof raw.engineLinkId !== "string" || !owned.has(raw.engineLinkId)) {
      return { ok: false, error: "Every link must belong to you." };
    }
    if (seenEngineLinkIds.has(raw.engineLinkId)) {
      return { ok: false, error: "Each link can only appear once." };
    }
    seenEngineLinkIds.add(raw.engineLinkId);

    const weight = raw.weight === undefined ? 1 : raw.weight;
    const dailyCap = raw.dailyCap === undefined ? null : raw.dailyCap;
    const position = raw.position === undefined ? 0 : raw.position;
    const enabled = raw.enabled === undefined ? true : raw.enabled;

    if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 1 || weight > 100) {
      return { ok: false, error: "Weight must be an integer from 1 to 100." };
    }
    if (
      !(dailyCap === null ||
        (typeof dailyCap === "number" &&
          Number.isInteger(dailyCap) &&
          dailyCap >= 1 &&
          dailyCap <= 100000))
    ) {
      return { ok: false, error: "Daily cap is invalid." };
    }
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 1000 ||
      typeof enabled !== "boolean"
    ) {
      return { ok: false, error: "Link settings are invalid." };
    }

    output.push({
      engineLinkId: raw.engineLinkId,
      weight: weight as number,
      dailyCap: dailyCap as number | null,
      position: position as number,
      enabled,
    });
  }

  return { ok: true, links: output };
}
