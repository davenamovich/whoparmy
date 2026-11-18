"use client";

import { Send } from "lucide-react";

/**
 * Ralph on Telegram — a link out to the real bot (Dave, 2026-11-18:
 * "use meme-loop-engine for the telegram bot — it is far more
 * developed"). The bot at @PlunderRiffleBot already runs the full
 * command surface with Ralph chat; Whoparmy does not rebuild it.
 * This card is just the door.
 */
export function TelegramLinkCard() {
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center shrink-0">
        <Send className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold">Ralph on Telegram</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The full P&amp;R bot lives on Telegram — memes, packs, research, your account, and a chat with Ralph.
          Same machine, in your pocket.
        </p>
      </div>
      <a
        href="https://t.me/PlunderRiffleBot"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shrink-0 text-center"
      >
        Open @PlunderRiffleBot
      </a>
    </div>
  );
}
