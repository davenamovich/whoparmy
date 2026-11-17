import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isUiLocale } from "./config";

// No locale routing (no /[locale] prefix): Whoparmy embeds inside Whop
// experiences, so the locale rides in a cookie — set by the language
// switcher, later also seeded from the member's Whop profile.
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isUiLocale(raw) ? raw : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
