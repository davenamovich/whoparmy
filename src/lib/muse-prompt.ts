/**
 * The one prompt.
 *
 * This string is the product: it is what the front page hands a visitor and
 * what the closed door hands them while the gate is up. It lives in one place
 * so the panel on the landing page and the panel on /gate can never drift —
 * two copies of a prompt is two prompts, and the weaker one wins wherever it
 * is read.
 *
 * Rules it carries, which must survive any edit: ask instead of guessing,
 * nine questions at most, no invented numbers or testimonials, and nothing
 * published without the user's approval. Blanks in angle brackets are for the
 * visitor to fill.
 */
export const PROMPT_TEXT = `You're my Muse. Build me the stack I can run tomorrow morning, not a plan.

ABOUT ME
Business: <one sentence. what you sell, to whom>
Customers: <who they are, and where they already find you>
Offer: <what you sell and the price>
Already have: <site / Instagram / nothing>
Time per week: <30 minutes>

WHAT TO DO
1. If anything above is thin, ask me — one question at a time, nine at most. Don't guess.
2. Write my brand profile from my site: my voice, words I'd never use, my offers, three things I'd refuse.
3. Build a standing brief: who I'm talking to, what I post about, what I never post.
4. Make one week of content with the Plunder & Riffle engine: five memes and three short videos about my actual business, each with a caption.
5. Show me all of it for approval. Nothing gets published without my tap.
6. Tell me what to do Monday: what to post, in what order, and what to watch.

RULES
No invented numbers, no testimonials I don't have, no publishing without my yes. If you don't know something, ask me.`;
