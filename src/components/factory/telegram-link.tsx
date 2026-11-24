"use client";

import { useState } from "react";
import { Link2, Send } from "lucide-react";

/**
 * Welcome bot on Telegram (Dave, 2026-11-18; repointed to
 * @PlunderWelcomeBot 2026-11-24): the pairing door opens the
 * meme-loop-engine welcome bot — Whoparmy does not rebuild it.
 * This card is the door, plus pairing: the member mints a
 * one-time code here and opens the bot with it, which binds their
 * Telegram account to this one — from then on, the member's
 * memory is the same on Telegram and on the web (one shared store).
 */
export function TelegramLinkCard() {
  const [pair, setPair] = useState<{ code: string; botLink: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPairing() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/pair", { method: "POST" });
      if (!res.ok) throw new Error("pair failed");
      const data = (await res.json()) as { code: string; botLink: string };
      setPair(data);
    } catch {
      setError("Couldn't create a pairing code — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 mb-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center shrink-0">
          <Send className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">Welcome bot on Telegram</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The P&amp;R welcome bot lives on Telegram — it walks you through getting set up, connects your Muse,
            runs your free first proof, makes memes, and shows you where you are.
            Pair it to this account and your memory is the same in both places.
          </p>
        </div>
        <a
          href="https://t.me/PlunderWelcomeBot"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border px-4 py-2.5 text-sm font-semibold shrink-0 text-center"
        >
          Open @PlunderWelcomeBot
        </a>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border/60 pt-4">
        {pair ? (
          <>
            <p className="text-sm flex-1">
              Your one-time code:{" "}
              <span className="font-mono font-bold tracking-widest">{pair.code}</span>{" "}
              <span className="text-muted-foreground">(expires in 24 hours)</span>
            </p>
            <a
              href={pair.botLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shrink-0 text-center"
            >
              Open the bot with my code
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground flex-1 flex items-center gap-1.5">
              <Link2 className="h-4 w-4 shrink-0" />
              Pairing takes one tap — the bot opens with your code attached.
            </p>
            <button
              onClick={startPairing}
              disabled={busy}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shrink-0 disabled:opacity-60"
            >
              {busy ? "Creating code…" : "Pair my Telegram"}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
