"use client";

// P&R MEME ARMY — premium upsell landing, onboarding wizard and the
// owner command center for a branded Telegram bot army.
//
// Three states:
//   1. bot === null       → upsell landing (hero, how-it-works, pricing, phone mockup)
//   2. onboarding wizard  → 3-step dialog (brand → Telegram token → languages & launch)
//   3. bot !== null       → live command center (stats + missions/leaderboard/rewards/branding)

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  CircleDollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  FileStack,
  Flame,
  Image as ImageIcon,
  Languages,
  Loader2,
  Lock,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Rocket,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Terminal,
  Trash2,
  Unplug,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ARMY_PLANS, USAGE_NOTE } from "@/lib/plans";
import { LANGUAGES } from "@/lib/languages";
import type { ArmyResponseDTO, ArmyStatsDTO, BotDTO, MemberDTO, MissionDTO } from "@/lib/types";
import { EmptyState, LangChip, SectionHeader, StatCard } from "./shared";
import { PublicCampaignsTeaser } from "./public-campaigns";

const JSONH = { "Content-Type": "application/json" };
const BRAND = "#f97316"; // mockup brand accent — matches the app's orange primary
const LOGO_MAX_BYTES = 400 * 1024;

// ─── static copy ────────────────────────────────────────────────────

const HOW_IT_WORKS: string[] = [
  "Upgrade to Meme Army.",
  "Receive your custom-branded Telegram bot.",
  "Connect your Telegram community or group.",
  "Followers interact with the bot and receive promotional missions.",
  "P&R generates memes, captions and content in their languages.",
  "The system tracks participation, referral clicks and conversions.",
];

const MISSION_CHECKLIST: string[] = [
  "Grab a meme from today's content pack.",
  "Personalize it if you want.",
  "Share it with your audience.",
  "Submit your post or campaign link.",
];

const BOT_COMMANDS: { cmd: string; what: string }[] = [
  { cmd: "/start", what: "Register, pick a language and get the welcome pack." },
  { cmd: "/memes", what: "Grab today's ready-to-share memes." },
  { cmd: "/missions", what: "See today's mission and what it pays." },
  { cmd: "/content", what: "Browse captions, copy and campaign assets." },
  { cmd: "/language", what: "Switch the language the bot speaks to you in." },
  { cmd: "/campaigns", what: "List live campaigns and reward budgets." },
  { cmd: "/leaderboard", what: "See your rank, points and badges." },
  { cmd: "/refer", what: "Get your personal referral link." },
  { cmd: "/rewards", what: "Browse tiers and redeem your points." },
  { cmd: "/submit", what: "Submit your post or campaign link to earn points." },
];

const REWARD_TYPES: { value: string; label: string }[] = [
  { value: "POINTS", label: "Points" },
  { value: "USDC", label: "USDC" },
  { value: "BADGE", label: "Badge" },
  { value: "PRIZE", label: "Prize" },
  { value: "AFFILIATE", label: "Affiliate" },
];

type PackItem = { kind: string; title: string; body: string };
type RewardTier = { name: string; type: string; cost: string; description: string };

const KIND_ORDER = ["ANNOUNCEMENT", "MEME", "POST", "CTA"] as const;
const KIND_LABELS: Record<string, string> = {
  ANNOUNCEMENT: "Announcement",
  MEME: "Meme caption",
  POST: "Post copy",
  CTA: "Call to action",
};
const KIND_STYLES: Record<string, string> = {
  ANNOUNCEMENT: "bg-primary/15 text-primary border-primary/40",
  MEME: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  POST: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  CTA: "bg-amber-500/10 text-amber-400 border-amber-500/25",
};

const MISSION_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  LIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ENDED: "bg-amber-500/10 text-amber-400 border-amber-500/25",
};

const RANK_STYLES = ["text-amber-400", "text-zinc-200", "text-orange-400"];

function normalizeHex(v: string): string | undefined {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim());
  return m ? `#${m[1]}` : undefined;
}

// ─── small shared bits ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const live = status === "LIVE";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] font-bold",
        live ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400" : "bg-amber-400")} aria-hidden />
      {live ? "LIVE" : status === "PAUSED" ? "PAUSED" : status}
    </Badge>
  );
}

function WebhookChip({ status }: { status: string }) {
  const ok = status === "ACTIVE";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] font-semibold",
        ok ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-amber-500/10 text-amber-400 border-amber-500/25",
      )}
      title={
        ok
          ? "Telegram webhook registered"
          : "Webhook not yet reachable — your bot is saved and will activate when the app is served from a public HTTPS URL."
      }
    >
      {ok ? <BadgeCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      Webhook {status}
    </Badge>
  );
}

function LangPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LANGUAGES.map((l) => {
        const on = value.includes(l.code);
        return (
          <button
            key={l.code}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((c) => c !== l.code) : [...value, l.code])}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
              on
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <span aria-hidden>{l.flag}</span>
            {l.label}
            {on ? <Check className="h-3 w-3" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#F97316" className="font-mono text-sm" />
      </div>
    </div>
  );
}

// ─── phone mockup (upsell) ──────────────────────────────────────────

function PhoneMockup() {
  return (
    <div className="hidden md:block">
      <div className="mx-auto w-[290px]">
        <div className="rounded-[2.4rem] border border-border/80 bg-[#0b0e11] p-2 shadow-2xl">
          <div className="overflow-hidden rounded-[2rem] bg-[#0e1621]">
            <div className="flex justify-center pt-2" aria-hidden>
              <div className="h-1.5 w-16 rounded-full bg-white/15" />
            </div>
            {/* Telegram header */}
            <div className="mt-2 flex items-center gap-2.5 border-b border-white/5 bg-[#17212b] px-3.5 py-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: BRAND }}>
                <Flame className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">Brand Meme Army</div>
                <div className="truncate text-[10px] text-white/50">Telegram campaign bot</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
                LIVE
              </span>
            </div>
            {/* conversation */}
            <div className="space-y-2.5 px-3 py-3 text-[11px] leading-relaxed">
              <div className="space-y-1.5 rounded-2xl rounded-tl-md bg-[#182533] p-3 text-white/90">
                <div className="text-[12px] font-bold" style={{ color: BRAND }}>
                  {"🚀 Today's Mission: Spread the Word!"}
                </div>
                <p>Our new product just launched.</p>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Your mission:</div>
                <ul className="space-y-1">
                  {MISSION_CHECKLIST.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: BRAND }} aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl rounded-tl-md bg-[#182533] p-3 text-white/90">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  {"Today's campaign — Rewards available"}
                </div>
                <div className="mt-1.5 text-[11px] font-semibold">Your Army Stats</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-sm font-bold" style={{ color: BRAND }}>248</div>
                    <div className="text-[9px] text-white/50">Participants</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: BRAND }}>631</div>
                    <div className="text-[9px] text-white/50">Shares submitted</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold" style={{ color: BRAND }}>86</div>
                    <div className="text-[9px] text-white/50">Referrals</div>
                  </div>
                </div>
              </div>
              <div
                className="rounded-xl py-2.5 text-center text-[11px] font-bold text-white"
                style={{ background: BRAND }}
                aria-hidden
              >
                {"JOIN TODAY'S MISSION"}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[#17212b] px-3 py-2 text-white/40" aria-hidden>
                <span className="text-[10px]">Message</span>
                <Send className="ml-auto h-3 w-3" style={{ color: BRAND }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── state 1: upsell landing ────────────────────────────────────────

function UpsellLanding({ onDeploy }: { onDeploy: () => void }) {
  return (
    <div>
      {/* hero */}
      <section className="stage-light rounded-3xl border border-border/60 p-6 sm:p-10" aria-labelledby="army-hero-title">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
              <Swords className="h-3.5 w-3.5" aria-hidden />
              P&amp;R MEME ARMY
            </div>
            <h1 id="army-hero-title" className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.05] tracking-tight">
              YOU BUILD THE COMMUNITY.{" "}
              <span className="text-primary ember-text">WE GIVE IT AN ARMY.</span>
            </h1>
            <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Every Whop owner can deploy a branded Telegram bot that gives their members promotional missions, generates
              localized memes, distributes campaign assets and tracks participation.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Button size="lg" className="ember-glow min-h-12 px-6 text-sm font-bold tracking-wide" onClick={onDeploy}>
                <Rocket className="h-4 w-4" aria-hidden />
                DEPLOY YOUR MEME ARMY
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-12 px-6 text-sm font-semibold"
                onClick={() => document.getElementById("army-pricing")?.scrollIntoView({ behavior: "smooth" })}
              >
                See army plans
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-primary" aria-hidden />Your own branded bot</span>
              <span className="inline-flex items-center gap-1.5"><Languages className="h-3.5 w-3.5 text-primary" aria-hidden />Localized to 23 languages</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />Your token, your bot</span>
            </div>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* illustrative stats teaser */}
      <section className="mt-8" aria-label="Illustrative bot statistics">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Participants" value={248} icon={Users} />
          <StatCard label="Shares" value={631} icon={Share2} />
          <StatCard label="Referrals" value={86} icon={MousePointerClick} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Illustrative bot experience and sample statistics.</p>
      </section>

      {/* how it works */}
      <section className="mt-10" aria-labelledby="army-how-title">
        <SectionHeader eyebrow="How it works" title="From upgrade to army in six steps" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step} className="rounded-xl border bg-card p-4 flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-black text-primary">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-foreground/90 pt-1">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* public campaigns teaser */}
      <section className="mt-8" aria-label="Public campaigns coming soon">
        <PublicCampaignsTeaser compact />
      </section>

      {/* pricing */}
      <section className="mt-10 scroll-mt-20" id="army-pricing" aria-labelledby="army-pricing-title">
        <SectionHeader
          eyebrow="Army plans"
          title="Pick your deployment tier"
          subtitle="One setup fee plus a monthly subscription. Cancel any time — the bot and its token always stay yours."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {ARMY_PLANS.map((plan, i) => (
            <div
              key={plan.key}
              className={cn("rounded-2xl border bg-card p-5 sm:p-6 flex flex-col", i === 0 && "border-primary/40")}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                {i === 0 ? (
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px] font-bold">
                    STARTER ARMY
                  </Badge>
                ) : null}
              </div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-black tracking-tight">{plan.setup}</span>
                <span className="text-muted-foreground font-semibold">+ {plan.monthly}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{plan.blurb}</p>
              <Separator className="my-4" />
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-6 min-h-11 font-bold tracking-wide" variant={i === 0 ? "default" : "outline"} onClick={onDeploy}>
                Deploy this army
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pricing is a starting hypothesis. {USAGE_NOTE}
        </p>
      </section>

      {/* final CTA */}
      <section className="stage-light mt-10 rounded-3xl border border-border/60 p-8 sm:p-12 text-center">
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight">READY TO MOBILIZE?</h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
          Connect your Telegram bot today and hand every follower a mission, a meme and a reason to share.
        </p>
        <Button size="lg" className="ember-glow mt-6 min-h-12 px-8 text-sm font-bold tracking-wide" onClick={onDeploy}>
          <Rocket className="h-4 w-4" aria-hidden />
          DEPLOY YOUR MEME ARMY
        </Button>
      </section>
    </div>
  );
}

// ─── state 2: onboarding wizard ─────────────────────────────────────

function OnboardingDialog({
  open,
  onOpenChange,
  mode,
  bot,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "update";
  bot: BotDTO | null;
  onCompleted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [armyName, setArmyName] = useState("");
  const [logo, setLogo] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#f97316");
  const [colorSecondary, setColorSecondary] = useState("#111827");
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en", "es"]);
  const [welcome, setWelcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { username: string | null; webhook: string | null; launchError?: string }>(null);

  // latest bot/mode without re-triggering the reset below when a refresh
  // produces a new bot object while the success view is on screen
  const botRef = useRef(bot);
  const modeRef = useRef(mode);
  botRef.current = bot;
  modeRef.current = mode;

  // reset the wizard whenever it opens, prefilled from the bot in update mode
  useEffect(() => {
    if (!open) return;
    const currentBot = botRef.current;
    const currentMode = modeRef.current;
    setStep(1);
    setError(null);
    setDone(null);
    setBusy(false);
    setToken("");
    setShowToken(false);
    setLogo("");
    if (currentBot && currentMode === "update") {
      setArmyName(currentBot.armyName);
      setColorPrimary(currentBot.colorPrimary);
      setColorSecondary(currentBot.colorSecondary);
      setWebsite(currentBot.website ?? "");
      setGroupTitle(currentBot.groupTitle ?? "");
      setLanguages(currentBot.languages.length > 0 ? [...currentBot.languages] : ["en", "es"]);
      setWelcome(currentBot.welcomeMessage ?? "");
    } else {
      setArmyName("");
      setColorPrimary("#f97316");
      setColorSecondary("#111827");
      setWebsite("");
      setGroupTitle("");
      setLanguages(["en", "es"]);
      setWelcome("");
    }
  }, [open]);

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Pick a PNG or JPG file for the logo.", variant: "destructive" });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast({ title: "Logo too large", description: "Keep the logo under 400 KB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (!url.startsWith("data:image/")) {
        toast({ title: "Could not read that image", description: "Try a different PNG or JPG.", variant: "destructive" });
        return;
      }
      setLogo(url);
    };
    reader.onerror = () => toast({ title: "Could not read that image", description: "Try a different file.", variant: "destructive" });
    reader.readAsDataURL(file);
  }

  function nextFromStep1() {
    if (!armyName.trim()) {
      setError("Give your army a name first.");
      return;
    }
    setError(null);
    setStep(2);
  }

  function nextFromStep2() {
    if (mode === "create" && !token.trim()) {
      setError("Paste the BotFather token to continue.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function submit() {
    if (!armyName.trim()) {
      setError("Give your army a name first.");
      setStep(1);
      return;
    }
    if (mode === "create" && !token.trim()) {
      setError("Paste the BotFather token to continue.");
      setStep(2);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/meme-army/onboard", {
        method: "POST",
        headers: JSONH,
        body: JSON.stringify({
          armyName: armyName.trim(),
          logoDataUrl: logo || undefined,
          colorPrimary: normalizeHex(colorPrimary),
          colorSecondary: normalizeHex(colorSecondary),
          website: website.trim() || undefined,
          botToken: token.trim() || undefined,
          groupTitle: groupTitle.trim() || undefined,
          languages: languages.length > 0 ? languages : undefined,
          welcomeMessage: welcome.trim() || undefined,
        }),
      });
      const json: { error?: string; verified?: { username?: string | null }; webhook?: { status?: string }; bot?: BotDTO } =
        await res.json();
      if (!res.ok) throw new Error(json.error ?? "Onboarding failed — double-check the token and try again.");

      let launchError: string | undefined;
      if (mode === "create") {
        const r2 = await fetch("/api/meme-army", { method: "POST", headers: JSONH, body: JSON.stringify({ action: "launch" }) });
        if (!r2.ok) {
          const j2: { error?: string } = await r2.json();
          launchError = j2.error ?? "Launch failed — open the command center to retry.";
        }
      }
      setDone({
        username: json.verified?.username ?? json.bot?.botUsername ?? null,
        webhook: json.webhook?.status ?? json.bot?.webhookStatus ?? null,
        launchError,
      });
      await onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  const webhookOk = done?.webhook === "ACTIVE";

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto scrollbar-thin sm:max-w-xl" aria-describedby={undefined}>
        {done ? (
          // ── success view ──
          <div className="text-center py-2">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
              <Rocket className="h-7 w-7 text-emerald-400" aria-hidden />
            </div>
            <DialogHeader className="items-center space-y-1 sm:text-center">
              <DialogTitle className="text-xl font-black tracking-tight">
                {mode === "update" ? "ARMY SETTINGS SAVED" : "ARMY DEPLOYED"}
              </DialogTitle>
              <DialogDescription>
                {done.username ? (
                  <span className="inline-flex items-center gap-1 font-mono text-primary">
                    @{done.username.replace(/^@/, "")} <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : (
                  "Your bot is verified and saved."
                )}
              </DialogDescription>
            </DialogHeader>
            <div
              className={cn(
                "mt-4 rounded-xl border p-3 text-left text-xs leading-relaxed",
                webhookOk ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300",
              )}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {webhookOk ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                Webhook {done.webhook ?? "UNKNOWN"}
              </div>
              <p className="mt-1 opacity-90">
                {webhookOk
                  ? "Telegram webhook registered."
                  : "Webhook not yet reachable — your bot is saved and will activate when the app is served from a public HTTPS URL."}
              </p>
              {done.launchError ? <p className="mt-1 text-destructive">Launch issue: {done.launchError}</p> : null}
            </div>
            <p className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
              Your bot belongs to YOU, not to P&amp;R. P&amp;R powers it behind the scenes.
            </p>
            <DialogFooter className="mt-4 sm:justify-center">
              <Button className="min-h-11 font-bold tracking-wide" onClick={() => onOpenChange(false)}>
                Open army command center
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // ── wizard ──
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" aria-hidden />
                {mode === "update" ? "Bot setup" : "Deploy your Meme Army"}
              </DialogTitle>
              <DialogDescription>
                {mode === "update"
                  ? "Update branding, switch the token or adjust languages. Leave the token blank to keep the current one."
                  : "Three steps to a custom-branded Telegram bot for your community."}
              </DialogDescription>
            </DialogHeader>

            {/* step pills */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap" aria-label={`Step ${step} of 3`}>
              {["Name your army", "Connect Telegram", "Languages & launch"].map((label, i) => {
                const n = i + 1;
                const active = step === n;
                const complete = step > n;
                return (
                  <div
                    key={label}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : complete
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-4.5 w-4.5 place-items-center rounded-full text-[9px] font-bold",
                        active ? "bg-primary text-primary-foreground" : complete ? "bg-emerald-500/30 text-emerald-100" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {complete ? <Check className="h-2.5 w-2.5" aria-hidden /> : n}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{n}</span>
                  </div>
                );
              })}
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                {error}
              </div>
            ) : null}

            {/* step 1 — brand */}
            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="army-name">Army name</Label>
                  <Input
                    id="army-name"
                    value={armyName}
                    onChange={(e) => setArmyName(e.target.value)}
                    placeholder="e.g. Apex Traders Army"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="army-logo">Logo (optional, PNG or JPG under 400 KB)</Label>
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="army-logo"
                      className="grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/40 hover:border-primary/40 transition-colors"
                    >
                      {logo ? (
                        <img src={logo} alt="Army logo preview" className="h-full w-full object-cover" />
                      ) : bot?.logoUrl && mode === "update" ? (
                        <img src={bot.logoUrl} alt="Current army logo" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                      )}
                    </label>
                    <Input id="army-logo" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogoFile} />
                    <Button variant="outline" size="sm" className="min-h-11" onClick={() => document.getElementById("army-logo")?.click()}>
                      <Upload className="h-4 w-4" aria-hidden /> {logo ? "Replace logo" : "Upload logo"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField label="Primary color" value={colorPrimary} onChange={setColorPrimary} />
                  <ColorField label="Secondary color" value={colorSecondary} onChange={setColorSecondary} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="army-website">Website (optional)</Label>
                  <Input
                    id="army-website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourwhop.com"
                    className="min-h-11"
                  />
                </div>
              </div>
            ) : null}

            {/* step 2 — telegram */}
            {step === 2 ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-secondary/30 p-3.5 text-xs leading-relaxed text-foreground/90">
                  <div className="mb-1.5 inline-flex items-center gap-1.5 font-bold text-primary">
                    <Terminal className="h-3.5 w-3.5" aria-hidden /> Create the bot in Telegram
                  </div>
                  <ol className="list-decimal space-y-0.5 pl-4">
                    <li>
                      Open <span className="font-mono font-semibold">@BotFather</span> in Telegram → <span className="font-mono">/newbot</span> → choose
                      name + username.
                    </li>
                    <li>Copy the token.</li>
                    <li>Paste it below. Tokens are stored server-side encrypted at rest and are never exposed to the browser or logs.</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="army-token">BotFather token {mode === "update" ? "(leave blank to keep the current token)" : ""}</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="army-token"
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="123456789:AAExample-ToKeN…"
                      autoComplete="off"
                      className="min-h-11 pl-9 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? "Hide token" : "Show token"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="army-group">Connect your Telegram group or channel (optional)</Label>
                  <Input
                    id="army-group"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder="e.g. Apex Traders Community"
                    className="min-h-11"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Add the public title of the group or channel where your army gathers — you can add the bot from your group settings at
                    any time.
                  </p>
                </div>
              </div>
            ) : null}

            {/* step 3 — languages & launch */}
            {step === 3 ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Languages your army speaks</Label>
                  <p className="text-[11px] text-muted-foreground">Missions and memes are generated in every language you pick.</p>
                  <LangPicker value={languages} onChange={setLanguages} />
                  {languages.length === 0 ? (
                    <p className="text-[11px] text-destructive">Pick at least one language.</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="army-welcome">Welcome message (optional)</Label>
                  <Textarea
                    id="army-welcome"
                    value={welcome}
                    onChange={(e) => setWelcome(e.target.value)}
                    rows={3}
                    placeholder="Sent when a member taps /start. Example: Welcome to the army, soldier."
                    className="scrollbar-thin"
                  />
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-foreground/90">
                    Your bot belongs to YOU, not to P&amp;R. P&amp;R powers it behind the scenes.
                  </span>
                </div>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              {step > 1 ? (
                <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => { setError(null); setStep(step - 1); }}>
                  Back
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  className="min-h-11 font-bold tracking-wide"
                  disabled={busy}
                  onClick={step === 1 ? nextFromStep1 : nextFromStep2}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  className="ember-glow min-h-11 font-bold tracking-wide"
                  disabled={busy || languages.length === 0}
                  onClick={() => void submit()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : mode === "create" ? <Rocket className="h-4 w-4" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  {mode === "create" ? "LAUNCH MY ARMY" : "SAVE ARMY SETTINGS"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── mission card ───────────────────────────────────────────────────

function MissionCard({
  mission,
  busy,
  onGoLive,
  onEnd,
  onDelete,
}: {
  mission: MissionDTO;
  busy: boolean;
  onGoLive: () => void;
  onEnd: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={cn("text-[11px] font-bold", MISSION_STATUS_STYLES[mission.status] ?? MISSION_STATUS_STYLES.DRAFT)}>
            {mission.status}
          </Badge>
          {mission.languages.map((code) => (
            <LangChip key={code} code={code} />
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {mission.durationDays}-day
          </span>
          {mission.rewardBudget ? (
            <span className="inline-flex items-center gap-1">
              <CircleDollarSign className="h-3.5 w-3.5" aria-hidden /> {mission.rewardBudget}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <FileStack className="h-3.5 w-3.5" aria-hidden /> {mission.contentPack.length} pack items
          </span>
        </div>
      </div>
      <div>
        <h3 className="font-semibold leading-snug">{mission.title}</h3>
        {mission.product ? <div className="mt-0.5 text-xs font-medium text-primary">{mission.product}</div> : null}
        <p className="mt-1.5 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{mission.description}</p>
      </div>
      {mission.dailyRequirement ? (
        <p className="text-xs text-muted-foreground">
          Daily requirement: <span className="text-foreground/90">{mission.dailyRequirement}</span>
        </p>
      ) : null}
      {mission.rules ? (
        <p className="text-xs text-muted-foreground">
          Rules: <span className="text-foreground/80">{mission.rules}</span>
        </p>
      ) : null}
      {mission.targetUrl ? (
        <a
          href={mission.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-w-full"
        >
          <span className="truncate">{mission.targetUrl}</span>
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      ) : null}
      <div className="mt-auto flex items-center gap-2 flex-wrap border-t border-border/60 pt-3">
        {mission.status === "DRAFT" ? (
          <Button size="sm" className="min-h-11 font-semibold" disabled={busy} onClick={onGoLive}>
            <Megaphone className="h-4 w-4" aria-hidden /> Go live
          </Button>
        ) : null}
        {mission.status === "LIVE" ? (
          <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={onEnd}>
            End mission
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto min-h-11 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Delete mission ${mission.title}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── new mission dialog (with P&R pack generation) ──────────────────

function NewMissionDialog({
  open,
  onOpenChange,
  bot,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bot: BotDTO;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [audience, setAudience] = useState("");
  const [langs, setLangs] = useState<string[]>(bot.languages.length > 0 ? [...bot.languages] : ["en"]);
  const [durationDays, setDurationDays] = useState("7");
  const [dailyRequirement, setDailyRequirement] = useState("");
  const [rewardBudget, setRewardBudget] = useState("");
  const [rules, setRules] = useState("");
  const [pack, setPack] = useState<PackItem[]>([]);
  const [packLang, setPackLang] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announce, setAnnounce] = useState(bot.status === "LIVE");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setProduct("");
    setDescription("");
    setTargetUrl("");
    setAudience("");
    setLangs(bot.languages.length > 0 ? [...bot.languages] : ["en"]);
    setDurationDays("7");
    setDailyRequirement("");
    setRewardBudget("");
    setRules("");
    setPack([]);
    setPackLang(null);
    setGenerating(false);
    setSaving(false);
    setAnnounce(bot.status === "LIVE");
  }, [open, bot]);

  async function generatePack() {
    if (!title.trim() || !description.trim()) {
      toast({ title: "Title and description first", description: "The pack generator needs a mission title and description.", variant: "destructive" });
      return;
    }
    if (langs.length === 0) {
      toast({ title: "Pick at least one language", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/meme-army/generate-pack", {
        method: "POST",
        headers: JSONH,
        body: JSON.stringify({
          title: title.trim(),
          product: product.trim() || undefined,
          description: description.trim(),
          targetUrl: targetUrl.trim() || undefined,
          audience: audience.trim() || undefined,
          languages: langs,
        }),
      });
      const json: { error?: string; pack?: PackItem[]; language?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Pack generation failed");
      setPack(json.pack ?? []);
      setPackLang(json.language ?? null);
      toast({ title: "Content pack ready", description: "Review the pieces below — remove anything before approving." });
    } catch (err) {
      toast({ title: "Pack generation failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function saveMission() {
    if (!title.trim() || !description.trim()) {
      toast({ title: "Missing details", description: "Title and description are required.", variant: "destructive" });
      return;
    }
    if (langs.length === 0) {
      toast({ title: "Pick at least one language", variant: "destructive" });
      return;
    }
    const duration = Number.parseInt(durationDays, 10);
    setSaving(true);
    try {
      const res = await fetch("/api/meme-army/missions", {
        method: "POST",
        headers: JSONH,
        body: JSON.stringify({
          title: title.trim(),
          product: product.trim() || undefined,
          description: description.trim(),
          targetUrl: targetUrl.trim() || undefined,
          audience: audience.trim() || undefined,
          languages: langs,
          durationDays: Number.isFinite(duration) && duration > 0 ? duration : 7,
          dailyRequirement: dailyRequirement.trim() || undefined,
          rewardBudget: rewardBudget.trim() || undefined,
          rules: rules.trim() || undefined,
          contentPack: pack.length > 0 ? pack : undefined,
          launch: bot.status === "LIVE" ? announce : false,
        }),
      });
      const json: { error?: string; mission?: MissionDTO } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the mission");
      const willAnnounce = bot.status === "LIVE" && announce;
      toast({
        title: willAnnounce ? "Mission approved & announced" : "Mission approved",
        description: willAnnounce ? "Your army received the announcement in every selected language." : "Saved as a draft — go live when you are ready.",
      });
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const indexedPack = pack.map((p, idx) => ({ ...p, idx }));
  const grouped = KIND_ORDER.map((kind) => ({ kind, items: indexedPack.filter((p) => p.kind === kind) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !generating && !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto scrollbar-thin sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" aria-hidden /> New mission
          </DialogTitle>
          <DialogDescription>
            Draft the mission, generate a localized content pack with P&amp;R, then approve it. Owner approval required before any
            distribution — nothing is sent to members without your approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-title">Mission title</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Spread the Word!" className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-product">Product (optional)</Label>
              <Input id="m-product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Launch offer, course, drop…" className="min-h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-desc">Description</Label>
            <Textarea
              id="m-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is the mission and why should members care?"
              className="scrollbar-thin"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-url">Target URL (optional)</Label>
              <Input id="m-url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://…" className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-audience">Audience (optional)</Label>
              <Input id="m-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Traders, founders, fans…" className="min-h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Languages for this mission</Label>
            <LangPicker value={langs} onChange={setLangs} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-duration">Duration (days)</Label>
              <Input id="m-duration" type="number" min={1} max={90} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-daily">Daily requirement</Label>
              <Input id="m-daily" value={dailyRequirement} onChange={(e) => setDailyRequirement(e.target.value)} placeholder="1 share per day" className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-budget">Reward budget</Label>
              <Input id="m-budget" value={rewardBudget} onChange={(e) => setRewardBudget(e.target.value)} placeholder="$50 USDC" className="min-h-11" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-rules">Rules (optional)</Label>
            <Input id="m-rules" value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Keep the post live for 48h. No spam." className="min-h-11" />
          </div>

          {/* pack generation */}
          <div className="rounded-xl border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Content pack
              </div>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={generating || saving}
                onClick={() => void generatePack()}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                {pack.length > 0 ? "Regenerate with P&R MCP" : "Generate content pack with P&R MCP"}
              </Button>
            </div>
            {generating ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Generating localized pack across {langs.length}{" "}
                language{langs.length === 1 ? "" : "s"} — usually 10–20 seconds.
              </p>
            ) : null}
            {!generating && pack.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No pack yet — generate announcements, meme captions, post copy and CTAs for every selected language.
              </p>
            ) : null}
            {grouped.length > 0 ? (
              <div className="space-y-3">
                {grouped.map((group) => (
                  <div
                    key={group.kind}
                    className={cn(
                      "rounded-lg border p-3 space-y-2",
                      group.kind === "ANNOUNCEMENT" ? "border-primary/40 bg-primary/5" : "border-border bg-card/50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px] font-bold", KIND_STYLES[group.kind])}>
                        {KIND_LABELS[group.kind] ?? group.kind}
                      </Badge>
                      {group.kind === "ANNOUNCEMENT" && packLang ? <LangChip code={packLang} /> : null}
                      <span className="text-[11px] text-muted-foreground">{group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
                    </div>
                    {group.items.map((item) => (
                      <div key={item.idx} className="rounded-md bg-background/60 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold">{item.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.body}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPack((prev) => prev.filter((_, i) => i !== item.idx))}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${KIND_LABELS[group.kind] ?? group.kind} item`}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* announce + approve */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="m-announce"
                checked={announce}
                disabled={bot.status !== "LIVE"}
                onCheckedChange={(v) => setAnnounce(v === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="m-announce" className="text-sm font-medium">
                  Announce to army now
                </Label>
                {bot.status !== "LIVE" ? (
                  <p className="text-[11px] text-amber-400 mt-0.5">Your bot is paused — resume it before announcing missions.</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sends the announcement to every member in their language as soon as the mission is saved.
                  </p>
                )}
              </div>
            </div>
            <Separator />
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="ghost" className="min-h-11" disabled={saving || generating} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="min-h-11 font-bold tracking-wide" disabled={saving || generating} onClick={() => void saveMission()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                APPROVE &amp; SAVE MISSION
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── leaderboard tab ────────────────────────────────────────────────

function Leaderboard({ members }: { members: MemberDTO[] }) {
  const hasDemo = members.some((m) => m.isDemo);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-lg font-bold">{"🏆 Army Leaderboard"}</h3>
        <span className="text-xs text-muted-foreground">
          {members.length} member{members.length === 1 ? "" : "s"} · ranked by points
        </span>
      </div>
      {hasDemo ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden />
          Sample members are illustrative until real Telegram members join your bot.
        </p>
      ) : null}
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          body="Share your bot link with your community — every member who taps /start shows up here."
        />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <div className="min-w-[760px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14 text-[11px] uppercase tracking-wider">Rank</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Member</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Language</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Points</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Shares</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Referrals</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider">Verified clicks</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider">Badges</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m, i) => (
                    <TableRow key={m.id}>
                      <TableCell className={cn("font-bold", RANK_STYLES[i] ?? "text-muted-foreground")}>#{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.displayName}</span>
                          {m.isDemo ? (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold">
                              SAMPLE
                            </Badge>
                          ) : null}
                        </div>
                        {m.username ? <div className="text-[11px] text-muted-foreground font-mono">@{m.username.replace(/^@/, "")}</div> : null}
                      </TableCell>
                      <TableCell><LangChip code={m.language} /></TableCell>
                      <TableCell className="text-right font-bold">{m.points}</TableCell>
                      <TableCell className="text-right">{m.shares}</TableCell>
                      <TableCell className="text-right">{m.referrals}</TableCell>
                      <TableCell className="text-right">{m.verifiedClicks}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {m.badges.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            m.badges.map((b) => (
                              <Badge key={b} variant="secondary" className="text-[10px] font-semibold">
                                {b}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── rewards tab ────────────────────────────────────────────────────

function RewardsTab({ bot, refresh }: { bot: BotDTO; refresh: () => Promise<void> }) {
  const { toast } = useToast();
  const [tiers, setTiers] = useState<RewardTier[]>(() => bot.rewards.map((r) => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const rewardsKey = JSON.stringify(bot.rewards);

  // resync local edits when the server-side rewards actually change
  useEffect(() => {
    setTiers((JSON.parse(rewardsKey) as RewardTier[]).map((r) => ({ ...r })));
  }, [rewardsKey]);

  function updateTier(i: number, patch: Partial<RewardTier>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function save() {
    const cleaned = tiers
      .map((t) => ({ name: t.name.trim(), type: t.type, cost: t.cost.trim(), description: t.description.trim() }))
      .filter((t) => t.name.length > 0);
    if (cleaned.length === 0) {
      toast({ title: "Nothing to save", description: "Add at least one reward tier with a name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/meme-army", {
        method: "POST",
        headers: JSONH,
        body: JSON.stringify({ action: "rewards", rewards: cleaned }),
      });
      const json: { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save reward tiers");
      toast({ title: "Reward tiers saved", description: "Members see the updated tiers immediately in /rewards." });
      await refresh();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-lg">
          Reward tiers are what members see under /rewards. Keep them funded, honest and achievable.
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => setTiers((prev) => [...prev, { name: "", type: "POINTS", cost: "", description: "" }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add reward tier
        </Button>
      </div>

      {tiers.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title="No reward tiers" body="Add tiers like shoutouts, USDC bonuses or exclusive badges to motivate your army." />
      ) : (
        <div className="space-y-2.5">
          {tiers.map((tier, i) => (
            <div key={i} className="rounded-xl border bg-card p-3.5 grid gap-2.5 sm:grid-cols-[1.2fr_130px_110px_1.6fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Name</Label>
                <Input value={tier.name} onChange={(e) => updateTier(i, { name: e.target.value })} placeholder="Top recruiter" className="min-h-11" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Type</Label>
                <Select value={tier.type} onValueChange={(v) => updateTier(i, { type: v })}>
                  <SelectTrigger className="min-h-11 w-full" aria-label="Reward type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REWARD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Cost</Label>
                <Input value={tier.cost} onChange={(e) => updateTier(i, { cost: e.target.value })} placeholder="500 pts" className="min-h-11" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Description</Label>
                <Input
                  value={tier.description}
                  onChange={(e) => updateTier(i, { description: e.target.value })}
                  placeholder="Shoutout in the channel + 1:1 call"
                  className="min-h-11"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-destructive hover:text-destructive"
                aria-label={`Remove tier ${tier.name || i + 1}`}
                onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button className="min-h-11 font-bold tracking-wide" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Save reward tiers
        </Button>
      </div>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-300 flex gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Reward budgets must be funded and approved before payments. Never promise guaranteed earnings. Rules, eligibility and payout
          status stay transparent.
        </span>
      </div>
    </div>
  );
}

// ─── branding tab ───────────────────────────────────────────────────

function BrandingTab({ bot, refresh }: { bot: BotDTO; refresh: () => Promise<void> }) {
  const { toast } = useToast();
  const [armyName, setArmyName] = useState(bot.armyName);
  const [colorPrimary, setColorPrimary] = useState(bot.colorPrimary);
  const [colorSecondary, setColorSecondary] = useState(bot.colorSecondary);
  const [welcome, setWelcome] = useState(bot.welcomeMessage ?? "");
  const [languages, setLanguages] = useState<string[]>([...bot.languages]);
  const [saving, setSaving] = useState(false);
  const brandKey = `${bot.armyName}|${bot.colorPrimary}|${bot.colorSecondary}|${bot.welcomeMessage ?? ""}|${bot.languages.join(",")}`;

  useEffect(() => {
    setArmyName(bot.armyName);
    setColorPrimary(bot.colorPrimary);
    setColorSecondary(bot.colorSecondary);
    setWelcome(bot.welcomeMessage ?? "");
    setLanguages([...bot.languages]);
  }, [brandKey]);

  async function save() {
    if (!armyName.trim()) {
      toast({ title: "Army name is required", variant: "destructive" });
      return;
    }
    if (languages.length === 0) {
      toast({ title: "Pick at least one language", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/meme-army", {
        method: "POST",
        headers: JSONH,
        body: JSON.stringify({
          action: "update",
          armyName: armyName.trim(),
          colorPrimary: normalizeHex(colorPrimary) ?? bot.colorPrimary,
          colorSecondary: normalizeHex(colorSecondary) ?? bot.colorSecondary,
          welcomeMessage: welcome.trim() || undefined,
          languages,
        }),
      });
      const json: { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save branding");
      toast({ title: "Branding saved", description: "Your bot now uses the updated name, colors and languages." });
      await refresh();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="b-name">Army name</Label>
          <Input id="b-name" value={armyName} onChange={(e) => setArmyName(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Primary color" value={colorPrimary} onChange={setColorPrimary} />
          <ColorField label="Secondary color" value={colorSecondary} onChange={setColorSecondary} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-welcome">Welcome message</Label>
          <Textarea id="b-welcome" value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={3} placeholder="Sent when a member taps /start." className="scrollbar-thin" />
        </div>
        <div className="space-y-1.5">
          <Label>Languages</Label>
          <LangPicker value={languages} onChange={setLanguages} />
        </div>
        <div className="flex justify-end">
          <Button className="min-h-11 font-bold tracking-wide" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Save branding
          </Button>
        </div>
      </div>

      {/* bot command reference */}
      <div className="rounded-xl border bg-card p-4 sm:p-5 h-fit">
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="font-semibold">Bot command reference</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Every command your members get out of the box.</p>
        <ul className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
          {BOT_COMMANDS.map((c) => (
            <li key={c.cmd} className="flex items-start gap-2.5 text-sm">
              <code className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary shrink-0 font-mono">{c.cmd}</code>
              <span className="text-muted-foreground leading-snug">{c.what}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── state 3: live command center ───────────────────────────────────

function LivePanel({
  bot,
  missions,
  members,
  stats,
  refresh,
  onBotSetup,
}: {
  bot: BotDTO;
  missions: MissionDTO[];
  members: MemberDTO[];
  stats: ArmyStatsDTO;
  refresh: () => Promise<void>;
  onBotSetup: () => void;
}) {
  const { toast } = useToast();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyMissionId, setBusyMissionId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const isLive = bot.status === "LIVE";
  const tme = bot.botUsername ? `https://t.me/${bot.botUsername.replace(/^@/, "")}` : null;

  async function runBotAction(action: "pause" | "resume") {
    setBusyAction(action);
    try {
      const res = await fetch("/api/meme-army", { method: "POST", headers: JSONH, body: JSON.stringify({ action }) });
      const json: { error?: string; bot?: BotDTO } = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${action} failed`);
      await refresh();
      toast({
        title: action === "pause" ? "Army paused" : "Army is live",
        description:
          action === "pause"
            ? "Members can still browse — no new missions are announced until you resume."
            : "New missions can be announced again.",
      });
    } catch (err) {
      toast({ title: "Action failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }

  async function disconnect() {
    setBusyAction("disconnect");
    try {
      const res = await fetch("/api/meme-army", { method: "POST", headers: JSONH, body: JSON.stringify({ action: "disconnect" }) });
      const json: { error?: string; ok?: boolean } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Disconnect failed");
      await refresh();
      toast({ title: "Bot disconnected", description: "Your bot and token stay yours — reconnect any time with the same token." });
    } catch (err) {
      toast({ title: "Disconnect failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusyAction(null);
      setConfirmDisconnect(false);
    }
  }

  async function patchMission(id: string, status: "LIVE" | "ENDED") {
    setBusyMissionId(id);
    try {
      const res = await fetch(`/api/meme-army/missions/${id}`, { method: "PATCH", headers: JSONH, body: JSON.stringify({ status }) });
      const json: { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not update the mission");
      await refresh();
      toast({ title: status === "LIVE" ? "Mission is live" : "Mission ended" });
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusyMissionId(null);
    }
  }

  async function deleteMission(id: string) {
    setBusyMissionId(id);
    try {
      const res = await fetch(`/api/meme-army/missions/${id}`, { method: "DELETE" });
      const json: { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not delete the mission");
      await refresh();
      toast({ title: "Mission deleted" });
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setBusyMissionId(null);
    }
  }

  const liveCount = missions.filter((m) => m.status === "LIVE").length;

  return (
    <div>
      {/* header card */}
      <div className="stage-light rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 min-w-0">
            {bot.logoUrl ? (
              <img src={bot.logoUrl} alt={`${bot.armyName} logo`} className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl border border-border object-cover" />
            ) : (
              <div className="grid h-12 w-12 sm:h-14 sm:w-14 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/15">
                <Flame className="h-6 w-6 text-primary" aria-hidden />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{bot.armyName}</h1>
                <StatusBadge status={bot.status} />
              </div>
              <div className="mt-1 flex items-center gap-2.5 flex-wrap text-xs text-muted-foreground">
                {tme ? (
                  <a href={tme} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline">
                    @{bot.botUsername?.replace(/^@/, "")}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
                <WebhookChip status={bot.webhookStatus} />
                {bot.groupTitle ? (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" aria-hidden /> {bot.groupTitle}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap lg:ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={busyAction !== null}
              onClick={() => void runBotAction(isLive ? "pause" : "resume")}
            >
              {busyAction === "pause" || busyAction === "resume" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isLive ? (
                <Pause className="h-4 w-4" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              {isLive ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" onClick={onBotSetup}>
              <Settings className="h-4 w-4" aria-hidden /> Bot setup
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 text-destructive hover:text-destructive"
              disabled={busyAction !== null}
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unplug className="h-4 w-4" aria-hidden /> Disconnect
            </Button>
          </div>
        </div>
      </div>

      {/* live stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Army statistics">
        <StatCard label="Participants" value={stats.participants} icon={Users} />
        <StatCard label="Shares submitted" value={stats.shares} icon={Share2} />
        <StatCard label="Referrals" value={stats.referrals} icon={MousePointerClick} />
        <StatCard label="Verified clicks" value={stats.verifiedClicks} icon={BadgeCheck} />
      </div>

      {/* tabs */}
      <Tabs defaultValue="missions" className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-secondary/40 p-1">
          <TabsTrigger value="missions" className="flex-none min-h-9 gap-1.5">
            <Target className="h-4 w-4" aria-hidden /> Missions
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-none min-h-9 gap-1.5">
            <Users className="h-4 w-4" aria-hidden /> Leaderboard
          </TabsTrigger>
          <TabsTrigger value="rewards" className="flex-none min-h-9 gap-1.5">
            <CircleDollarSign className="h-4 w-4" aria-hidden /> Rewards
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex-none min-h-9 gap-1.5">
            <Settings className="h-4 w-4" aria-hidden /> Branding
          </TabsTrigger>
        </TabsList>

        {/* missions */}
        <TabsContent value="missions" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {missions.length} mission{missions.length === 1 ? "" : "s"} · {liveCount} live. Missions are announced in every
              army language — nothing is distributed without your approval.
            </p>
            <Button className="min-h-11 font-bold tracking-wide" onClick={() => setMissionOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> NEW MISSION
            </Button>
          </div>
          {missions.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No missions yet"
              body="Create your first mission and let P&R generate a localized content pack for your army."
              action={
                <Button className="min-h-11 font-bold tracking-wide" onClick={() => setMissionOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> NEW MISSION
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  busy={busyMissionId === mission.id}
                  onGoLive={() => void patchMission(mission.id, "LIVE")}
                  onEnd={() => void patchMission(mission.id, "ENDED")}
                  onDelete={() => setPendingDeleteId(mission.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* leaderboard */}
        <TabsContent value="leaderboard" className="mt-4">
          <Leaderboard members={members} />
        </TabsContent>

        {/* rewards */}
        <TabsContent value="rewards" className="mt-4">
          <RewardsTab bot={bot} refresh={refresh} />
        </TabsContent>

        {/* branding */}
        <TabsContent value="branding" className="mt-4">
          <BrandingTab bot={bot} refresh={refresh} />
        </TabsContent>
      </Tabs>

      {/* new mission dialog */}
      <NewMissionDialog open={missionOpen} onOpenChange={setMissionOpen} bot={bot} onSaved={refresh} />

      {/* disconnect confirm */}
      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your bot?</AlertDialogTitle>
            <AlertDialogDescription>
              The bot goes offline for every member immediately. Your bot token stays yours — reconnect any time with the same token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my army</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void disconnect()}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete mission confirm */}
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(v) => (!v ? setPendingDeleteId(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mission?</AlertDialogTitle>
            <AlertDialogDescription>
              The mission and its content pack are removed for good. Members who already saw it keep their points.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const id = pendingDeleteId;
                setPendingDeleteId(null);
                if (id) void deleteMission(id);
              }}
            >
              Delete mission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── main export ────────────────────────────────────────────────────

export function MemeArmy() {
  const { toast } = useToast();
  const [data, setData] = useState<ArmyResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardMode, setOnboardMode] = useState<"create" | "update">("create");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/meme-army", { cache: "no-store" });
      const json: ArmyResponseDTO & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load your army");
      setData(json);
    } catch (err) {
      toast({ title: "Could not load Meme Army", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" aria-hidden /> Loading your army…
      </div>
    );
  }

  const bot = data?.bot ?? null;

  return (
    <>
      {bot === null ? (
        <>
          <UpsellLanding onDeploy={() => { setOnboardMode("create"); setOnboardOpen(true); }} />
          <OnboardingDialog open={onboardOpen} onOpenChange={setOnboardOpen} mode={onboardMode} bot={null} onCompleted={refresh} />
        </>
      ) : data ? (
        <>
          <LivePanel
            bot={bot}
            missions={data.missions}
            members={data.members}
            stats={data.stats}
            refresh={refresh}
            onBotSetup={() => { setOnboardMode("update"); setOnboardOpen(true); }}
          />
          <OnboardingDialog open={onboardOpen} onOpenChange={setOnboardOpen} mode={onboardMode} bot={bot} onCompleted={refresh} />
        </>
      ) : null}
    </>
  );
}
