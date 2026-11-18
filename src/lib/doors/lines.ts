/**
 * lines.ts — written copy for "Who's Calling? Doors" (SPEC §6, §12 item 4;
 * Addendum v2 §A1 for the three new callers).
 *
 * Reaction lines: 6 callers × 5 prize tiers, keyed by prize value. The
 * flavour lives here, not in different meme sets — every caller plays the
 * same daily memes; what changes is how they react to what a door held.
 *
 * LANGUAGE: caller lines are ENGLISH in this port. Addendum v3 localizes
 * the UI chrome and the meme captions per language, but the callers'
 * written lines (and their locked Fish voices) get their own
 * per-language copy/voice pass later. API responses therefore return the
 * line key (e.g. "reaction.joe.805") alongside the EN text and a
 * `lineLang: "en"` field, so the UI can localize chrome honestly and swap
 * in translated lines when that pass lands.
 *
 * Banker lines: the Banker is text-only and has two personas — Grandpa
 * (the default Banker) and Joe (the Banker when Grandpa hosts, so the
 * host never negotiates with himself).
 */

import type { DoorsCaller } from "./logic";

export type { DoorsCaller };

/** Stable key for a reaction line, for UI-side localization later. */
export const reactionLineKey = (caller: DoorsCaller, prize: number): string =>
  `reaction.${caller}.${prize}`;

/** Prize value → the host caller's reaction when a door holding it opens. */
export const REACTION_LINES: Record<DoorsCaller, Record<number, string>> = {
  joe: {
    805: "JACKPOT, kid! Eight-oh-five! Somebody get this door a trophy — that's a whole WEEK of content!",
    100: "A hundred! Beautiful door, beautiful prize — and we're just getting started!",
    50: "Fifty credits! Not the jackpot, not peanuts — that's show business, kid!",
    25: "Twenty-five! Hey, credits are credits — I've sold worse doors for less!",
    0: "Tough door, kid. A dud. Tomorrow we sell the door itself.",
  },
  grandma: {
    805: "OH MY. Sit down. Grandma needs to sit down. Eight hundred and five, sweetie!",
    100: "A hundred credits! Well now, isn't that lovely. Grandma's doors provide.",
    50: "Fifty! Enough for something nice. Put it somewhere safe, dear.",
    25: "Twenty-five, sweetie. Small doors still open to good places.",
    0: "Oh, the dud. Never you mind — Grandma still loves you, and there's pie.",
  },
  grandpa: {
    805: "…Huh. Eight-oh-five. Don't tell your grandmother I said this, but — well done.",
    100: "A hundred. Fine door. Don't spend it all on doors.",
    50: "Fifty. In my day that was a month of— well. It's fifty. Take it.",
    25: "Twenty-five. I've walked uphill both ways for less. Which is to say: nothing.",
    0: "The dud. I could've told you. I didn't, but I could've.",
  },
  "young-mom": {
    805: "EIGHT HUNDRED AND FIVE?! Okay. Okay! That's the grocery money, the gas money, the everything money!",
    100: "A hundred! See? Good things happen when you actually open the door. Literally, this time.",
    50: "Fifty credits! That's a win. I'm putting it on the fridge so everyone can admire it.",
    25: "Twenty-five! Small, but it counts. Everything counts. I counted — it counts.",
    0: "A dud. Fine. Fine! The door is closed, the lesson is learned, we're moving on with snacks.",
  },
  "college-kid": {
    805: "BRO. EIGHT. OH. FIVE. That's like — that's a whole semester of not worrying. LET'S GO.",
    100: "A hundred credits?! From a DOOR? Why did nobody tell me doors do this?",
    50: "Fifty! That's textbook money. Well — half a textbook. The used one. Still counts!",
    25: "Twenty-five credits. Ramen upgrade unlocked. We eat like kings tonight.",
    0: "The dud door. Cool cool cool. This is fine. Everything is fine. (It's not fine.)",
  },
  "shop-owner-mike": {
    805: "Eight-oh-five. Huh. Twenty years I've run a shop and a DOOR just had my best day. Take it. Take it now.",
    100: "A hundred credits. Clean, simple, no invoice, no 'the check is in the mail.' Beautiful.",
    50: "Fifty. That covers the delivery that never showed. Business is business — bank it.",
    25: "Twenty-five. Not much, but it didn't ask for a refund or leave a one-star review.",
    0: "A dud. I've stocked shelves with better returns than this door. We go again tomorrow.",
  },
};

export type BankerPersona = "grandpa" | "joe";

/** The Banker's persona: Joe only when Grandpa hosts; Grandpa otherwise. */
export function bankerPersonaFor(host: DoorsCaller): BankerPersona {
  return host === "grandpa" ? "joe" : "grandpa";
}

export interface BankerLineSet {
  /** First offer call (round 1). */
  offer1: string;
  /** Final offer call (round 2). */
  offer2: string;
  /** The remaining doors are worth nothing — the offer is 0. */
  zero: string;
  /** Player took the deal. */
  deal: string;
  /** Player refused. */
  noDeal: string;
}

export const BANKER_LINES: Record<BankerPersona, BankerLineSet> = {
  grandpa: {
    offer1: "Take it. Doors don't love you back.",
    offer2: "Last call. My final number — and I'm being generous, which worries me.",
    zero: "I'll offer you this fine meme and my respect. That's the whole offer.",
    deal: "Smart. Most aren't.",
    noDeal: "Your funeral. Open the next one.",
  },
  joe: {
    offer1: "Kid, take the deal — this number is a gift, and gifts expire!",
    offer2: "Final offer, and it's a beauty! Walk away rich or walk away sorry!",
    zero: "Okay, the cupboard's bare — but what a meme! Take the meme and run!",
    deal: "DEAL! Love it! A winner's handshake!",
    noDeal: "No deal?! Bold! The crowd goes wild!",
  },
};

/** The Banker's line key for an offer, for UI-side localization later. */
export function bankerLineKey(host: DoorsCaller, round: 1 | 2, amount: number): string {
  const persona = bankerPersonaFor(host);
  if (amount <= 0) return `banker.${persona}.zero`;
  return `banker.${persona}.offer${round}`;
}

/** The Banker's spoken line for an offer of `amount` in `round` (EN in v1). */
export function bankerLineFor(host: DoorsCaller, round: 1 | 2, amount: number): string {
  const lines = BANKER_LINES[bankerPersonaFor(host)];
  if (amount <= 0) return lines.zero;
  return round === 1 ? lines.offer1 : lines.offer2;
}
