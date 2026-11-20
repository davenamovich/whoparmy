"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2 } from "lucide-react";
import { LANGUAGES } from "@/lib/languages";

interface MemberLanguageView {
  language: string;
  label: string;
  source: "pick" | "locale" | "default";
}

/**
 * Your language (Global expansion Phase 0, Dave 2026-11-19): one
 * stored language per member — content, agent jobs, bridge briefs,
 * Day-1 prompts and agent reports all default to it. The pick is
 * explicit here; until a member picks, the UI locale speaks for
 * them, and English after that.
 */
export function LanguageCard() {
  const [state, setState] = useState<MemberLanguageView | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/language");
      if (res.ok) setState(((await res.json()) as { language: MemberLanguageView }).language);
    } catch {
      // best-effort card
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = async (language: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (res.ok) setState(((await res.json()) as { language: MemberLanguageView }).language);
    } catch {
      // best-effort card
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="h-4 w-4 text-primary" /> Your language
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        Your content, your agents and your audio are made in this language by default — on
        Telegram, through the bridge, and in every pack. You can still ask for any piece in
        another language.
      </p>
      <select
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={state?.language ?? "en"}
        onChange={(e) => void pick(e.target.value)}
        disabled={!state || saving}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.native} — {l.label}
          </option>
        ))}
      </select>
      {state && state.source !== "pick" ? (
        <p className="text-[11px] text-muted-foreground">
          Currently following your {state.source === "locale" ? "app language" : "default"} — pick
          one here to lock it in.
        </p>
      ) : null}
    </div>
  );
}
