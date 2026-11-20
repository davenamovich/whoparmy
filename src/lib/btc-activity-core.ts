/**
 * ─── BTC ACTIVITY — pure core ────────────────────────────────────────
 *
 * The value a single on-chain transaction moved FOR one address, in
 * satoshis: outputs paying the address minus inputs spending from it
 * (mempool.space / esplora tx shape). Pure so it is unit-testable;
 * the fetching lives in lib/btc-activity.ts.
 */

export interface EsploraTx {
  txid: string;
  status?: { confirmed?: boolean; block_time?: number };
  vin?: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
}

export function btcTxDeltaForAddress(tx: EsploraTx, address: string): number {
  let delta = 0;
  for (const o of tx.vout ?? []) {
    if (o.scriptpubkey_address === address && typeof o.value === "number") delta += o.value;
  }
  for (const i of tx.vin ?? []) {
    if (i.prevout?.scriptpubkey_address === address && typeof i.prevout.value === "number") {
      delta -= i.prevout.value;
    }
  }
  return delta;
}

/** Satoshis → a BTC string with up to 8 decimals, trailing zeros trimmed. */
export function satsToBtc(sats: number): string {
  const sign = sats < 0 ? "-" : "";
  const abs = Math.abs(sats);
  const whole = Math.floor(abs / 100_000_000);
  const frac = String(abs % 100_000_000).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}
