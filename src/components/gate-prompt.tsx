"use client";

import { useRef, useState } from "react";
import { PROMPT_TEXT } from "@/lib/muse-prompt";

/**
 * The prompt, offered at the closed door.
 *
 * While the site gate is up a visitor gets nothing else, so this is the one
 * thing worth handing them: something to take away and use now, elsewhere.
 * Clipboard can fail (insecure context, denied permission), in which case we
 * select the text so a long-press copy still works. A copy button that
 * silently copies nothing is worse than no button.
 */
export function GatePrompt() {
  const promptRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = PROMPT_TEXT;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    if (!ok && promptRef.current) {
      const range = document.createRange();
      range.selectNodeContents(promptRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mt-10 text-left" aria-labelledby="gate-prompt-title">
      <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-primary">
        TAKE THIS WITH YOU
      </p>
      <h2 id="gate-prompt-title" className="mt-3 text-lg font-bold tracking-tight text-balance">
        The prompt we&apos;re opening with
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
        While the door is shut, this still works. Paste it into Muse, answer its
        questions, and it builds the stack — brand profile, a week of content,
        and nothing published without your tap.
      </p>

      <pre
        ref={promptRef}
        tabIndex={0}
        className="mt-4 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {PROMPT_TEXT}
      </pre>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {copied ? "Copied" : "Copy the prompt"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Prompt copied to the clipboard" : ""}
        </span>
      </div>
    </section>
  );
}
