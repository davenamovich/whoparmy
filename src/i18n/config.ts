// UI locales for Whoparmy — the language the INTERFACE speaks.
// This is deliberately separate from src/lib/languages.ts, which is the
// 23-language catalog for GENERATED CONTENT. A member can run the UI in
// Spanish while generating content in Japanese; the two never mix.
export const UI_LOCALES = ["en", "es", "ja", "ru"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = "en";
export const LOCALE_COOKIE = "wa_locale";

export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  en: "English",
  es: "Español",
  ja: "日本語",
  ru: "Русский",
};

export function isUiLocale(value: string | undefined | null): value is UiLocale {
  return value != null && (UI_LOCALES as readonly string[]).includes(value);
}
