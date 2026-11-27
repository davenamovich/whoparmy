/**
 * Gift-lane invites (Dave, 2026-11-27) — pure validation + serialization
 * for the admin-only Starimg token gift invites (1M / 10M tiers).
 *
 * KEY STORAGE DECISION (the question Dave flagged): an invite records
 * WHICH Starimg key serves it by REFERENCE ONLY — the cabinet sub-key
 * NAME + the account label + the cap. There is deliberately NO field
 * anywhere in this system for a raw key value: the value lives in the
 * Starimg cabinet / secure storage, and at handover it goes straight
 * into the recipient's own bridge save_my_key via secure entry. Any
 * create payload that tries to smuggle a raw key field in is rejected.
 *
 * NOT LAUNCHED: invites are operator-created records/drafts only.
 * Nothing here sends, emails, or grants anything.
 */

export const GIFT_TIERS = {
  "1m": 1_000_000,
  "10m": 10_000_000,
} as const;
export type GiftTier = keyof typeof GIFT_TIERS;

export const GIFT_INVITE_STATUSES = ["draft", "ready", "handed_over", "exhausted", "revoked"] as const;
export type GiftInviteStatus = (typeof GIFT_INVITE_STATUSES)[number];

/** Fields that must never appear in a create/update payload — raw secrets
 *  are never stored on an invite record, by design. */
const FORBIDDEN_KEY_FIELDS = ["apiKey", "api_key", "keyValue", "key_value", "secret", "rawKey", "token_value"];

export interface GiftInviteInput {
  recipientName: string;
  recipientEmail: string | null;
  tier: GiftTier;
  tokenCap: number;
  keyName: string;
  accountLabel: string;
  notes: string | null;
}

export type ValidationResult = { ok: true; value: GiftInviteInput } | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function validateGiftInviteInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object." };
  const b = body as Record<string, unknown>;

  for (const f of FORBIDDEN_KEY_FIELDS) {
    if (f in b) {
      return {
        ok: false,
        error: `Field "${f}" is not accepted — invites store the Starimg sub-key NAME and account label only, never a raw key value.`,
      };
    }
  }

  const recipientName = str(b.recipientName);
  if (!recipientName) return { ok: false, error: "Recipient name is required." };
  if (recipientName.length > 80) return { ok: false, error: "Recipient name is too long (max 80)." };

  let recipientEmail: string | null = null;
  const emailRaw = str(b.recipientEmail);
  if (emailRaw) {
    if (emailRaw.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return { ok: false, error: "Recipient email looks invalid." };
    }
    recipientEmail = emailRaw.toLowerCase();
  }

  const tier = str(b.tier) as GiftTier;
  if (!(tier in GIFT_TIERS)) return { ok: false, error: 'Tier must be "1m" or "10m".' };

  const keyName = str(b.keyName);
  if (!keyName) return { ok: false, error: "Starimg sub-key name is required (the cabinet key's name — reference only, never its value)." };
  if (keyName.length > 60) return { ok: false, error: "Sub-key name is too long (max 60)." };

  const accountLabel = str(b.accountLabel);
  if (!accountLabel) return { ok: false, error: "Account label is required (which Starimg account the sub-key lives on)." };
  if (accountLabel.length > 80) return { ok: false, error: "Account label is too long (max 80)." };

  const notes = str(b.notes);
  if (notes.length > 500) return { ok: false, error: "Notes are too long (max 500)." };

  return {
    ok: true,
    value: {
      recipientName,
      recipientEmail,
      tier,
      tokenCap: GIFT_TIERS[tier],
      keyName,
      accountLabel,
      notes: notes || null,
    },
  };
}

export function validateGiftInviteStatus(body: unknown): { ok: true; status: GiftInviteStatus } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object." };
  const status = str((body as Record<string, unknown>).status) as GiftInviteStatus;
  if (!GIFT_INVITE_STATUSES.includes(status)) {
    return { ok: false, error: `Status must be one of: ${GIFT_INVITE_STATUSES.join(", ")}.` };
  }
  return { ok: true, status };
}

export interface GiftInviteRow {
  id: string;
  code: string;
  recipientName: string;
  recipientEmail: string | null;
  tier: string;
  tokenCap: number;
  keyName: string;
  accountLabel: string;
  status: string;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The ONLY shape an invite ever leaves the server in. It is built field
 * by field (never a spread of the DB row) so a future column can never
 * leak by accident — and by design there is no key-value column to leak.
 */
export function serializeGiftInvite(row: GiftInviteRow) {
  return {
    id: row.id,
    code: row.code,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    tier: row.tier,
    tokenCap: row.tokenCap,
    keyName: row.keyName,
    accountLabel: row.accountLabel,
    status: row.status,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The copyable invite note an operator hands to a recipient manually.
 *  Carries the invite code + tier only — no key material, ever. */
export function giftInviteNote(invite: { code: string; tier: string; tokenCap: number }): string {
  return `Plunder & Riffle gift invite ${invite.code} — ${invite.tokenCap.toLocaleString("en-US")} Starimg tokens for builds in your Muse. Your Muse will set it up with you during onboarding; your key is saved securely at handover, never shared in chat.`;
}
