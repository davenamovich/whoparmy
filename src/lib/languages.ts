// P&R Global Content Factory — supported language catalog (23 languages).
// Codes are used across the app, the generation engine and Meme Army bots.

export interface LanguageDef {
  code: string;
  label: string; // English name
  native: string; // endonym shown in selectors
  flag: string;
}

export const LANGUAGES: LanguageDef[] = [
  { code: "en", label: "English", native: "English", flag: "🇺🇸" },
  { code: "es", label: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "pt-BR", label: "Portuguese (Brazil)", native: "Português (BR)", flag: "🇧🇷" },
  { code: "fr", label: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", label: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", label: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "tr", label: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "ru", label: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "uk", label: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "ar", label: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "hi", label: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", label: "Bengali", native: "বাংলা", flag: "🇧🇩" },
  { code: "ur", label: "Urdu", native: "اردو", flag: "🇵🇰" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", label: "Malay", native: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "tl", label: "Tagalog", native: "Filipino", flag: "🇵🇭" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th", label: "Thai", native: "ไทย", flag: "🇹🇭" },
  { code: "ja", label: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "zh-CN", label: "Chinese (Simplified)", native: "简体中文", flag: "🇨🇳" },
];

export const LANGUAGE_MAP: Record<string, LanguageDef> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
);

export function languageLabel(code: string): string {
  return LANGUAGE_MAP[code]?.label ?? code;
}

export function isSupportedLanguage(code: string): boolean {
  return Boolean(LANGUAGE_MAP[code]);
}

/**
 * Normalize a raw locale tag (Telegram language_code, a browser or
 * Whop locale, "es-ES", "pt-br", "EN_us"…) to one of the 23 catalog
 * codes, or null when nothing matches. Bare "pt" means pt-BR and
 * bare "zh" means zh-CN in this catalog.
 */
export function normalizeLanguageCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tag = raw.trim().replace("_", "-");
  if (LANGUAGE_MAP[tag]) return tag;
  const lower = tag.toLowerCase();
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const base = lower.split("-")[0];
  if (base === "pt") return "pt-BR";
  if (base === "zh") return "zh-CN";
  const byBase = LANGUAGES.find((l) => l.code.toLowerCase() === base);
  return byBase ? byBase.code : null;
}
