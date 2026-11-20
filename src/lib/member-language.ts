import "server-only";
import { db } from "@/lib/db";
import { isSupportedLanguage, languageLabel, normalizeLanguageCode } from "@/lib/languages";

/**
 * ─── MEMBER LANGUAGE (Global expansion Phase 0, Dave 2026-11-19) ───
 * "Foundation only — plumbing everywhere, markets after."
 *
 * One stored language per member; every surface reads it: agent jobs
 * default to it, the bridge brief and the Day-1 prompt carry it, the
 * stack launcher fills it into agent prompts. Resolution order:
 *   1. the member's explicit pick (Account → Your language)
 *   2. a hint — the UI locale, later the Telegram language_code
 *   3. English
 * Only the 23 catalog languages (lib/languages.ts) ever stick.
 * Storage follows the quiz/blueprint precedent: AppSetting under
 * `lang:<userId>`, JSON value — no migration, ever.
 */

const keyFor = (userId: string) => `lang:${userId}`;

export type LanguageSource = "pick" | "locale" | "default";

export interface MemberLanguage {
  language: string;
  label: string;
  source: LanguageSource;
}

/** Pure resolution (unit-testable): stored pick → hint → English. */
export function pickLanguage(stored: string | null, hint: string | null | undefined): MemberLanguage {
  if (stored && isSupportedLanguage(stored)) {
    return { language: stored, label: languageLabel(stored), source: "pick" };
  }
  const normalized = normalizeLanguageCode(hint);
  if (normalized) {
    return { language: normalized, label: languageLabel(normalized), source: "locale" };
  }
  return { language: "en", label: languageLabel("en"), source: "default" };
}

export async function getMemberLanguage(userId: string, hint?: string | null): Promise<MemberLanguage> {
  let stored: string | null = null;
  try {
    const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
    if (row) {
      const parsed = JSON.parse(row.value) as { language?: unknown };
      if (typeof parsed.language === "string") stored = parsed.language;
    }
  } catch {
    stored = null; // a broken row must never take a surface down
  }
  return pickLanguage(stored, hint);
}

/** Store the member's explicit pick. Returns false on an unsupported code. */
export async function setMemberLanguage(userId: string, language: string): Promise<boolean> {
  const normalized = normalizeLanguageCode(language);
  if (!normalized) return false;
  const value = JSON.stringify({ language: normalized, updatedAt: new Date().toISOString() });
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    create: { key: keyFor(userId), value },
    update: { value },
  });
  return true;
}
