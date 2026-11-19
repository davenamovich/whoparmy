/**
 * Egress policy for server-side fetches of member-supplied URLs
 * (pure — unit-tested).
 *
 * Several lanes fetch URLs a member typed (brand research, media
 * downloads for posting). Without a policy those fetches are an SSRF
 * lane into the host's network: cloud metadata endpoints, loopback
 * admin panels, private LAN addresses. This module is the single
 * gate: https only (http behind an explicit env flag), no embedded
 * credentials, and no literal private/loopback/link-local IPs or
 * local hostnames.
 *
 * Known limit: this checks the URL as written. A public hostname
 * that RESOLVES to a private address (DNS rebinding) is not caught
 * here — the fetch callers additionally validate every redirect hop,
 * which closes the common redirect-to-internal variant.
 */

export class EgressError extends Error {
  code = "EGRESS_BLOCKED";
}

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 0) return true; // 0/8 "this host"
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function ipv6Blocked(host: string): boolean {
  const ip = host.toLowerCase();
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true; // fe80::/10 link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 unique-local
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice("::ffff:".length);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return ipv4Blocked(v4);
    return true;
  }
  return false;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.google"]);

/**
 * Validate a member-supplied URL for server-side fetching.
 * Returns the parsed URL or throws EgressError.
 */
export function assertPublicHttpUrl(raw: string, opts: { allowHttp?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EgressError("That URL could not be parsed.");
  }
  const allowHttp = opts.allowHttp ?? process.env.EGRESS_ALLOW_HTTP === "1";
  if (url.protocol === "http:") {
    if (!allowHttp) throw new EgressError("Only https URLs can be fetched.");
  } else if (url.protocol !== "https:") {
    throw new EgressError("Only http(s) URLs can be fetched.");
  }
  if (url.username || url.password) {
    throw new EgressError("URLs with embedded credentials cannot be fetched.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new EgressError("That URL has no host.");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".localhost")) {
    throw new EgressError("That host cannot be fetched.");
  }
  if (host.includes(":") || host.startsWith("[")) {
    if (ipv6Blocked(host.replace(/^\[|\]$/g, ""))) throw new EgressError("That address cannot be fetched.");
  } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (ipv4Blocked(host)) throw new EgressError("That address cannot be fetched.");
  }
  return url;
}

/**
 * Fetch with manual redirect following: every hop is re-validated
 * against the egress policy (a public URL must not redirect into
 * the internal network). At most 5 hops.
 */
export async function fetchWithEgress(
  raw: string,
  init: RequestInit = {},
  opts: { allowHttp?: boolean; maxHops?: number } = {},
): Promise<Response> {
  const maxHops = opts.maxHops ?? 5;
  let current = assertPublicHttpUrl(raw, opts).toString();
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      if (hop === maxHops) throw new EgressError("Too many redirects.");
      current = assertPublicHttpUrl(new URL(location, current).toString(), opts).toString();
      continue;
    }
    return res;
  }
  throw new EgressError("Too many redirects.");
}
