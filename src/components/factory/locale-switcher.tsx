"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, UI_LOCALES, UI_LOCALE_LABELS, isUiLocale } from "@/i18n/config";

/**
 * UI language switcher. The locale rides in the `wa_locale` cookie
 * (see src/i18n/request.ts) — no URL prefix, so Whop experience
 * embeds keep working. router.refresh() re-renders the server
 * layout with the new locale's messages.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => {
        const v = e.target.value;
        if (!isUiLocale(v)) return;
        document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="h-8 rounded-lg border border-border/60 bg-background px-1.5 text-xs text-muted-foreground shrink-0"
    >
      {UI_LOCALES.map((l) => (
        <option key={l} value={l}>
          {UI_LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
