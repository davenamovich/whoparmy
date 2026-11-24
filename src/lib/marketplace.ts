export interface Bundle { files: Array<{ path: string; text: string }> }
export interface Manifest { skills: string[]; keys: unknown[] }
export interface BatteryInput {
  bundle: unknown;
  manifest: Manifest | null;
  listing: { name: string; priceCents: number; demoKind: string | null; videoUrl: string | null };
  demoProbe: { reachable: boolean; contentType: string | null } | null;
  skillExists: (name: string) => boolean;
  oneInput: unknown;
}
export interface BatteryCheck { id: string; label: string; pass: boolean; reason: string }

export function splitSale(grossCents: number): { sellerCents: number; platformCents: number; referrerCents: number } {
  const gross = Math.max(0, Math.trunc(grossCents));
  const sellerCents = Math.round(gross * 0.70);
  const platformCents = Math.round(gross * 0.15);
  return { sellerCents, platformCents, referrerCents: gross - sellerCents - platformCents };
}

export function canDownloadKit(input: { isOwner: boolean; priceCents: number; hasActiveSale: boolean }): boolean {
  return input.isOwner || input.priceCents === 0 || input.hasActiveSale;
}

export const LISTING_FEE_CENTS = 2000;
export type ListingFeeStatus = "UNPAID" | "PENDING" | "PAID" | "WAIVED";
export function publishGate(input: { batteryReady: boolean; feeStatus: ListingFeeStatus; reviewRequired: boolean; reviewApproved: boolean; isOperator: boolean }): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.batteryReady) reasons.push("Battery is not ready.");
  if (!input.isOperator && input.feeStatus !== "PAID" && input.feeStatus !== "WAIVED") reasons.push("Listing fee is not paid.");
  if (!input.isOperator && input.reviewRequired && !input.reviewApproved) reasons.push("Operator review is not approved.");
  return { ok: reasons.length === 0, reasons };
}
export function isTrustedSeller(publishedCount: number): boolean { return publishedCount >= 3; }

export function validateBundle(input: unknown): { ok: true; bundle: Bundle } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || !Array.isArray((input as Bundle).files)) return { ok: false, error: "Bundle files must be an array." };
  const files = (input as Bundle).files;
  if (files.length < 1 || files.length > 200) return { ok: false, error: "Bundle must contain 1 to 200 files." };
  const seen = new Set<string>(); let total = 0;
  for (const f of files) {
    if (!f || typeof f.path !== "string" || typeof f.text !== "string") return { ok: false, error: "Each bundle file needs a path and text." };
    if (!f.path || f.path.length > 200 || f.path.startsWith("/") || f.path.split(/[\\/]/).includes("..") || /^[A-Za-z]:/.test(f.path)) return { ok: false, error: `Invalid bundle path: ${f.path}` };
    if (f.text.length > 200_000) return { ok: false, error: `File is too large: ${f.path}` };
    if (seen.has(f.path)) return { ok: false, error: `Duplicate bundle path: ${f.path}` };
    seen.add(f.path); total += f.text.length;
  }
  if (total > 2_000_000) return { ok: false, error: "Bundle exceeds 2,000,000 characters." };
  return { ok: true, bundle: { files: files.map(({ path, text }) => ({ path, text })) } };
}

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["surrogate", /hsurr:[A-Za-z0-9._~-]+/g], ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["github-token", /\bgh[po]_[A-Za-z0-9]{30,}\b/g], ["aws-key", /\bAKIA[A-Z0-9]{16}\b/g],
  ["xai-key", /\bxai-[A-Za-z0-9_-]{20,}\b/g], ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["jwt", /(?:authorization|token|secret|api[_-]?key|password)[^\n]{0,40}eyJ[A-Za-z0-9_-]{38,}\.?[A-Za-z0-9_.-]*/gi],
  ["credential", /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']([^"'\s]{12,})["']/gi],
];
export function scanForSecrets(bundle: unknown): Array<{ path: string; kind: string }> {
  const checked = validateBundle(bundle); if (!checked.ok) return [];
  const findings: Array<{ path: string; kind: string }> = [];
  for (const file of checked.bundle.files) for (const [kind, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(file.text))) {
      // Generic credential patterns should ignore obvious placeholder values only.
      if (kind === "credential" && /^(?:YOUR_[A-Z0-9_]+|\.\.\.|<[^>]+>)$/i.test(match[1] ?? "")) continue;
      findings.push({ path: file.path, kind });
      break;
    }
  }
  return findings;
}

export function runBattery(input: BatteryInput): { status: "READY" | "NEEDS_WORK"; checks: BatteryCheck[] } {
  const valid = validateBundle(input.bundle);
  const files = valid.ok ? valid.bundle.files : [];
  const findings = scanForSecrets(input.bundle);
  const manifest = input.manifest;
  const keysOk = Boolean(manifest && Array.isArray(manifest.keys) && manifest.keys.length > 0 && manifest.keys.every((k) => {
    if (typeof k === "string") return Boolean(k.trim());
    if (!k || typeof k !== "object") return false;
    const o = k as Record<string, unknown>; return [o.service, o.name, o.key, o.label].some((x) => typeof x === "string" && Boolean(x.trim()));
  }));
  const bundleShape = valid.ok && files.some((f) => /build[-_ ]?prompt/i.test(f.path) || f.path === "BUILD-PROMPT.md") &&
    (files.some((f) => /(^|[/\\])(?:keys?|\.env\.example)(?:\.[^/\\]*)?$/i.test(f.path)) || keysOk);
  const checks: BatteryCheck[] = [
    { id: "secrets", label: "No embedded secrets", pass: findings.length === 0, reason: findings.length ? findings.map((f) => `${f.kind} in ${f.path}`).join(", ") : "No secret patterns found." },
    { id: "bundle-shape", label: "Bundle has required files", pass: Boolean(bundleShape), reason: !valid.ok ? valid.error : bundleShape ? "Build prompt and keys declaration found." : "Bundle needs a build prompt and keys file or manifest keys." },
    { id: "manifest", label: "Replication manifest is complete", pass: Boolean(manifest && manifest.skills.length > 0 && manifest.skills.every(input.skillExists) && keysOk), reason: !manifest ? "Manifest is missing or invalid." : manifest.skills.length === 0 ? "Manifest must name at least one skill." : !manifest.skills.every(input.skillExists) ? "Manifest names an unknown skill." : !keysOk ? "Manifest keys must name a service." : "Manifest skills and keys are valid." },
    ...(() => { const required = input.listing.priceCents > 0 || Boolean(input.listing.videoUrl); const pass = !required || Boolean(input.demoProbe?.reachable && input.demoProbe.contentType && (/^video\//i.test(input.demoProbe.contentType) || input.demoProbe.contentType.toLowerCase() === "application/octet-stream")); return [{ id: "demo", label: "Demo is reachable", pass, reason: !required ? "No demo required for this free listing." : !input.demoProbe ? "demo could not be probed" : pass ? "Demo probe passed." : "Video URL must respond with video/* or application/octet-stream." }]; })(),
    { id: "one-input", label: "One input is declared", pass: typeof input.oneInput === "string" && Boolean(input.oneInput.trim()) && input.oneInput.length <= 140, reason: typeof input.oneInput === "string" && input.oneInput.trim() && input.oneInput.length <= 140 ? "One input declaration is valid." : "oneInput must be a non-empty string of at most 140 characters." },
    { id: "price", label: "Price is within the allowed range", pass: Number.isInteger(input.listing.priceCents) && input.listing.priceCents >= 0 && input.listing.priceCents <= 1_000_000, reason: "Price must be an integer from 0 to 1,000,000 cents." },
  ];
  return { status: checks.every((c) => c.pass) ? "READY" : "NEEDS_WORK", checks };
}
