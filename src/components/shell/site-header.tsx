import type { ReactNode } from "react";

/**
 * SiteHeader — Design Engine kit nav pattern (2026-11-24).
 * Brand left, plain nav centre/right, ONE amber action. Shared by
 * every public page so the whole site reads as one product.
 * `extra` renders page-specific links (admin door, skill.md) before
 * the CTA; ctaHref/ctaLabel preserve pages whose sign-in link
 * differed (e.g. ?next=/build).
 */
const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/spaces", label: "Spaces" },
  { href: "/rotator", label: "Rotator" },
  { href: "/town", label: "Town" },
  { href: "/how", label: "How it works" },
  { href: "/build", label: "Build" },
];

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
        {NAV.map((item) => (
          <a key={item.href} className="hidden text-muted-foreground transition-colors hover:text-foreground md:inline" href={item.href}>
            {item.label}
          </a>
        ))}
        {extra}
        <a
          className="rounded-[8px] bg-primary px-3.5 py-2 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          href={ctaHref}
        >
          {ctaLabel}
        </a>
      </nav>
    </header>
  );
}
