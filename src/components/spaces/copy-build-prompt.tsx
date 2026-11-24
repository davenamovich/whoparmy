"use client";
import { useState } from "react";
export function CopyBuildPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="space-y-2"><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">{prompt}</pre><button className="rounded-md border border-border px-3 py-2 text-xs font-semibold" onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied(true); }}>{copied ? "COPIED" : "COPY BUILD PROMPT"}</button></div>;
}
