import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
  title: "P&R Global Content Factory — One Idea. 23 Languages. Endless Content.",
  description:
    "Turn any website, business or product into a global content engine. Multilingual AI content studio powered by the Plunder & Riffle engine — plus the Meme Army Telegram upsell.",
  keywords: ["content factory", "AI content", "memes", "multilingual marketing", "Whop", "Plunder & Riffle", "Meme Army"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
