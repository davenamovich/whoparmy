// Content format catalog — mirrors the capabilities exposed by the
// P&R generation engine. A format must map to a real generation prompt
// spec below; the UI never advertises a format that has no spec.

export type ContentCategory = "MEMES" | "SOCIAL" | "VIDEO" | "AUDIO" | "MARKETING";

export interface FormatSpec {
  key: string;
  label: string;
  category: ContentCategory;
  instruction: string; // generation guidance for the engine
}

export const FORMAT_CATALOG: FormatSpec[] = [
  // MEMES
  { key: "funny_meme", label: "Funny Meme", category: "MEMES", instruction: "A universally funny internet meme about the business/offer. Relatable humor, punchy top and bottom text." },
  { key: "relatable_meme", label: "Relatable Meme", category: "MEMES", instruction: "A 'that's so me' style meme about the customer's daily pain points that the business solves." },
  { key: "promotional_meme", label: "Promotional Meme", category: "MEMES", instruction: "A meme that promotes the offer while still being genuinely funny — the pitch lands in the punchline." },
  { key: "educational_meme", label: "Educational Meme", category: "MEMES", instruction: "A meme that teaches a quick truth or tip related to the business niche." },
  { key: "viral_meme", label: "Viral-Style Meme", category: "MEMES", instruction: "A meme engineered for shareability: trending format energy, bold claim, high reply-bait." },
  // SOCIAL
  { key: "facebook_post", label: "Facebook Post", category: "SOCIAL", instruction: "A Facebook post: strong hook first line, short scannable paragraphs, one CTA, 2-4 relevant hashtags at the end. 60-140 words." },
  { key: "x_post", label: "X Post", category: "SOCIAL", instruction: "A single X (Twitter) post. Max 270 characters. Punchy, no hashtags unless essential, one clear idea." },
  { key: "instagram_caption", label: "Instagram Caption", category: "SOCIAL", instruction: "An Instagram caption: scroll-stopping first line, line breaks for rhythm, value or story, CTA, 5-8 niche hashtags." },
  { key: "linkedin_post", label: "LinkedIn Post", category: "SOCIAL", instruction: "A LinkedIn post: professional but human, hook line, insight or mini-story, takeaway, soft CTA. 80-160 words, no hashtag spam (max 3)." },
  { key: "tiktok_description", label: "TikTok Description", category: "SOCIAL", instruction: "A TikTok description + on-screen text idea. Short, trend-aware, curiosity gap, 3-5 hashtags. Format: 'Description: ...' then 'On-screen text: ...'" },
  // VIDEO
  { key: "shortform_script", label: "Short-Form Video Script", category: "VIDEO", instruction: "A 30-second short-form video script (TikTok/Reels/Shorts). Structure: HOOK (0-3s), BEATS (each with what's on screen), CTA. Labeled lines." },
  { key: "explainer_script", label: "Explainer Script", category: "VIDEO", instruction: "A 60-90 second explainer script: problem, solution, how it works, proof, CTA. Written for voiceover with scene notes." },
  { key: "promo_video_script", label: "Promo Video Script", category: "VIDEO", instruction: "A high-energy promotional video script (30-60s) with visual directions per beat and a closing CTA card." },
  { key: "talkinghead_script", label: "Talking-Head Script", category: "VIDEO", instruction: "A natural talking-head script: conversational sentences, pattern interrupts every few lines, ends with CTA. Feels spoken, not written." },
  { key: "video_captions", label: "Video Captions", category: "VIDEO", instruction: "Caption set for a promo video: 8-12 short caption lines in order, each max 42 characters, timed beats separated by blank lines." },
  // AUDIO
  { key: "voiceover_script", label: "Voiceover Script", category: "AUDIO", instruction: "A voiceover script (45-60s read). Clean sentences, rhythm for speech, emphasis marked in [brackets], ends with CTA." },
  { key: "promo_audio", label: "Promotional Audio", category: "AUDIO", instruction: "A 15-30 second radio/ad-read style promo script with a cold open, offer, urgency and CTA." },
  { key: "conversational_script", label: "Conversational Script", category: "AUDIO", instruction: "A natural two-voice conversation script (Host + Guest) that surfaces the offer without sounding like an ad." },
  { key: "podcast_content", label: "Podcast-Style Content", category: "AUDIO", instruction: "A podcast segment script: intro, 3 talking points with examples, listener CTA. 150-250 words." },
  // MARKETING
  { key: "email_campaign", label: "Email Campaign", category: "MARKETING", instruction: "A marketing email: subject line (3 options), preview text, body with one idea, one CTA button text. 120-200 words." },
  { key: "headlines", label: "Headlines", category: "MARKETING", instruction: "8 high-converting headlines, numbered list, each max 70 characters, mixing curiosity / benefit / proof angles." },
  { key: "cta_pack", label: "Calls to Action", category: "MARKETING", instruction: "8 CTA lines (2-6 words each) numbered, escalating from soft to aggressive." },
  { key: "product_description", label: "Product Description", category: "MARKETING", instruction: "A product description: benefit-led opening, 3-5 bullet features translated into benefits, closing CTA. 80-140 words." },
  { key: "landing_copy", label: "Landing Page Copy", category: "MARKETING", instruction: "Landing page copy: Hero headline, subheadline, 3 benefit blocks (title + 2 lines each), social-proof line, CTA text." },
];

export const FORMAT_MAP: Record<string, FormatSpec> = Object.fromEntries(
  FORMAT_CATALOG.map((f) => [f.key, f]),
);

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  MEMES: "Memes",
  SOCIAL: "Social Posts",
  VIDEO: "Video",
  AUDIO: "Audio Scripts",
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
