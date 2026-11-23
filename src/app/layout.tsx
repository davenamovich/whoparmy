import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getGateState, getSessionOperator } from "@/lib/site-gate";
import { isGateExempt } from "@/lib/gate-paths";
import { PageViewBeacon } from "@/components/analytics/page-view-beacon";

// Self-hosted Geist fonts (latin variable woff2, downloaded 2026-11-16 from
// Google Fonts). next/font/google fetches at build time, which fails on
// hosts whose build egress requires a proxy — local files build anywhere.
const geistSans = localFont({
  src: "./fonts/geist-sans.woff2",
  variable: "--font-geist-sans",
  weight: "400 700",
});

const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "400 700",
});

export const metadata: Metadata = {
  // One-time-door overhaul (Dave, 2026-11-20): no hype ("endless",
  // unverified "23 languages") and no internal funnel words in public
  // metadata.
  title: "Plunder & Riffle — get your agent",
  description:
    "Give your agent its bridge code: its connection to the Plunder & Riffle engine, on your own credits. One sign-in, once.",
  keywords: ["Plunder & Riffle", "AI agent", "memes", "Whop", "The BTC Experiment"],
  authors: [{ name: "Plunder & Riffle" }],
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0c0a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ─── Site gate ────────────────────────────────────────────────────
  // While the gate is ON, page routes are operators-only: anyone
  // without a designated-operator session is redirected to /gate
  // before any page renders. Route handlers (/api/*) never pass
  // through this layout, so bridge endpoints, Whop OAuth and webhooks
  // keep working; static assets bypass it too. The pathname arrives
  // via the x-pathname header stamped in middleware.ts.
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // Pages reachable while the gate is ON (lib/gate-paths.ts):
  // - the agent link (/connect/<code>): the code inside the URL IS the
  //   credential; viewing never consumes it (findLiveBridgeCode is
  //   read-only) and /api/bridge/exchange re-checks eligibility.
  // - the game hand-off (/bridge, /claim — Dave, 2026-11-20): the BTC
  //   Experiment's "ACTIVATE YOUR AGENT" and claim links land here, and
  //   both pages carry their own Whop sign-in. Gated, every player who
  //   finished the game hit "closed for now".
  if (!isGateExempt(pathname)) {
    const gate = await getGateState();
    if (gate.on && !(await getSessionOperator())) {
      redirect("/gate");
    }
  }

  const locale = await getLocale();
  // The gate page must carry nothing member-facing — including the
  // i18n dictionary, whose catalog contains member product copy
  // (War Room strings etc.) and would otherwise be serialized into
  // the gate page's payload by the provider below. The gate page
  // itself uses no translations.
  const messages = pathname === "/gate" ? {} : await getMessages();
  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PageViewBeacon />
          {children}
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
