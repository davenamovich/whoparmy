import { redirect } from "next/navigation";
import { getGateState, getSessionOperator } from "@/lib/site-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The gate page — the ONLY page a non-operator can see while the site
 * gate is on. Deliberately content-free: no nav, no member data, no
 * product surfaces. Just the brand, the closed notice, and the Whop
 * sign-in so a designated operator can log in and pass (the OAuth
 * callback lives under /api, which the gate never blocks).
 */
export default async function GatePage() {
  const gate = await getGateState();
  const operator = await getSessionOperator();
  // Nothing to gate: the site is open, or this visitor may pass.
  if (!gate.on || operator) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          Plunder &amp; Riffle
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Whoparmy is closed for now
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We&apos;re rebuilding behind the curtain. Members&apos; agents keep
          working through the bridge — this door reopens when the next stack
          is ready.
        </p>
        <a
          href="/api/auth/whop"
          className="mt-8 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Log in with Whop
        </a>
        <p className="mt-4 text-xs text-muted-foreground">
          Operator sign-in only while the gate is up.
        </p>
      </div>
    </main>
  );
}
