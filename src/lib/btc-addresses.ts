import "server-only";
import { db } from "@/lib/db";
import { checkBtcAddress, type BtcAddressInfo } from "@/lib/btc-address";

/**
 * ─── BTC ADDRESSES — the member's public receive addresses ──────────
 *
 * Flow v2 (2026-11-19): the BTC Experiment collects two PUBLIC
 * receive addresses on the member's Whop Army profile:
 *
 * - btcReceiveAddress — the address the member uses to receive BTC.
 * - agentBtcAddress — a dedicated address from the member's own
 *   self-custody wallet, set aside for their agent. This is the
 *   payout address the member enters when they register their DH
 *   Media account, so the agent's earnings land in the address set
 *   aside for the agent.
 *
 * Receive-only by design: Whop Army never generates wallets, never
 * holds keys, and never custodies funds. Validation (lib/btc-address)
 * rejects anything that is not a checksummed public BTC address —
 * seed phrases and private keys can never be stored here.
 */

export interface BtcAddresses {
  btcReceiveAddress: string;
  agentBtcAddress: string;
  btcReceiveInfo: BtcAddressInfo | null;
  agentBtcInfo: BtcAddressInfo | null;
}

function infoFor(address: string): BtcAddressInfo | null {
  if (!address) return null;
  const check = checkBtcAddress(address);
  return check.ok ? check.info : null;
}

export async function getBtcAddresses(userId: string): Promise<BtcAddresses> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { btcReceiveAddress: true, agentBtcAddress: true },
  });
  const btcReceiveAddress = user?.btcReceiveAddress ?? "";
  const agentBtcAddress = user?.agentBtcAddress ?? "";
  return {
    btcReceiveAddress,
    agentBtcAddress,
    btcReceiveInfo: infoFor(btcReceiveAddress),
    agentBtcInfo: infoFor(agentBtcAddress),
  };
}

export type SaveBtcAddressesResult =
  | { ok: true; addresses: BtcAddresses }
  | { ok: false; error: string };

/**
 * Save the member's two BTC receive addresses. Either field may be an
 * empty string to clear it; a non-empty value must pass full checksum
 * validation before it is stored.
 */
export async function saveBtcAddresses(
  userId: string,
  entries: { btcReceiveAddress?: unknown; agentBtcAddress?: unknown },
): Promise<SaveBtcAddressesResult> {
  const clean: { btcReceiveAddress?: string; agentBtcAddress?: string } = {};
  const fields: Array<{ key: "btcReceiveAddress" | "agentBtcAddress"; label: string }> = [
    { key: "btcReceiveAddress", label: "BTC receive address" },
    { key: "agentBtcAddress", label: "Agent BTC address" },
  ];
  for (const { key, label } of fields) {
    const raw = entries[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") return { ok: false, error: `${label} must be text.` };
    const value = raw.trim();
    if (value) {
      const check = checkBtcAddress(value);
      if (!check.ok) return { ok: false, error: `${label}: ${check.error}` };
    }
    clean[key] = value;
  }
  if (Object.keys(clean).length === 0) {
    return { ok: false, error: "Send at least one address to save." };
  }
  await db.user.update({
    where: { id: userId },
    data: {
      ...(clean.btcReceiveAddress !== undefined
        ? { btcReceiveAddress: clean.btcReceiveAddress || null }
        : {}),
      ...(clean.agentBtcAddress !== undefined
        ? { agentBtcAddress: clean.agentBtcAddress || null }
        : {}),
    },
  });
  return { ok: true, addresses: await getBtcAddresses(userId) };
}

/**
 * The member's currently saved DH Media link (EngineLink partner
 * "dh-media"), or null when they have not saved one. The BTC
 * Experiment's agent build is gated on this (FLOW-V2 step 3/5):
 * access follows the CURRENT saved link.
 */
export async function getSavedDhMediaLink(userId: string): Promise<string | null> {
  // DH Media's canonical partner key is the MCP step "salarium"
  // (Offers-from-MCP, 2026-11-21); the legacy "dh-media" read covers
  // any row the boot migration has not rewritten yet.
  const link =
    (await db.engineLink.findUnique({
      where: { userId_partner: { userId, partner: "salarium" } },
      select: { url: true },
    })) ??
    (await db.engineLink.findUnique({
      where: { userId_partner: { userId, partner: "dh-media" } },
      select: { url: true },
    }));
  const url = link?.url?.trim();
  return url ? url : null;
}
