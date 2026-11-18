/**
 * set.ts — the daily reveal set for "Who's Calling? Doors" (SPEC §8;
 * Addendum v3 §B2: one set per language per day, never per player).
 *
 * The set is identical for every member playing in that language on a
 * game date; only the prize behind each meme shuffles per member
 * (server-side, in game.ts). The meme image therefore never encodes its
 * prize — tier theatre is added by the game layer at reveal time.
 *
 * Resolution order for getDailySet(gameDate, language):
 *  1. The DoorsDailySet row, when one exists for (gameDate, language).
 *  2. Engine path — only when DOORS_ENGINE_SETS === "1": concepts in the
 *     set's language via pr-engine → images → persisted as status "live".
 *     ANY failure falls through to the starter set (the image lane in
 *     pr-engine is a known unwired seam today, so this currently always
 *     falls through — by design, never by exception).
 *  3. Starter bank: a deterministic date-seeded rotation of the 12 bank
 *     memes, persisted as status "starter".
 * Set creation NEVER throws to the player.
 */

import { db } from "@/lib/db";
import { DOOR_VISUALS, seededRand } from "./logic";

export interface DoorsMeme {
  door: number;
  visual: string;
  imageUrl: string;
  alt: string;
  caption: string;
  format: string;
}

interface BankMeme {
  imageUrl: string;
  /** Captions per UI locale — es/ja/ru are working drafts (Addendum v3:
   *  translations are drafts pending native review, same as the UI). */
  captions: Record<string, string>;
  altEn: string;
}

const BANK: BankMeme[] = [
  { imageUrl: "/doors/memes/m01.png", altEn: "Meme captioned 'Morning emergency' — the day's first crisis arriving before the coffee.", captions: { en: "Morning emergency", es: "Emergencia mañanera", ja: "朝の緊急事態", ru: "Утренний переполох" } },
  { imageUrl: "/doors/memes/m02.png", altEn: "Meme captioned 'Wallet upgrade' — money walking out in search of a better wallet.", captions: { en: "Wallet upgrade", es: "Mejora de billetera", ja: "財布のアップグレード", ru: "Апгрейд кошелька" } },
  { imageUrl: "/doors/memes/m03.png", altEn: "Meme captioned 'Keys were never the problem' — the real problem was never the keys.", captions: { en: "Keys were never the problem", es: "Las llaves nunca fueron el problema", ja: "鍵は問題じゃなかった", ru: "Ключи никогда не были проблемой" } },
  { imageUrl: "/doors/memes/m04.png", altEn: "Meme captioned 'Kept on file' — filed away, never forgotten, slightly ominous.", captions: { en: "Kept on file", es: "Guardado en el archivo", ja: "ファイルに保管済み", ru: "Сохранено в досье" } },
  { imageUrl: "/doors/memes/m05.png", altEn: "Meme captioned 'Cat battle, round one' — a cat squaring up for round one.", captions: { en: "Cat battle, round one", es: "Batalla de gatos, ronda uno", ja: "猫バトル、ラウンド1", ru: "Кошачья битва, раунд первый" } },
  { imageUrl: "/doors/memes/m06.png", altEn: "Meme captioned 'Cat battle, round two' — the cat battle escalates to round two.", captions: { en: "Cat battle, round two", es: "Batalla de gatos, ronda dos", ja: "猫バトル、ラウンド2", ru: "Кошачья битва, раунд второй" } },
  { imageUrl: "/doors/memes/m07.png", altEn: "Meme captioned 'Dog battle, round one' — a dog entering the battle, round one.", captions: { en: "Dog battle, round one", es: "Batalla de perros, ronda uno", ja: "犬バトル、ラウンド1", ru: "Собачья битва, раунд первый" } },
  { imageUrl: "/doors/memes/m08.png", altEn: "Meme captioned 'Dog battle, round two' — the dog battle reaches round two.", captions: { en: "Dog battle, round two", es: "Batalla de perros, ronda dos", ja: "犬バトル、ラウンド2", ru: "Собачья битва, раунд второй" } },
  { imageUrl: "/doors/memes/m09.png", altEn: "Meme captioned 'Tokyo edition' — the Tokyo edition of the joke.", captions: { en: "Tokyo edition", es: "Edición Tokio", ja: "東京エディション", ru: "Токийское издание" } },
  { imageUrl: "/doors/memes/m10.png", altEn: "Meme captioned 'From the pack' — one straight from the pack.", captions: { en: "From the pack", es: "Del paquete", ja: "パックからの一枚", ru: "Из пачки" } },
  { imageUrl: "/doors/memes/m11.png", altEn: "Meme captioned 'From the pack, again' — another one from the pack.", captions: { en: "From the pack, again", es: "Del paquete, otra vez", ja: "パックから、もう一枚", ru: "Из пачки, снова" } },
  { imageUrl: "/doors/memes/m12.png", altEn: "Meme captioned 'The invite' — the invite everyone was waiting for.", captions: { en: "The invite", es: "La invitación", ja: "招待状", ru: "Приглашение" } },
];

/** The deterministic starter set for a (gameDate, language): hash the
 *  date, shuffle the bank with that seed, take 5, deal to doors 0..4. */
export function rotateSetForDate(gameDate: string, language: string): DoorsMeme[] {
  const rand = seededRand(`doors-set:${gameDate}`);
  const order = BANK.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.slice(0, 5).map((bankIdx, door) => {
    const m = BANK[bankIdx]!;
    const caption = m.captions[language] ?? m.captions.en!;
    return {
      door,
      visual: DOOR_VISUALS[door]!.visual,
      imageUrl: m.imageUrl,
      alt: language === "en" ? m.altEn : `Meme captioned '${caption}'`,
      caption,
      format: "meme",
    };
  });
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  ja: "Japanese",
  ru: "Russian",
};

/**
 * Engine generation path (DOORS_ENGINE_SETS=1 only): meme concepts in the
 * set's language through the P&R engine, then images. Returns null on ANY
 * failure so the caller falls back to the starter bank.
 */
async function tryEngineSet(gameDate: string, language: string): Promise<DoorsMeme[] | null> {
  try {
    const { generateMemeConcepts, generateMemeImage } = await import("@/lib/pr-engine");
    const concepts = await generateMemeConcepts({
      profile: {
        name: "Plunder & Riffle",
        description: "A meme marketing engine for small businesses. The Doors game gives away free content generations as prizes.",
        products: ["AI meme content packs"],
        sellingPoints: ["Daily memes in your language"],
        differentiators: ["Made by AI agents, approved by the owner"],
        primaryLanguage: language,
        suggestedLanguages: [language],
        suggestedTones: ["playful"],
      },
      objectiveLabel: "Entertain game players and tease the content engine",
      toneLabel: "Playful, festival game-show energy",
      formatInstruction: "Single-panel reaction memes for a daily doors game reveal",
      languageName: LANGUAGE_NAMES[language] ?? "English",
      count: 5,
    });
    if (concepts.length < 5) return null;
    const memes: DoorsMeme[] = [];
    for (let door = 0; door < 5; door++) {
      const c = concepts[door]!;
      const imageUrl = await generateMemeImage(`doors-${gameDate}-${language}-${door}`, c.imagePrompt);
      memes.push({
        door,
        visual: DOOR_VISUALS[door]!.visual,
        imageUrl,
        alt: c.title,
        caption: [c.topText, c.bottomText].filter(Boolean).join(" — "),
        format: "meme",
      });
    }
    return memes;
  } catch {
    return null;
  }
}

/**
 * The daily set for (gameDate, language): DB row → engine (opt-in) →
 * starter rotation. Persisted on first build so every member in that
 * language sees the same set all day. Never throws.
 */
export async function getDailySet(gameDate: string, language: string): Promise<DoorsMeme[]> {
  try {
    const row = await db.doorsDailySet.findUnique({
      where: { gameDate_language: { gameDate, language } },
    });
    if (row && Array.isArray(row.memes) && (row.memes as unknown[]).length === 5) {
      return row.memes as unknown as DoorsMeme[];
    }
  } catch {
    // DB hiccup: fall through to the in-memory starter set below.
  }

  let memes: DoorsMeme[] | null = null;
  let status = "starter";
  if (process.env.DOORS_ENGINE_SETS === "1") {
    memes = await tryEngineSet(gameDate, language);
    if (memes) status = "live";
  }
  if (!memes) memes = rotateSetForDate(gameDate, language);

  try {
    await db.doorsDailySet.upsert({
      where: { gameDate_language: { gameDate, language } },
      create: { gameDate, language, memes: memes as unknown as object, status },
      update: {},
    });
  } catch {
    // Another request materialized it first, or the DB is down — the
    // in-memory set above is still correct for this response.
  }
  return memes;
}
