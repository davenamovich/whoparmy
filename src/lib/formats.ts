// Content format catalog — mirrors the capabilities exposed by the
// P&R generation engine. A format must map to a real generation prompt
// spec below; the UI never advertises a format that has no spec.
//
// Consolidated (Dave, 2026-11-17): simpler generations only — memes,
// social posts, marketing copy. The VIDEO and AUDIO script formats
// were removed from selection (no audio promotion; the app generates
// memes and copy, not scripts for media it doesn't produce), and the
// five meme flavors folded into three jobs: entertain, identify,
// sell. Existing assets keep their stored format keys; they just
// can't be picked for new generations.

export type ContentCategory = "MEMES" | "SOCIAL" | "MARKETING";

export interface FormatSpec {
  key: string;
  label: string;
  category: ContentCategory;
  instruction: string; // generation guidance for the engine
}

export const FORMAT_CATALOG: FormatSpec[] = [
  // MEMES — three jobs: entertain, identify, sell.
  { key: "funny_meme", label: "Funny Meme", category: "MEMES", instruction: "A universally funny internet meme about the business/offer. Relatable humor, punchy top and bottom text, engineered for shareability — bold claim, high reply-bait." },
  { key: "relatable_meme", label: "Relatable Meme", category: "MEMES", instruction: "A 'that's so me' style meme about the customer's daily pain points that the business solves; where it fits, teach one quick truth or tip from the niche." },
  { key: "promotional_meme", label: "Promotional Meme", category: "MEMES", instruction: "A meme that promotes the offer while still being genuinely funny — the pitch lands in the punchline." },
  // SOCIAL
  { key: "facebook_post", label: "Facebook Post", category: "SOCIAL", instruction: "A Facebook post: strong hook first line, short scannable paragraphs, one CTA, 2-4 relevant hashtags at the end. 60-140 words." },
  { key: "instagram_caption", label: "Instagram Caption", category: "SOCIAL", instruction: "An Instagram caption: scroll-stopping first line, line breaks for rhythm, value or story, CTA, 5-8 niche hashtags." },
  { key: "x_post", label: "X Post", category: "SOCIAL", instruction: "A single X (Twitter) post. Max 270 characters. Punchy, no hashtags unless essential, one clear idea." },
  // MARKETING
  { key: "email_campaign", label: "Email Campaign", category: "MARKETING", instruction: "A marketing email: subject line (3 options), preview text, body with one idea, one CTA button text. 120-200 words." },
  { key: "headlines", label: "Headlines", category: "MARKETING", instruction: "8 high-converting headlines, numbered list, each max 70 characters, mixing curiosity / benefit / proof angles." },
  { key: "product_description", label: "Product Description", category: "MARKETING", instruction: "A product description: benefit-led opening, 3-5 bullet features translated into benefits, closing CTA. 80-140 words." },
];

export const FORMAT_MAP: Record<string, FormatSpec> = Object.fromEntries(
  FORMAT_CATALOG.map((f) => [f.key, f]),
);

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  MEMES: "Memes",
  SOCIAL: "Social Posts",
  MARKETING: "Marketing Copy",
};

const CATEGORY_KEYS = new Set(Object.keys(CATEGORY_LABELS));

export function isContentCategory(v: string): v is ContentCategory {
  return CATEGORY_KEYS.has(v);
}

// ─── Campaign objectives ────────────────────────────────────────────
export interface ObjectiveDef {
  key: string;
  label: string;
  blurb: string;
}

export const OBJECTIVES: ObjectiveDef[] = [
  { key: "customers", label: "Get More Customers", blurb: "Direct-response content that sells" },
  { key: "affiliate", label: "Promote an Affiliate Offer", blurb: "Commission-ready promo content" },
  { key: "social_growth", label: "Grow Social Media", blurb: "Followers, engagement, shareability" },
  { key: "launch", label: "Launch a Product", blurb: "Launch-day hype and momentum" },
  { key: "awareness", label: "Build Brand Awareness", blurb: "Make the brand impossible to ignore" },
  { key: "leads", label: "Generate Leads", blurb: "Capture interest, build the list" },
  { key: "traffic", label: "Drive Website Traffic", blurb: "Clicks, visits, destination content" },
  { key: "entertainment", label: "Create Entertainment / Viral Memes", blurb: "Pure shareable fun" },
];

export const OBJECTIVE_MAP: Record<string, ObjectiveDef> = Object.fromEntries(
  OBJECTIVES.map((o) => [o.key, o]),
);

// ─── Tones ──────────────────────────────────────────────────────────
export const TONES: { key: string; label: string; hint: string }[] = [
  { key: "funny", label: "Funny", hint: "Humor first, always lands a joke" },
  { key: "sarcastic", label: "Sarcastic", hint: "Dry, sharp, a little savage" },
  { key: "professional", label: "Professional", hint: "Clean, credible, corporate-safe" },
  { key: "educational", label: "Educational", hint: "Teaches while it sells" },
  { key: "controversial", label: "Controversial", hint: "Takes a stance, invites debate" },
  { key: "inspirational", label: "Inspirational", hint: "Uplifting, aspirational energy" },
  { key: "casual", label: "Casual", hint: "Like texting a smart friend" },
  { key: "bold", label: "Bold", hint: "Loud, confident, unapologetic" },
  { key: "storytelling", label: "Storytelling", hint: "Narratives that pull people in" },
  { key: "sales", label: "Sales-Focused", hint: "Direct response, CTA-driven" },
];

export const TONE_MAP: Record<string, string> = Object.fromEntries(TONES.map((t) => [t.key, t.label]));
