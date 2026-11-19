import { createHash } from "node:crypto";

/**
 * ─── BTC address format validation (pure, no I/O) ───────────────────
 *
 * Flow v2 (2026-11-19): Whop Army stores two PUBLIC receive addresses
 * per member for the BTC Experiment — the member's own receive
 * address and a dedicated agent address. Receive-only: nothing here
 * ever touches a seed phrase or a private key, and anything that
 * looks like one (words, spaces, hex keys) fails validation.
 *
 * Validation is real, not just shape-matching: Base58Check addresses
 * must carry a valid double-SHA256 checksum and a known version byte;
 * SegWit addresses must pass the BIP-173 bech32 / BIP-350 bech32m
 * checksum with a known witness version and program length. Mainnet
 * and testnet formats are both accepted; the result carries the
 * network + kind label the /bridge UI shows back to the member.
 */

export interface BtcAddressInfo {
  network: "mainnet" | "testnet";
  kind: "legacy" | "script" | "segwit" | "taproot";
  /** Human label, e.g. "mainnet · SegWit (bech32)". */
  label: string;
}

export type BtcAddressCheck =
  | { ok: true; info: BtcAddressInfo }
  | { ok: false; error: string };

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(buf: Buffer): Buffer {
  return createHash("sha256").update(buf).digest();
}

function decodeBase58(input: string): Buffer | null {
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (const ch of input) {
    const value = BASE58_ALPHABET.indexOf(ch);
    if (value === -1) return null;
    let carry = value;
    for (let i = bytes.length - 1; i >= 0; i--) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.unshift(carry & 0xff);
      carry >>= 8;
    }
  }
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(bytes)]);
}

function checkBase58Check(input: string): BtcAddressInfo | null {
  if (input.length < 26 || input.length > 35) return null;
  const raw = decodeBase58(input);
  if (!raw || raw.length !== 25) return null;
  const payload = raw.subarray(0, 21);
  const checksum = raw.subarray(21);
  const expected = sha256(sha256(payload)).subarray(0, 4);
  if (!checksum.equals(expected)) return null;
  const version = payload[0];
  switch (version) {
    case 0x00:
      return { network: "mainnet", kind: "legacy", label: "mainnet · legacy (P2PKH)" };
    case 0x05:
      return { network: "mainnet", kind: "script", label: "mainnet · script (P2SH)" };
    case 0x6f:
      return { network: "testnet", kind: "legacy", label: "testnet · legacy (P2PKH)" };
    case 0xc4:
      return { network: "testnet", kind: "script", label: "testnet · script (P2SH)" };
    default:
      return null;
  }
}

// ─── bech32 / bech32m (BIP-173 / BIP-350) ────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= generators[i];
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}

function convertBits(data: Buffer, from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}

function checkBech32(input: string): BtcAddressInfo | null {
  const lower = input.toLowerCase();
  if (input !== lower && input !== input.toUpperCase()) return null; // mixed case is invalid
  const hrp = lower.startsWith("bc1") ? "bc" : lower.startsWith("tb1") ? "tb" : null;
  if (!hrp) return null;
  const dataPart = lower.slice(hrp.length + 1);
  if (dataPart.length < 6) return null;
  const values: number[] = [];
  for (const ch of dataPart) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v === -1) return null;
    values.push(v);
  }
  const polymod = bech32Polymod([...hrpExpand(hrp), ...values]);
  const version = values[0];
  const programValues = values.slice(1, values.length - 6);
  const program = convertBits(Buffer.from(programValues), 5, 8, false);
  if (!program) return null;
  const programLength = program.length;
  let kind: BtcAddressInfo["kind"] | null = null;
  if (version === 0 && polymod === BECH32_CONST) {
    if (programLength === 20) kind = "segwit";
    else if (programLength === 32) kind = "segwit";
  } else if (version === 1 && polymod === BECH32M_CONST) {
    if (programLength === 32) kind = "taproot";
  }
  if (!kind) return null;
  const network = hrp === "bc" ? "mainnet" : "testnet";
  const kindLabel =
    kind === "taproot" ? "Taproot (bech32m)" : version === 0 && programLength === 32 ? "SegWit v0 (bech32)" : "SegWit (bech32)";
  return { network, kind, label: `${network} · ${kindLabel}` };
}

/**
 * Validate a BTC receive address. Accepts mainnet + testnet:
 * legacy (1… / m… / n…), script (3… / 2…), bech32 (bc1… / tb1…) and
 * taproot (bc1p… / tb1p…). Anything else — including seed-phrase-like
 * text, private keys, or another chain's address — is rejected.
 */
export function checkBtcAddress(raw: string): BtcAddressCheck {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return { ok: false, error: "Enter a BTC address." };
  if (/\s/.test(input)) {
    return {
      ok: false,
      error: "That contains spaces — a receive address never does. Never enter a seed phrase or private key here.",
    };
  }
  if (input.length > 90) return { ok: false, error: "That is too long to be a BTC address." };
  const info = checkBase58Check(input) ?? checkBech32(input);
  if (!info) {
    return {
      ok: false,
      error: "That doesn't look like a valid BTC address — check it in your wallet and paste the public receive address.",
    };
  }
  return { ok: true, info };
}

export function isValidBtcAddress(raw: string): boolean {
  return checkBtcAddress(raw).ok;
}
