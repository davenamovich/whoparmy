"use client";

import { useState } from "react";
import { Bot, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * The agent-led start (Dave, 2026-11-18): "Simplify this and not
 * ask 20 questions — this needs to be an agent led app. Generate
 * content based on the user's website and/or CTA if not the
 * website, and don't ask anything beyond that. Use our deep
 * research to generate memes. Get the user to simply give their
 * agent a prompt — the agent generates memes, videos and other
 * formats; move the generation off the Whop app. Delivering a meme
 * in an app does nothing unless they are hooked up to Upload-Post,
 * so get users generating with agents on autopilot."
 *
 * So this card asks for exactly ONE thing — a website, or a CTA
 * link when there is no site — and does the rest itself:
 *   1. saves it as the member's brand profile (name derived from
 *      the domain; research learns the real one),
 *   2. starts the deep-research job on it,
 *   3. mints the one-link agent handoff (Operator/Agency) so the
 *      member hands their agent a link, not a questionnaire.
 * Generation then happens in the member's agent, on their key;
 * finished content comes back here for the approve tap and goes
 * out through their Upload-Post.
 */

const MUSE_INVITE_URL = "https://www.plunderandriffle.com/muse-invite";
const AGENT37_URL = "https://agent37.com/?via=riffle";

function nameFromUrl(raw: string): string {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    const first = host.split(".")[0] || host;
    return first.charAt(0).toUpperCase() + first.slice(1);
  } catch {
    return "My business";
  }
}

type Phase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "linked"; link: string; researched: boolean }
  | { kind: "doors"; researched: boolean };

export function AgentStart() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function start() {
    const value = input.trim();
    if (!/^https?:\/\//i.test(value)) {
      toast.error("Paste a full link — your website, or your CTA link if you don't have a site.");
      return;
    }
    setPhase({ kind: "working" });
    const name = nameFromUrl(value);

    // 1) Brand profile, best effort — a plan cap or an existing
    // profile must never block the handoff.
    try {
      const brandsRes = await fetch("/api/brands");
      const brandsData = (await brandsRes.json().catch(() => ({}))) as { brands?: unknown[] };
      if (!brandsData.brands?.length) {
        await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, website: value }),
        });
      }
    } catch {
      // best effort
    }

    // 2) Deep research on the site (or the CTA page).
    let researched = false;
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name, website: value }),
      });
      researched = res.ok;
    } catch {
      researched = false;
    }

    // 3) The agent handoff link (Operator/Agency gate lives in the
    // endpoint; anyone else gets the agent doors instead).
    try {
      const res = await fetch("/api/bridge/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.ok && data.code) {
        setPhase({
          kind: "linked",
          link: `https://whop.plunderandriffle.com/connect/${data.code}`,
          researched,
        });
        return;
      }
    } catch {
      // fall through to the doors
    }
    setPhase({ kind: "doors", researched });
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied — give it to your agent.");
    } catch {
      toast.error("Copy failed — long-press the link to copy it.");
    }
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary grid place-items-center text-primary-foreground shrink-0">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight">Start with your website — that's all we ask</h2>
          <p className="text-sm text-muted-foreground">
            No questionnaires. Deep research learns your business from your site, and your agent
            generates the memes, videos and posts from it — on your key, on autopilot. Everything
            comes back here for your approve tap before it posts.
          </p>
        </div>
      </div>

      {phase.kind === "idle" || phase.kind === "working" ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            className="flex-1"
            placeholder="Your website — or your CTA link if you don't have a site"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="url"
          />
          <Button onClick={() => void start()} disabled={phase.kind === "working"}>
            {phase.kind === "working" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Hand it to my agent
          </Button>
        </div>
      ) : null}

      {phase.kind === "linked" ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4 text-emerald-600" />
            {phase.researched
              ? "Deep research is reading your site now. One step left:"
              : "One step left:"}
          </p>
          <p className="text-sm text-muted-foreground">
            Give your agent this link — that is the whole setup. It picks up your business, your
            research and its instructions from the page, then generates on your key and brings the
            finished content back here.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border bg-background px-3 py-2 text-xs sm:text-sm">
              {phase.link}
            </code>
            <Button variant="outline" onClick={() => void copyLink(phase.link)}>
              <Copy className="h-4 w-4 mr-2" /> Copy the link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No agent yet? <a className="underline" href={MUSE_INVITE_URL}>Start with Muse</a> or{" "}
            <a className="underline" href={AGENT37_URL}>meet the Agent37 team</a> — both are our
            referral links. And connect Upload-Post in Account so finished posts can actually go
            out — content sitting in an app helps nobody.
          </p>
        </div>
      ) : null}

      {phase.kind === "doors" ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4 text-emerald-600" />
            {phase.researched ? "Deep research is reading your site now." : "Saved."}
          </p>
          <p className="text-sm text-muted-foreground">
            Your Muse connects with no subscription. Either way, your
            agent is the generator — pick your door and give it your website:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href={MUSE_INVITE_URL}>Start with Muse</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={AGENT37_URL}>Meet Agent37</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Both are our referral links — we may earn a commission or tokens when you join. Connect
            Upload-Post in Account so finished posts can actually go out.
          </p>
        </div>
      ) : null}
    </div>
  );
}
