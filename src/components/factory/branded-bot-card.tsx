import { Bot, Sparkles } from "lucide-react";

/**
 * The branded-bot door (Dave, 2026-11-18): users are sent to The
 * Whop Bot — the house branded bot on Telegram — with an offer of
 * 100 free generations to try a branded bot. Branded bots are the
 * upgrade: after a purchase, the member's OWN branded bot opens up,
 * running on their own bot token. The link is Dave's, verbatim
 * (the ref payload is his attribution — never rewrite it).
 */
export const WHOP_BOT_URL = "https://t.me/thewhoppbot?start=ref_745596535";

export function BrandedBotCard() {
  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
        <Bot className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <h2 className="font-semibold flex items-center gap-2 flex-wrap">
          Try a branded bot — The Whop Bot
          <span className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[11px] font-bold">
            <Sparkles className="h-3 w-3" /> 100 free generations
          </span>
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Our house branded bot on Telegram — memes, packs and research wearing one brand. Open it and the
          100 free generations are yours to spend. <b className="text-foreground">Branded bots are the
          upgrade:</b> buy a plan and your <i>own</i> branded bot opens up — your name, your links, running
          on your own bot token.
        </p>
      </div>
      <a
        href={WHOP_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shrink-0 text-center"
      >
        Open @thewhoppbot
      </a>
    </div>
  );
}
