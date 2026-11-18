"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";

/**
 * Connect Telegram — pairs the member's Telegram chat with Ralph
 * (Dave, 2026-11-18). Renders nothing until the operator configures
 * the house bot; a dead card helps nobody.
 */
interface TgState {
  configured: boolean;
  username: string | null;
  linked: boolean;
  linkedUsername: string | null;
}

export function TelegramLinkCard() {
  const [state, setState] = useState<TgState | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/telegram/ralph");
      if (res.ok) setState((await res.json()) as TgState);
    } catch {
      // card stays hidden on failure
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => void load(), 4000);
    const stop = window.setTimeout(() => setWaiting(false), 120_000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, [waiting]);

  useEffect(() => {
    if (state?.linked) setWaiting(false);
  }, [state?.linked]);

  if (!state || !state.configured) return null;

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/telegram/ralph", { method: "POST" });
      const data = (await res.json()) as { deepLink?: string };
      if (data.deepLink) {
        window.open(data.deepLink, "_blank", "noopener");
        setWaiting(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await fetch("/api/telegram/ralph", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <span className="w-10 h-10 rounded-xl bg-primary/12 text-primary grid place-items-center shrink-0">
        <Send className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold">Ralph on Telegram</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {state.linked
            ? `Linked${state.linkedUsername ? ` as @${state.linkedUsername}` : ""}. Ralph answers you there with the same memory and the same one-tap buttons.`
            : waiting
              ? "Telegram opened — tap Start in the chat and Ralph links this account. Checking…"
              : "Take Ralph with you: the same floor manager, the same memory of your business, in Telegram — buttons, not typing."}
        </p>
      </div>
      {state.linked ? (
        <button
          onClick={() => void unlink()}
          disabled={busy}
          className="rounded-xl border px-4 py-2.5 text-sm font-medium hover:border-destructive/50 hover:text-destructive transition-colors disabled:opacity-50 shrink-0"
        >
          Unlink
        </button>
      ) : (
        <button
          onClick={() => void connect()}
          disabled={busy || waiting}
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold disabled:opacity-50 shrink-0 inline-flex items-center gap-2"
        >
          {busy || waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {waiting ? "Waiting for Telegram…" : "Connect Telegram"}
        </button>
      )}
    </div>
  );
}
