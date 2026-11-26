/**
 * ─── HOMEPAGE INTAKE — pure validation ───────────────────────────────
 *
 * The logged-out homepage form (SITE-REDO-SPEC-2026-11-26 §4) posts a
 * claim: name, business, website (or no-website), and what they want
 * first. This module is the pure half — no db, no "server-only" — so
 * the rules are unit-testable (intake.test.ts) and the client form can
 * mirror them. The server half (intake-server.ts) resolves the
 * referral code and writes the row.
 *
 * Rules (brief, 2026-11-26):
 *  - name: 1..80 chars (trimmed)
 *  - businessName: 1..120 chars (trimmed)
 *  - website: required unless noWebsite=true; a missing scheme gets
 *    https:// prepended, then it must parse as an http(s) URL.
 *  - intent: one of INTAKE_INTENTS. CEO Experience is recorded only —
 *    no checkout exists yet; the cheap SEO door is dropped (no price here).
 *  - refCode: optional; when present it must match REF_CODE_PATTERN
 *    and is stored uppercased. An invalid code is rejected, never
 *    silently dropped — the form shows the error in plain words.
 *  - source: optional arrival label, trimmed, capped at 64 chars.
 */

export const INTAKE_INTENTS = ["content_pack", "seo_audit", "ceo_experience", "just_agent"] as const;
export type IntakeIntent = (typeof INTAKE_INTENTS)[number];

export const REF_CODE_PATTERN = /^[A-Z0-9_-]{1,64}$/;

export interface IntakeInput {
  name?: unknown;
  businessName?: unknown;
  websiteUrl?: unknown;
  noWebsite?: unknown;
  intent?: unknown;
  refCode?: unknown;
  source?: unknown;
}

export interface NormalizedIntake {
  name: string;
  businessName: string;
  websiteUrl: string | null;
  noWebsite: boolean;
  intent: IntakeIntent;
  refCode: string | null;
  source: string | null;
}

export type IntakeValidation = { ok: true; value: NormalizedIntake } | { ok: false; error: string };

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateIntakeInput(body: IntakeInput): IntakeValidation {
  const name = trimmed(body?.name);
  if (!name) return { ok: false, error: "Add your name." };
  if (name.length > 80) return { ok: false, error: "Name is too long (80 characters max)." };

  const businessName = trimmed(body?.businessName);
  if (!businessName) return { ok: false, error: "Add your business name." };
  if (businessName.length > 120) return { ok: false, error: "Business name is too long (120 characters max)." };

  const noWebsite = body?.noWebsite === true;
  let websiteUrl: string | null = null;
  if (!noWebsite) {
    const raw = trimmed(body?.websiteUrl);
    if (!raw) return { ok: false, error: "Add your website, or tick “No website yet”." };
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
      parsed = new URL(withScheme);
    } catch {
      return { ok: false, error: "That website does not look right — check it and try again." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Website must start with http:// or https://." };
    }
    if (!parsed.hostname.includes(".")) {
      return { ok: false, error: "That website does not look right — check it and try again." };
    }
    websiteUrl = parsed.toString();
  }

  const intent = typeof body?.intent === "string" ? body.intent : "";
  if (!(INTAKE_INTENTS as readonly string[]).includes(intent)) {
    return { ok: false, error: "Pick what you want first." };
  }

  let refCode: string | null = null;
  const rawRef = trimmed(body?.refCode);
  if (rawRef) {
    const upper = rawRef.toUpperCase();
    if (!REF_CODE_PATTERN.test(upper)) return { ok: false, error: "That referral code does not look right." };
    refCode = upper;
  }

  const rawSource = trimmed(body?.source);
  const source = rawSource ? rawSource.slice(0, 64) : null;

  return {
    ok: true,
    value: {
      name,
      businessName,
      websiteUrl,
      noWebsite,
      intent: intent as IntakeIntent,
      refCode,
      source,
    },
  };
}
