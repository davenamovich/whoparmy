"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Bot, SendHorizonal, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ─── RALPH CHAT (Dave, 2026-11-18) ──────────────────────────────────
 * Button-first chat with Ralph, the floor manager. The action dock
 * is always on screen — typing is optional. Ralph's replies carry
 * their own next actions; navigation intents (open Create, the bot
 * catalog, Campaigns, Account) are executed by the parent page.
 */

export interface RalphNavIntent {
  view: "create" | "agents" | "campaigns" | "account" | "system";
  memeTopic?: string;
}

interface RalphActionDTO {
  id: string;
  label: string;
}

interface RalphReplyDTO {
  text: string;
  actions: string[];
  nav?: { view: RalphNavIntent["view"]; memeTopic?: string };
  topics?: string[];
}

interface Msg {
  role: "ralph" | "member";
  text: string;
  actions?: RalphActionDTO[];
  topics?: string[];
}

const PLACEHOLDER: Record<string, string> = {
  en: "Or just type it — Ralph routes it…",
  es: "O escríbelo — Ralph lo envía…",
  ja: "入力してもOK — Ralphが回します…",
  ru: "Или просто напиши — Ральф разберётся…",
};

export function RalphChat({ onNavigate }: { onNavigate: (intent: RalphNavIntent) => void }) {
  const locale = useLocale();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [menu, setMenu] = useState<RalphActionDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, string>());

  useEffect(() => {
    for (const a of menu) labels.current.set(a.id, a.label);
  }, [menu]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/ralph?locale=${locale}`);
        const data = (await res.json()) as { reply?: RalphReplyDTO; menu?: RalphActionDTO[] };
        if (!live) return;
        if (data.menu) setMenu(data.menu);
        if (data.reply) {
          setMessages([{ role: "ralph", text: data.reply.text, actions: mapActions(data, data.reply), topics: data.reply.topics }]);
        }
      } catch {
        if (live) setMessages([{ role: "ralph", text: "Ralph's line is down for a second — the buttons below still route to every room.", actions: [] }]);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function mapActions(data: { menu?: RalphActionDTO[] }, reply: RalphReplyDTO): RalphActionDTO[] {
    const all = data.menu ?? menu;
    return (reply.actions ?? [])
      .map((id) => all.find((a) => a.id === id) ?? (labels.current.get(id) ? { id, label: labels.current.get(id)! } : null))
      .filter((a): a is RalphActionDTO => !!a);
  }

  async function send(body: { actionId?: string; text?: string }, memberText?: string) {
    if (busy) return;
    setBusy(true);
    if (memberText) setMessages((m) => [...m, { role: "member", text: memberText }]);
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch("/api/ralph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, locale, history }),
      });
      const data = (await res.json()) as { reply?: RalphReplyDTO; menu?: RalphActionDTO[]; error?: string };
      if (data.menu) setMenu(data.menu);
      if (data.reply) {
        const reply = data.reply;
        setMessages((m) => [...m, { role: "ralph", text: reply.text, actions: mapActions(data, reply), topics: reply.topics }]);
        if (reply.nav) {
          window.setTimeout(() => onNavigate(reply.nav!), 900);
        }
      } else {
        setMessages((m) => [...m, { role: "ralph", text: data.error ?? "Something jammed on my side — try a button.", actions: [] }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "ralph", text: "Lost the line for a second — try that once more.", actions: [] }]);
    } finally {
      setBusy(false);
    }
  }

  function tapAction(a: RalphActionDTO) {
    void send({ actionId: a.id }, a.label);
  }

  function tapTopic(topic: string) {
    onNavigate({ view: "create", memeTopic: topic });
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send({ text }, text);
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl bg-primary grid place-items-center text-primary-foreground">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold tracking-tight leading-none">Ralph</h2>
          <p className="text-xs text-muted-foreground mt-1">Your floor manager — one tap, the right agent gets it.</p>
        </div>
      </div>

      <div ref={scrollRef} className="rounded-2xl border bg-card/50 h-[46vh] min-h-80 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.role === "member" && "flex-row-reverse")}>
            <span
              className={cn(
                "w-7 h-7 rounded-lg grid place-items-center shrink-0",
                m.role === "ralph" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              {m.role === "ralph" ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </span>
            <div className={cn("max-w-[85%] space-y-2", m.role === "member" && "text-right")}>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-left",
                  m.role === "ralph" ? "bg-secondary/60" : "bg-primary text-primary-foreground",
                )}
              >
                {m.text}
              </div>
              {m.topics && m.topics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {m.topics.map((t) => (
                    <button
                      key={t}
                      onClick={() => tapTopic(t)}
                      className="rounded-full border border-primary/40 text-primary text-xs font-medium px-3 py-1.5 hover:bg-primary/10 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
              {m.actions && m.actions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {m.actions.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => tapAction(a)}
                      disabled={busy}
                      className="rounded-full bg-primary/12 text-primary text-xs font-semibold px-3 py-1.5 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? <p className="text-xs text-muted-foreground pl-10">Ralph is routing it…</p> : null}
      </div>

      {/* the dock: every door, always one tap away */}
      {menu.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {menu.map((a) => (
            <button
              key={a.id}
              onClick={() => tapAction(a)}
              disabled={busy}
              className="rounded-full border text-xs font-medium px-3 py-2 hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2 mt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitDraft();
          }}
          placeholder={PLACEHOLDER[locale] ?? PLACEHOLDER.en}
          className="flex-1 rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary/60"
        />
        <button
          onClick={submitDraft}
          disabled={busy || !draft.trim()}
          className="rounded-xl bg-primary text-primary-foreground px-3.5 grid place-items-center disabled:opacity-50"
          aria-label="Send"
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
