import type { ReactNode } from "react";
import { WhopConnect } from "@/components/shell/whop-connect";
import { MemberNavLinks } from "@/components/shell/member-chrome";

/**
 * SiteHeader — Design Engine kit nav pattern (2026-11-24).
 * Brand left, plain nav centre/right, ONE amber action. Shared by
 * every public page so the whole site reads as one product.
 * `extra` renders page-specific links (admin door, skill.md) before
 * the CTA; ctaHref/ctaLabel preserve pages whose sign-in link
 * differed (e.g. ?next=/build).
 *
 * The action slot is <WhopConnect> (Dave, 2026-11-26): disconnected
 * members see the amber Connect CTA; connected members see GREEN +
 * "Welcome, <First Name>" + a Disconnect button — the OAuth state is
 * visible on every page that carries this header, not just /muse-week.
 *
 * H2 nav demotion (2026-11-26): the member links themselves now come
 * from <MemberNavLinks> (components/shell/member-chrome.tsx) and
 * render ONLY for a connected member — logged-out visitors get the
 * public chrome: logo + Connect. The routes are unchanged.
 */

export function SiteHeader({
  ctaHref = "/api/auth/whop",
  ctaLabel = "Connect",
  extra,
}: {
  ctaHref?: string;
  ctaLabel?: string;
  extra?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <a href="/" translate="no" className="font-display text-xs font-extrabold tracking-[0.14em]">
        PLUNDER <span className="text-primary">&amp;</span> RIFFLE
      </a>
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium">
        <MemberNavLinks />
        {extra}
        <WhopConnect ctaHref={ctaHref} ctaLabel={ctaLabel} />
      </nav>
    </header>
  );
}
