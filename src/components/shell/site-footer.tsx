/**
 * SiteFooter — Design Engine kit footer pattern (2026-11-24).
 * Quiet grid + the standing honesty line, identical on every page.
 */
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/agents", label: "Agents" },
      { href: "/spaces", label: "Spaces" },
      { href: "/rotator", label: "Daily rotator" },
      { href: "/town", label: "Agent Town" },
    ],
  },
  {
    title: "Start",
    links: [
      { href: "/build", label: "Build an agent" },
      { href: "/how", label: "How it works" },
      { href: "/api/auth/whop", label: "Connect" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border pt-8 text-xs text-muted-foreground">
      <div className="grid gap-8 pb-8 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p translate="no" className="font-display text-xs font-extrabold tracking-[0.14em] text-foreground">
            PLUNDER <span className="text-primary">&amp;</span> RIFFLE
          </p>
          <p className="mt-3 max-w-xs leading-relaxed">
            The content engine behind your business. Your agent works on your own credits, and nothing goes out without
            your say-so.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="font-semibold text-foreground">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.href + link.label}>
                  <a className="transition-colors hover:text-foreground" href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-border/60 pt-5 pb-1 leading-relaxed">
        Nothing publishes, sends or spends without your yes on that item. Affiliate and referral money shown anywhere is
        simulated until it&apos;s actually paid. Nothing is guaranteed.
      </p>
    </footer>
  );
}
