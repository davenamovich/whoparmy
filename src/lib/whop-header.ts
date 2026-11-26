/**
 * Site-header Whop status — pure derivation (Dave, 2026-11-26).
 *
 * Dave's report: "fix the whop oauth, no way to see if you are
 * connected" — the shared SiteHeader always rendered the amber
 * "Connect" CTA, even for a signed-in member. The header state is
 * derived ONLY from the real GET /api/auth/session response:
 *
 *   session === null/undefined → checking (fetch not resolved yet)
 *   session.connected === false → disconnected (show the Connect CTA)
 *   session.connected === true  → connected: GREEN, "Welcome, <First
 *   Name>", and a Disconnect button (rendered by the client component).
 *
 * First name = first token of the Whop display name; when the name is
 * absent, the Whop username stands in; when both are absent the
 * greeting is a plain "Welcome" — never an invented name.
 */

export interface WhopHeaderSessionLike {
  connected: boolean;
  user: { name?: string | null; whopUsername?: string | null } | null;
}

export type WhopHeaderTone = "checking" | "disconnected" | "connected";

export interface WhopHeaderState {
  tone: WhopHeaderTone;
  /** First name for the greeting, or null when the session carries none. */
  firstName: string | null;
  /** "Welcome, Dave" / "Welcome" when connected; null otherwise. */
  welcomeText: string | null;
}

export function firstNameOf(
  user: { name?: string | null; whopUsername?: string | null } | null | undefined,
): string | null {
  const fromName = user?.name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const fromUsername = user?.whopUsername?.trim();
  if (fromUsername) return fromUsername;
  return null;
}

export function deriveWhopHeader(
  session: WhopHeaderSessionLike | null | undefined,
): WhopHeaderState {
  if (!session) return { tone: "checking", firstName: null, welcomeText: null };
  if (!session.connected) return { tone: "disconnected", firstName: null, welcomeText: null };
  const firstName = firstNameOf(session.user);
  return {
    tone: "connected",
    firstName,
    welcomeText: firstName ? `Welcome, ${firstName}` : "Welcome",
  };
}
