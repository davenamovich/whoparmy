import "server-only";
import { getBtcAddresses, type BtcAddresses } from "@/lib/btc-addresses";
import { btcTxDeltaForAddress, satsToBtc, type EsploraTx } from "@/lib/btc-activity-core";

/**
 * ─── BTC WALLET ACTIVITY — public on-chain reads ─────────────────────
 *
 * Dave (2026-11-19): the member dashboard shows the BTC activity from
 * the member's wallet. The app holds ONLY the member's two public
 * receive addresses (lib/btc-addresses.ts — receive-only, no keys,
 * no custody), so activity is read from the public chain via
 * mempool.space's keyless API: balance + the latest transactions per
 * address. Mainnet only — a testnet address reports itself as such
 * instead of pretending to have mainnet activity. Any fetch failure
 * surfaces as `available: false`; numbers are never invented.
 */

const MEMPOOL = "https://mempool.space/api";
const FETCH_TIMEOUT_MS = 6_000;
const RECENT_PER_ADDRESS = 10;

export interface BtcTxView {
  txid: string;
  address: string;
  role: "receive" | "agent";
  deltaSats: number;
  deltaBtc: string;
  confirmed: boolean;
  at: string | null; // ISO time when confirmed
}

export interface BtcAddressActivity {
  address: string;
  role: "receive" | "agent";
  label: string | null;
  available: boolean;
  note: string | null; // why activity is unavailable, when it is
  balanceSats: number | null;
  balanceBtc: string | null;
  txCount: number | null;
}

export interface BtcActivity {
  addresses: BtcAddressActivity[];
  recent: BtcTxView[];
}

interface AddressStats {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number; tx_count?: number };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function activityFor(
  address: string,
  role: "receive" | "agent",
  label: string | null,
  network: string | null,
): Promise<{ view: BtcAddressActivity; txs: BtcTxView[] }> {
  const base: BtcAddressActivity = {
    address,
    role,
    label,
    available: false,
    note: null,
    balanceSats: null,
    balanceBtc: null,
    txCount: null,
  };
  if (!address) return { view: { ...base, note: "No address saved yet." }, txs: [] };
  if (network !== "mainnet") {
    return { view: { ...base, note: "Testnet address — activity lookup covers mainnet only." }, txs: [] };
  }
  const [stats, txsRaw] = await Promise.all([
    fetchJson<AddressStats>(`${MEMPOOL}/address/${address}`),
    fetchJson<EsploraTx[]>(`${MEMPOOL}/address/${address}/txs`),
  ]);
  if (!stats?.chain_stats) {
    return { view: { ...base, note: "On-chain lookup unavailable right now." }, txs: [] };
  }
  const funded = stats.chain_stats.funded_txo_sum ?? 0;
  const spent = stats.chain_stats.spent_txo_sum ?? 0;
  const balanceSats = funded - spent;
  const txs: BtcTxView[] = (txsRaw ?? []).slice(0, RECENT_PER_ADDRESS).map((tx) => {
    const deltaSats = btcTxDeltaForAddress(tx, address);
    return {
      txid: tx.txid,
      address,
      role,
      deltaSats,
      deltaBtc: satsToBtc(deltaSats),
      confirmed: Boolean(tx.status?.confirmed),
      at: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
    };
  });
  return {
    view: {
      ...base,
      available: true,
      balanceSats,
      balanceBtc: satsToBtc(balanceSats),
      txCount: stats.chain_stats.tx_count ?? txs.length,
    },
    txs,
  };
}

export async function getBtcActivity(userId: string): Promise<{ saved: BtcAddresses; activity: BtcActivity }> {
  const saved = await getBtcAddresses(userId);
  const [receive, agent] = await Promise.all([
    activityFor(saved.btcReceiveAddress, "receive", saved.btcReceiveInfo?.label ?? null, saved.btcReceiveInfo?.network ?? null),
    activityFor(saved.agentBtcAddress, "agent", saved.agentBtcInfo?.label ?? null, saved.agentBtcInfo?.network ?? null),
  ]);
  const recent = [...receive.txs, ...agent.txs]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 10);
  return { saved, activity: { addresses: [receive.view, agent.view], recent } };
}
