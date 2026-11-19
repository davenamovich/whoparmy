/**
 * Bridge-secret redaction (pure — unit-tested).
 *
 * A member can paste their one-time bridge code or their live bridge
 * token into Ralph chat ("Talk to my Muse" mints the code in-chat).
 * Chat history is later fed back into model context, so a raw code or
 * token sitting in a stored message would be re-exposed to the model
 * (and to any log of that context) on every later turn. Redact before
 * history enters a prompt: codes and tokens are single-purpose
 * secrets; nothing downstream needs their literal value.
 *
 * Two shapes are masked:
 * - bridge tokens: the `prb_` prefix + 64 hex chars;
 * - bridge codes: four groups of four uppercase hex chars, but ONLY
 *   in a connect context (near the word "connect" or inside a
 *   /connect/<code> link) — the bare pattern alone would also match
 *   innocent hex strings, so context is required.
 */

const TOKEN_RE = /prb_[0-9a-f]{64}/gi;
const CONNECT_URL_RE = /(\/connect\/)[0-9A-F]{4}(?:-[0-9A-F]{4}){3}/g;
const CODE_RE = /\b[0-9A-F]{4}(?:-[0-9A-F]{4}){3}\b/g;
const CONNECT_NEAR_RE = /connect/i;

export function redactBridgeSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(TOKEN_RE, "prb_[redacted]");
  out = out.replace(CONNECT_URL_RE, "$1[redacted-code]");
  if (CONNECT_NEAR_RE.test(out)) {
    out = out.replace(CODE_RE, "[redacted-code]");
  }
  return out;
}
