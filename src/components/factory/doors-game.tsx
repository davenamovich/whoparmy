"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PhoneCall,
  Volume2,
  VolumeX,
  Eye,
  Flame,
  Trophy,
  Coins,
  Users,
  Copy,
  Check,
  Sparkles,
  Clock,
  KeyRound,
  Lightbulb,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslations, useLocale } from "next-intl";
import type { ReferralState } from "@/lib/referrals";
import { playDoorSound, isDoorsMuted, setDoorsMuted } from "@/lib/doors-sounds";

/**
 * WHO'S CALLING? DOORS — the daily doors game, War Room wing.
 * Server-authoritative: the client never learns an unopened door's
 * prize. Flow: pick a caller → keep a door → Call It + open doors →
 * the Banker phones in twice → Deal / No Deal → winnings land as free
 * generations on the member's balance. Bid Points (referrals only)
 * feed the weekly key auction below the game.
 */

type Band = "dud" | "low" | "high" | "jackpot";
type CallBand = "low" | "high";

interface DoorsMeme {
  door?: number;
  imageUrl: string;
  alt: string;
  caption: string;
  format?: string;
  audioUrl?: string;
}

interface DoorInfo {
  door: number;
  visual: string;
  label: string;
}

interface GameResult {
  type: string;
  amount: number;
  bonusCredits?: number;
  gensAwarded?: number;
}

interface AuctionSummary {
  status: "UPCOMING" | "OPEN" | "CLOSED";
  prizeLabel: string;
  opensAt: string;
  closesAt: string;
  topBid: number;
  winnerNote?: string;
}

interface TodayData {
  gameDate: string;
  language?: string;
  callersToday: string[];
  doors: DoorInfo[];
  memes: DoorsMeme[];
  prizes: number[];
  alreadyPlayed: boolean;
  existingResult?: GameResult | null;
  pointsBalance: number;
  freeGenBalance: number;
  auction?: AuctionSummary | null;
}

interface AuctionData {
  status: "UPCOMING" | "OPEN" | "CLOSED";
  prizeLabel: string;
  opensAt: string;
  closesAt: string;
  topBids: { points: number; mine?: boolean }[];
  myBid: number;
  balance: number;
  minNextBid: number;
  winnerNote?: string;
}

interface OpenedDoor {
  prize: number;
  meme: DoorsMeme;
  reaction: string;
}

interface OfferData {
  round: number;
  amount: number;
  bankerLine: string;
  chaosFactor?: number;
  sweatApplied?: boolean;
}

type Phase =
  | "loading"
  | "failed"
  | "already"
  | "picker"
  | "intro"
  | "keeper"
  | "opening"
  | "bankerRing"
  | "bankerOffer"
  | "done";

const CALLER_IMAGES: Record<string, string> = {
  joe: "/doors/callers/joe.png",
  grandma: "/doors/callers/grandma.webp",
  grandpa: "/doors/callers/grandpa.webp",
  "young-mom": "/doors/callers/young-mom.webp",
  "college-kid": "/doors/callers/college-kid.webp",
  "shop-owner-mike": "/doors/callers/shop-owner-mike.webp",
};

const CALLER_COLORS: Record<string, string> = {
  joe: "#f43f5e",
  grandma: "#f59e0b",
  grandpa: "#38bdf8",
  "young-mom": "#34d399",
  "college-kid": "#a78bfa",
  "shop-owner-mike": "#fb923c",
};

const DOOR_BACKGROUNDS: Record<string, string> = {
  torii: "linear-gradient(180deg, #dc2626 0%, #991b1b 55%, #7f1d1d 100%)",
  lantern: "radial-gradient(ellipse at 50% 32%, #fde68a 0%, #f59e0b 58%, #b45309 100%)",
  sakura: "linear-gradient(180deg, #fbcfe8 0%, #f472b6 58%, #db2777 100%)",
  shoji: "linear-gradient(180deg, #fff7e0 0%, #fde68a 100%)",
  shrine: "linear-gradient(160deg, #fde047 0%, #d97706 55%, #92400e 100%)",
};

const KANJI = ["一", "二", "三", "四", "五"];

const DOORS_CSS = `
@keyframes dr-ring-shake {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(-2.4deg); }
  40% { transform: rotate(2.4deg); }
  60% { transform: rotate(-1.8deg); }
  80% { transform: rotate(1.8deg); }
}
.dr-ring { animation: dr-ring-shake 0.55s ease-in-out infinite; transform-origin: 50% 12%; }
.dr-ring-d1 { animation-delay: 0.6s; }
.dr-ring-d2 { animation-delay: 1.2s; }
@keyframes dr-pulse-gold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
  50% { box-shadow: 0 0 24px 5px rgba(250, 204, 21, 0.5); }
}
.dr-jackpot-alive { animation: dr-pulse-gold 1.6s ease-in-out infinite; }
@keyframes dr-slide-in {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.dr-slide-in { animation: dr-slide-in 0.35s ease-out both; }
@keyframes dr-lantern-pop {
  0% { transform: scale(0.6); }
  60% { transform: scale(1.3); }
  100% { transform: scale(1); }
}
.dr-lantern-lit { animation: dr-lantern-pop 0.4s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .dr-ring, .dr-jackpot-alive, .dr-slide-in, .dr-lantern-lit { animation: none !important; }
}
`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

function normalizeAssignment(a: unknown): Record<number, number> | null {
  if (!a) return null;
  if (Array.isArray(a)) {
    if (a.length > 0 && typeof a[0] === "object" && a[0] !== null && "door" in (a[0] as Record<string, unknown>)) {
      const m: Record<number, number> = {};
      for (const r of a as { door: number; prize: number }[]) m[r.door] = r.prize;
      return m;
    }
    const m: Record<number, number> = {};
    (a as unknown[]).forEach((p, i) => {
      if (typeof p === "number") m[i] = p;
    });
    return Object.keys(m).length ? m : null;
  }
  if (typeof a === "object") {
    const m: Record<number, number> = {};
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      const d = Number(k);
      if (!Number.isNaN(d) && typeof v === "number") m[d] = v;
    }
    return Object.keys(m).length ? m : null;
  }
  return null;
}

function CallerAvatar({ caller, name, size = 64 }: { caller: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const src = CALLER_IMAGES[caller];
  const color = CALLER_COLORS[caller] ?? "#f43f5e";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (!src || err) {
    return (
      <div
        aria-label={name}
        className="rounded-full grid place-items-center font-black shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.36),
          color: "#0b0b10",
          background: `radial-gradient(circle at 32% 30%, #ffffff 0%, ${color} 55%, ${color} 100%)`,
          boxShadow: `0 0 0 3px ${color}55, 0 0 18px ${color}44`,
        }}
      >
        {initials || "?"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setErr(true)}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size, boxShadow: `0 0 0 3px ${color}55, 0 0 18px ${color}44` }}
    />
  );
}

export function DoorsGame() {
  const t = useTranslations("doors");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<TodayData | null>(null);
  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [referrals, setReferrals] = useState<ReferralState | null>(null);
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const toastId = useRef(0);

  // game session state
  const [caller, setCaller] = useState<string | null>(null);
  const [selectedCaller, setSelectedCaller] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [commitmentHash, setCommitmentHash] = useState<string | null>(null);
  const [keeperDoor, setKeeperDoor] = useState<number | null>(null);
  const [opened, setOpened] = useState<Record<number, OpenedDoor>>({});
  const [remaining, setRemaining] = useState<number[]>([]);
  const [opensUntilBanker, setOpensUntilBanker] = useState(2);
  const [streak, setStreak] = useState(0);
  const [peeksBanked, setPeeksBanked] = useState(0);
  const [sweatArmed, setSweatArmed] = useState(false);
  const [peekMode, setPeekMode] = useState(false);
  const [peekedBands, setPeekedBands] = useState<Record<number, Band>>({});
  const [selectedCall, setSelectedCall] = useState<CallBand | null>(null);
  const [mikeTipDoor, setMikeTipDoor] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ door: number; prize: number; meme: DoorsMeme; reaction: string; callResult?: { band: string; correct: boolean } } | null>(null);
  const [nextPhase, setNextPhase] = useState<Phase | null>(null);
  const [offer, setOffer] = useState<OfferData | null>(null);
  const [readBand, setReadBand] = useState<Band | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [assignment, setAssignment] = useState<Record<number, number> | null>(null);

  // auction state
  const [bidInput, setBidInput] = useState("");
  const [bidMsg, setBidMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const pushToast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3800);
  }, []);

  const loadAuction = useCallback(async () => {
    try {
      const a = await api<AuctionData>("/api/doors/auction");
      setAuction(a);
      setBidInput((prev) => (prev === "" ? String(a.minNextBid) : prev));
    } catch {
      // auction panel is secondary — the game itself still works
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<TodayData>("/api/doors/today");
      setToday(data);
      setRemaining([...data.prizes].sort((a, b) => b - a));
      setPhase(data.alreadyPlayed ? "already" : "picker");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
      setPhase("failed");
    }
    void loadAuction();
  }, [loadAuction, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    fetch("/api/referrals")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setReferrals(data.referrals as ReferralState);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setMuted(isDoorsMuted());
  }, []);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setDoorsMuted(next);
    if (!next) playDoorSound("click");
  };

  const bandLabel = (band: string): string => {
    switch (band) {
      case "dud":
        return t("bandDud");
      case "low":
        return t("bandLow");
      case "high":
        return t("bandHigh");
      case "jackpot":
        return t("bandJackpot");
      default:
        return band;
    }
  };

  const doorDisplay = (door: number): string => {
    const info = today?.doors.find((d) => d.door === door);
    return info?.label ?? t("doorLabel", { n: door + 1 });
  };

  const callerName = (id: string): string => t(`callers.${id}.name`);

  // ─── game actions ─────────────────────────────────────────────────

  const handleSelectCaller = (id: string) => {
    if (selectedCaller !== id) {
      setSelectedCaller(id);
      playDoorSound("ring");
    }
  };

  const handleAnswer = (id: string) => {
    setSelectedCaller(id);
    setCaller(id);
    playDoorSound("click");
    setPhase("intro");
  };

  const handleStart = async (door: number) => {
    if (!caller || busy) return;
    setBusy(true);
    try {
      const data = await api<{
        sessionId: string;
        commitmentHash: string;
        state: string;
        opensNeeded: number;
        mikeTipDoor?: number | null;
        peeksBanked?: number;
        momPeek?: { door: number; band: Band } | null;
      }>("/api/doors/start", {
        method: "POST",
        body: JSON.stringify({ caller, keeperDoor: door }),
      });
      setSessionId(data.sessionId);
      setCommitmentHash(data.commitmentHash);
      setKeeperDoor(door);
      setOpensUntilBanker(typeof data.opensNeeded === "number" && data.opensNeeded > 0 ? data.opensNeeded : 2);
      if (typeof data.mikeTipDoor === "number") setMikeTipDoor(data.mikeTipDoor);
      if (typeof data.peeksBanked === "number") setPeeksBanked(data.peeksBanked);
      if (data.momPeek) setPeekedBands((prev) => ({ ...prev, [data.momPeek!.door]: data.momPeek!.band }));
      playDoorSound("sting");
      setPhase("opening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "already_played") {
        void load();
      } else {
        pushToast(msg || t("genericError"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePeek = async (door: number) => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const data = await api<{ door: number; band: Band }>("/api/doors/peek", {
        method: "POST",
        body: JSON.stringify({ sessionId, door }),
      });
      setPeekedBands((prev) => ({ ...prev, [data.door]: data.band }));
      setPeeksBanked((prev) => Math.max(0, prev - 1));
      setPeekMode(false);
      playDoorSound("pop");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (door: number) => {
    if (!sessionId || busy) return;
    if (peekMode) {
      void handlePeek(door);
      return;
    }
    setBusy(true);
    try {
      const data = await api<{
        door: number;
        prize: number;
        meme: DoorsMeme;
        reaction: string;
        remainingPrizes: number[];
        openedCount: number;
        state: string;
        streak: number;
        peeksBanked: number;
        sweatArmed: boolean;
        callResult?: { band: string; correct: boolean };
      }>("/api/doors/open", {
        method: "POST",
        body: JSON.stringify({ sessionId, door, ...(selectedCall ? { callBand: selectedCall } : {}) }),
      });
      const prevPeeks = peeksBanked;
      const prevSweat = sweatArmed;
      setOpened((prev) => ({ ...prev, [data.door]: { prize: data.prize, meme: data.meme, reaction: data.reaction } }));
      setRemaining([...data.remainingPrizes].sort((a, b) => b - a));
      if (typeof data.streak === "number") setStreak(data.streak);
      if (typeof data.peeksBanked === "number") setPeeksBanked(data.peeksBanked);
      if (typeof data.sweatArmed === "boolean") setSweatArmed(data.sweatArmed);
      if (typeof data.peeksBanked === "number" && data.peeksBanked > prevPeeks) pushToast(t("peekEarned"));
      if (typeof data.sweatArmed === "boolean" && data.sweatArmed && !prevSweat) pushToast(t("sweatToast"));
      setSelectedCall(null);
      // sounds + optional caller-voiced narration hook
      if (data.prize >= 805) playDoorSound("jackpot");
      else if (data.prize === 0) playDoorSound("thud");
      else playDoorSound("pop");
      if (data.meme?.audioUrl) {
        try {
          void new Audio(data.meme.audioUrl).play().catch(() => {});
        } catch {
          // narration is a garnish, never a blocker
        }
      }
      const isBanker = typeof data.state === "string" && data.state.includes("banker");
      setNextPhase(isBanker ? "bankerRing" : "opening");
      if (!isBanker) setOpensUntilBanker((prev) => Math.max(0, prev - 1));
      setReveal({ door: data.door, prize: data.prize, meme: data.meme, reaction: data.reaction, callResult: data.callResult });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const closeReveal = () => {
    setReveal(null);
    if (nextPhase) {
      setPhase(nextPhase);
      if (nextPhase === "bankerRing") playDoorSound("ring");
      setNextPhase(null);
    }
  };

  const handleAnswerBanker = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const data = await api<OfferData & { remainingPrizes?: number[] }>("/api/doors/offer", {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });
      setOffer({ round: data.round, amount: data.amount, bankerLine: data.bankerLine, chaosFactor: data.chaosFactor, sweatApplied: data.sweatApplied });
      if (Array.isArray(data.remainingPrizes)) setRemaining([...data.remainingPrizes].sort((a, b) => b - a));
      setPhase("bankerOffer");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const handleRead = async (band: Band) => {
    if (!sessionId || busy || readBand) return;
    setBusy(true);
    try {
      await api<{ ok: boolean }>("/api/doors/read", {
        method: "POST",
        body: JSON.stringify({ sessionId, band }),
      });
      setReadBand(band);
      playDoorSound("click");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const handleDecide = async (decision: "deal" | "no_deal") => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const data = await api<{ state: string; result?: GameResult; assignment?: unknown; opensNeeded?: number }>("/api/doors/decide", {
        method: "POST",
        body: JSON.stringify({ sessionId, decision }),
      });
      playDoorSound(decision === "deal" ? "sting" : "click");
      const finished = data.state === "finished" || data.state === "done" || !!data.result;
      if (finished && data.result) {
        setResult(data.result);
        setAssignment(normalizeAssignment(data.assignment));
        setPhase("done");
        // refresh balances + auction with the server's fresh numbers
        try {
          const fresh = await api<TodayData>("/api/doors/today");
          setToday(fresh);
        } catch {
          // keep the pre-game snapshot if the refresh fails
        }
        void loadAuction();
      } else {
        setOffer(null);
        setOpensUntilBanker(typeof data.opensNeeded === "number" && data.opensNeeded > 0 ? data.opensNeeded : 1);
        setPhase("opening");
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const handleBid = async () => {
    const points = Number.parseInt(bidInput, 10);
    if (!Number.isFinite(points) || points <= 0 || busy) return;
    setBusy(true);
    setBidMsg(null);
    try {
      const data = await api<{ ok: boolean; myBid: number; topBid: number; balance: number }>("/api/doors/bid", {
        method: "POST",
        body: JSON.stringify({ points }),
      });
      setAuction((prev) =>
        prev ? { ...prev, myBid: data.myBid, balance: data.balance, topBids: prev.topBids } : prev,
      );
      setBidMsg(t("bidPlaced", { points: data.myBid }));
      playDoorSound("pop");
      void loadAuction();
    } catch (err) {
      setBidMsg(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  // ─── render helpers ───────────────────────────────────────────────

  const renderDoor = (info: DoorInfo, idx: number) => {
    const door = info.door;
    const isKeeper = keeperDoor === door;
    const openedDoor = opened[door];
    const isOpened = !!openedDoor;
    const band = peekedBands[door];
    const isMikeTip = mikeTipDoor === door;
    const clickable =
      !busy &&
      !isOpened &&
      ((phase === "keeper" && !isKeeper) || (phase === "opening" && !isKeeper) || (phase === "opening" && peekMode));
    const onClick = () => {
      if (phase === "keeper") void handleStart(door);
      else if (phase === "opening" && (!isKeeper || peekMode)) void handleOpen(door);
    };
    const bandChipColor =
      band === "jackpot"
        ? "bg-yellow-400 text-yellow-950"
        : band === "high"
          ? "bg-violet-500 text-white"
          : band === "low"
            ? "bg-sky-500 text-white"
            : "bg-zinc-600 text-white";
    return (
      <button
        key={door}
        type="button"
        disabled={!clickable}
        onClick={onClick}
        className={
          "relative overflow-hidden rounded-xl border text-left transition-all min-h-[168px] flex flex-col " +
          (isKeeper ? "border-yellow-300 ring-2 ring-yellow-300/70 " : "border-white/15 ") +
          (isOpened ? "opacity-60 saturate-50 " : "") +
          (clickable ? "hover:scale-[1.02] cursor-pointer " : "cursor-default ")
        }
        style={{ background: DOOR_BACKGROUNDS[info.visual] ?? DOOR_BACKGROUNDS.shoji }}
        aria-label={doorDisplay(door)}
      >
        {info.visual === "torii" ? <div className="h-3.5 w-[112%] -ml-[6%] bg-red-950/80 rounded-sm mt-2 shrink-0" /> : null}
        {info.visual === "shoji" ? (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgba(120,72,20,0.35) 0 2px, transparent 2px 34px), repeating-linear-gradient(0deg, rgba(120,72,20,0.35) 0 2px, transparent 2px 44px)",
            }}
          />
        ) : null}
        {info.visual === "lantern" ? (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(120,53,15,0.25) 0 2px, transparent 2px 26px)" }}
          />
        ) : null}
        {info.visual === "sakura" ? (
          <div className="absolute inset-0 pointer-events-none text-pink-100/70 text-sm leading-none p-2 select-none">✿&nbsp;&nbsp;✿&nbsp;&nbsp;✿</div>
        ) : null}
        <div className="flex-1 grid place-items-center relative">
          <span className="text-5xl font-black text-white/85 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">{KANJI[idx] ?? idx + 1}</span>
        </div>
        <div className="relative px-2.5 pb-2.5 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {doorDisplay(door)}
          </div>
          {isKeeper ? (
            <Badge className="bg-yellow-300 text-yellow-950 border-0 text-[10px]">{t("yourDoor")}</Badge>
          ) : null}
          {isOpened ? (
            <Badge className="bg-black/70 text-white border-0 text-[10px]">
              {openedDoor.prize === 0 ? t("dudLabel") : `${openedDoor.prize} ${t("creditsLabel")}`}
            </Badge>
          ) : null}
          {band && !isOpened ? <Badge className={`${bandChipColor} border-0 text-[10px]`}>{bandLabel(band)}</Badge> : null}
          {isMikeTip && !isOpened ? (
            <Badge className="bg-orange-500 text-white border-0 text-[10px]">
              <Lightbulb className="h-3 w-3 mr-1" /> {t("mikeTipBadge")}
            </Badge>
          ) : null}
        </div>
      </button>
    );
  };

  const lanterns = (
    <div className="flex items-center gap-1.5" aria-label={t("streakLabel")}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            "w-6 h-7 rounded-[45%] grid place-items-center text-[11px] " +
            (streak > i ? "bg-amber-400 text-amber-950 dr-lantern-lit" : "bg-secondary text-muted-foreground")
          }
        >
          <Flame className="h-3.5 w-3.5" />
        </span>
      ))}
      <span className="text-[11px] text-muted-foreground ml-1">{t("streakLabel")}</span>
    </div>
  );

  const prizeBoard = today ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">{t("prizeBoard")}</span>
      {[...today.prizes]
        .sort((a, b) => b - a)
        .map((p) => {
          const alive = remaining.includes(p);
          return (
            <span
              key={p}
              className={
                "rounded-md px-2 py-1 text-xs font-black border " +
                (!alive
                  ? "opacity-35 line-through border-border/50 text-muted-foreground "
                  : p === 805
                    ? "bg-yellow-400/15 border-yellow-400/60 text-yellow-300 " + (remaining.length <= 3 ? "dr-jackpot-alive" : "")
                    : "border-border/70 text-foreground")
              }
            >
              {p === 0 ? t("dudLabel") : p}
            </span>
          );
        })}
      {remaining.includes(805) && remaining.length <= 3 ? (
        <span className="text-[11px] text-yellow-300 font-semibold ml-1">{t("jackpotAlive")}</span>
      ) : null}
    </div>
  ) : null;

  // ─── auction + referral panel (always visible once loaded) ───────

  const auctionPanel = (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> {t("auctionTitle")}
          {auction ? (
            <Badge variant="outline" className="text-[10px] ml-auto">
              {auction.status}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {auction ? (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-base font-black">{auction.prizeLabel}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  {auction.status === "UPCOMING"
                    ? t("auctionOpensIn", { time: fmtDuration(new Date(auction.opensAt).getTime() - now) })
                    : auction.status === "OPEN"
                      ? t("auctionClosesIn", { time: fmtDuration(new Date(auction.closesAt).getTime() - now) })
                      : t("auctionClosedNote")}
                </div>
                {auction.winnerNote ? <p className="text-xs text-primary mt-1">{auction.winnerNote}</p> : null}
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("pointsLabel")}</div>
                <div className="text-xl font-black flex items-center gap-1 justify-end">
                  <Coins className="h-4 w-4 text-primary" /> {auction.balance}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("yourBid")}: {auction.myBid > 0 ? auction.myBid : "—"}
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{t("auctionTopBids")}</div>
              {auction.topBids.length > 0 ? (
                <div className="space-y-1">
                  {auction.topBids.slice(0, 5).map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs rounded-md border border-border/60 px-2.5 py-1.5">
                      <Trophy className={"h-3.5 w-3.5 " + (i === 0 ? "text-yellow-400" : "text-muted-foreground")} />
                      <span className="font-black">{b.points}</span>
                      <span className="text-muted-foreground">{t("pointsLabel")}</span>
                      {b.mine ? (
                        <Badge className="bg-primary/15 text-primary border-0 text-[10px] ml-auto">{t("yourBid")}</Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("auctionNoBids", { min: auction.minNextBid })}</p>
              )}
            </div>

            {auction.status === "OPEN" ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={auction.minNextBid}
                    step={10}
                    value={bidInput}
                    onChange={(e) => setBidInput(e.target.value)}
                    className="text-sm"
                    aria-label={t("bidButton")}
                  />
                  <Button size="sm" onClick={() => void handleBid()} disabled={busy}>
                    {t("bidButton")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("auctionMinNext", { min: auction.minNextBid })}</p>
              </div>
            ) : null}
            {bidMsg ? <p className="text-xs text-primary">{bidMsg}</p> : null}
            <p className="text-[11px] text-muted-foreground">{t("auctionLosersNote")}</p>
          </>
        ) : today?.auction ? (
          <p className="text-xs text-muted-foreground">
            {today.auction.prizeLabel} · {today.auction.status}
          </p>
        ) : null}

        <div className="border-t border-border/60 pt-3 space-y-2.5">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> {t("referralTitle")}
          </div>
          <p className="text-xs text-muted-foreground">{t("referralBody")}</p>
          {referrals ? (
            <div className="flex gap-2">
              <Input readOnly value={referrals.link} className="text-xs" aria-label={t("yourLink")} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(referrals.link).catch(() => {});
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? t("copied") : t("copyLink")}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  // ─── main render ──────────────────────────────────────────────────

  return (
    <section className="space-y-4">
      <style>{DOORS_CSS}</style>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t("subtitle")}</p>
          {today ? (
            <p className="text-[11px] text-muted-foreground mt-1">
              {today.gameDate} · {today.language ?? locale}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {today ? (
            <>
              <Badge variant="outline" className="text-[11px]">
                <Coins className="h-3 w-3 mr-1" /> {today.pointsBalance} {t("pointsLabel")}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                <Zap className="h-3 w-3 mr-1" /> {today.freeGenBalance} {t("freeGensLabel")}
              </Badge>
            </>
          ) : null}
          <Button variant="outline" size="sm" onClick={toggleMute} aria-label={muted ? t("soundOn") : t("soundOff")}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {toasts.length > 0 ? (
        <div className="space-y-1.5">
          {toasts.map((toast) => (
            <div key={toast.id} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold dr-slide-in">
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}

      {phase === "loading" ? <div className="text-sm text-muted-foreground py-8 text-center">{t("loading")}</div> : null}

      {phase === "failed" ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t("loadFailed")}: {error}
        </div>
      ) : null}

      {phase === "already" && today ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("alreadyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("alreadyBody")}</p>
            {today.existingResult ? (
              <p className="text-sm font-semibold">
                {t("alreadyResult", { amount: today.existingResult.amount })}
              </p>
            ) : null}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("todayMemes")}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {today.memes.map((m, i) => (
                  <figure key={i} className="rounded-lg overflow-hidden border border-border/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.imageUrl} alt={m.alt} className="w-full h-24 object-cover" />
                    <figcaption className="text-[10px] text-muted-foreground px-1.5 py-1 truncate">{m.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {phase === "picker" && today ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-black">{t("pickerTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("pickerSubtitle")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {today.callersToday.map((id, i) => {
              const isSelected = selectedCaller === id;
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectCaller(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleSelectCaller(id);
                  }}
                  className={
                    "rounded-2xl border bg-card p-4 space-y-3 cursor-pointer transition-all " +
                    (isSelected ? "border-primary/70 ring-2 ring-primary/40 " : "border-border/60 hover:border-border ")
                  }
                >
                  <div className={"flex justify-center " + (isSelected ? "" : `dr-ring dr-ring-d${i}`)}>
                    <div className="rounded-[1.6rem] border-4 border-zinc-800 bg-zinc-950 px-4 py-4 grid place-items-center shadow-xl">
                      <CallerAvatar caller={id} name={callerName(id)} size={72} />
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <div className="font-black">{callerName(id)}</div>
                    <p className="text-xs text-muted-foreground min-h-8">{t(`callers.${id}.teaser`)}</p>
                    <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{t(`callers.${id}.perk`)}</Badge>
                  </div>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAnswer(id);
                    }}
                  >
                    <PhoneCall className="h-4 w-4 mr-1.5" /> {t("answer")}
                  </Button>
                  {selectedCaller && !isSelected ? (
                    <p className="text-[10px] text-center text-muted-foreground">{t("missedCall")}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {phase === "intro" && caller ? (
        <Card className="dr-slide-in">
          <CardContent className="pt-5">
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <div className="rounded-[1.8rem] border-4 border-zinc-800 bg-zinc-950 px-5 py-5 grid place-items-center shadow-xl shrink-0">
                <CallerAvatar caller={caller} name={callerName(caller)} size={104} />
              </div>
              <div className="space-y-2 text-center sm:text-left">
                <div className="text-lg font-black">{callerName(caller)}</div>
                <p className="text-sm">{t(`callers.${caller}.pitch1`)}</p>
                <p className="text-sm text-muted-foreground">{t(`callers.${caller}.pitch2`)}</p>
                <p className="text-sm text-muted-foreground">{t(`callers.${caller}.pitch3`)}</p>
                <div className="flex gap-2 pt-1 justify-center sm:justify-start">
                  <Button
                    size="sm"
                    onClick={() => {
                      playDoorSound("click");
                      setPhase("keeper");
                    }}
                  >
                    {t("playDoors")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      playDoorSound("click");
                      setPhase("keeper");
                    }}
                  >
                    {t("skipIntro")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {(phase === "keeper" || phase === "opening" || phase === "bankerRing" || phase === "bankerOffer" || phase === "done") && today ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-black">
              {phase === "keeper"
                ? t("pickKeeper")
                : phase === "opening"
                  ? peekMode
                    ? t("peekModeHint")
                    : t("openPrompt")
                  : phase === "done"
                    ? t("revealedMemes")
                    : t("bankerCalling")}
            </h3>
            {lanterns}
          </div>
          {phase === "keeper" ? <p className="text-xs text-muted-foreground -mt-1">{t("keeperHint")}</p> : null}
          {phase === "opening" && !peekMode ? (
            <p className="text-xs text-muted-foreground -mt-1">{t("opensToBanker", { count: opensUntilBanker })}</p>
          ) : null}
          {mikeTipDoor !== null && phase !== "done" ? (
            <p className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" /> {t("mikeTip", { door: doorDisplay(mikeTipDoor) })}
            </p>
          ) : null}
          {prizeBoard}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {today.doors.map((info, idx) => renderDoor(info, idx))}
          </div>

          {phase === "opening" ? (
            <div className="rounded-xl border border-border/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold">{t("callItTitle")}</span>
                {peeksBanked > 0 ? (
                  <Button
                    size="sm"
                    variant={peekMode ? "default" : "outline"}
                    onClick={() => {
                      playDoorSound("click");
                      setPeekMode((prev) => !prev);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> {peekMode ? t("peekCancel") : t("peekButton", { count: peeksBanked })}
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={selectedCall === "low" ? "default" : "outline"}
                  onClick={() => {
                    playDoorSound("click");
                    setSelectedCall(selectedCall === "low" ? null : "low");
                  }}
                >
                  {t("callLow")}
                </Button>
                <Button
                  size="sm"
                  variant={selectedCall === "high" ? "default" : "outline"}
                  onClick={() => {
                    playDoorSound("click");
                    setSelectedCall(selectedCall === "high" ? null : "high");
                  }}
                >
                  {t("callHigh")}
                </Button>
              </div>
              {peekMode ? <p className="text-[11px] text-primary">{t("peekModeHint")}</p> : null}
            </div>
          ) : null}

          {phase === "bankerRing" ? (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 flex flex-col sm:flex-row items-center gap-4 dr-slide-in">
              <div className="w-16 h-24 rounded-xl bg-zinc-900 border-2 border-zinc-700 grid place-items-center dr-ring">
                <PhoneCall className="h-6 w-6 text-red-400" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">{t("bankerCalling")}</div>
                <div className="text-xl font-black text-white">{t("bankerName")}</div>
              </div>
              <Button onClick={() => void handleAnswerBanker()} disabled={busy}>
                <PhoneCall className="h-4 w-4 mr-1.5" /> {t("bankerAnswer")}
              </Button>
            </div>
          ) : null}

          {phase === "bankerOffer" && offer ? (
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 space-y-3 dr-slide-in">
              <div className="text-center space-y-1">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                  {t("bankerName")} · {t("offerLabel")}
                </div>
                <div className="text-4xl font-black text-white">
                  {offer.amount} <span className="text-base font-semibold text-zinc-400">{t("creditsLabel")}</span>
                </div>
                <p className="text-sm text-zinc-300 italic">“{offer.bankerLine}”</p>
                {typeof offer.chaosFactor === "number" ? (
                  <p className="text-[11px] text-violet-300">{t("chaosNote", { factor: offer.chaosFactor })}</p>
                ) : null}
                {offer.sweatApplied ? <p className="text-[11px] text-amber-300 font-semibold">{t("sweatApplied")}</p> : null}
              </div>

              {offer.round === 2 && !readBand ? (
                <div className="rounded-xl border border-white/10 p-3 space-y-2">
                  <div className="text-xs font-semibold text-white">{t("readTitle")}</div>
                  <p className="text-[11px] text-zinc-400">{t("readHint")}</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["dud", "low", "high", "jackpot"] as Band[]).map((b) => (
                      <Button key={b} size="sm" variant="outline" disabled={busy} onClick={() => void handleRead(b)}>
                        {bandLabel(b)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {offer.round === 2 && readBand ? (
                <p className="text-xs text-center text-primary font-semibold">{t("readLocked", { band: bandLabel(readBand) })}</p>
              ) : null}

              <div className="flex gap-2 justify-center">
                <Button size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black" disabled={busy} onClick={() => void handleDecide("deal")}>
                  {t("deal")}
                </Button>
                <Button size="lg" variant="destructive" className="font-black" disabled={busy} onClick={() => void handleDecide("no_deal")}>
                  {t("noDeal")}
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "done" && result ? (
            <Card className="dr-slide-in">
              <CardContent className="pt-5 space-y-3">
                <div className="text-center space-y-1">
                  <div className="text-2xl font-black">
                    {result.type === "deal"
                      ? t("resultDealTitle")
                      : result.amount >= 805
                        ? t("resultJackpotTitle")
                        : result.amount === 0
                          ? t("resultDudTitle")
                          : t("resultKeeperTitle")}
                  </div>
                  <div className="text-lg font-bold">
                    {result.amount} {t("creditsLabel")}
                  </div>
                  {result.type === "deal" && keeperDoor !== null && assignment ? (
                    <p className="text-sm text-muted-foreground">
                      {t("soldLine", { amount: result.amount, held: assignment[keeperDoor] ?? 0 })}
                    </p>
                  ) : null}
                  {result.type === "deal" && keeperDoor !== null && assignment && typeof assignment[keeperDoor] === "number" ? (
                    result.amount > assignment[keeperDoor] ? (
                      <p className="text-sm font-semibold text-emerald-400">{t("beatBanker", { amount: result.amount - assignment[keeperDoor] })}</p>
                    ) : result.amount < assignment[keeperDoor] ? (
                      <p className="text-sm font-semibold text-red-400">{t("bankerBeatYou", { amount: assignment[keeperDoor] - result.amount })}</p>
                    ) : null
                  ) : null}
                  {result.type !== "deal" && keeperDoor !== null ? (
                    <p className="text-sm text-muted-foreground">{t("heldLine", { amount: result.amount })}</p>
                  ) : null}
                  {result.bonusCredits && result.bonusCredits > 0 ? (
                    <p className="text-sm font-semibold text-primary">{t("resultBonus", { amount: result.bonusCredits })}</p>
                  ) : null}
                  {result.gensAwarded && result.gensAwarded > 0 ? (
                    <p className="text-sm font-semibold text-primary">
                      {t("resultGens", { count: result.gensAwarded, balance: today.freeGenBalance })}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("revealedMemes")}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {Object.entries(opened)
                      .map(([door, o]) => ({ door: Number(door), ...o }))
                      .concat(
                        keeperDoor !== null && assignment && today.memes.find((m) => m.door === keeperDoor)
                          ? [
                              {
                                door: keeperDoor,
                                prize: assignment[keeperDoor] ?? 0,
                                meme: today.memes.find((m) => m.door === keeperDoor)!,
                                reaction: "",
                              },
                            ]
                          : [],
                      )
                      .map((o) => (
                        <figure key={o.door} className="rounded-lg overflow-hidden border border-border/60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={o.meme.imageUrl} alt={o.meme.alt} className="w-full h-24 object-cover" />
                          <figcaption className="text-[10px] text-muted-foreground px-1.5 py-1 flex justify-between gap-1">
                            <span className="truncate">{o.meme.caption}</span>
                            <span className="font-black text-foreground">{o.prize === 0 ? t("dudLabel") : o.prize}</span>
                          </figcaption>
                        </figure>
                      ))}
                  </div>
                </div>

                {assignment ? (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{t("assignmentTitle")}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {Object.entries(assignment)
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([door, prize]) => (
                          <div key={door} className="rounded-lg border border-border/60 px-2.5 py-2 text-center">
                            <div className="text-[10px] text-muted-foreground">{doorDisplay(Number(door))}</div>
                            <div className="text-sm font-black">{prize === 0 ? t("dudLabel") : prize}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-muted-foreground text-center">{t("backTomorrow")}</p>
              </CardContent>
            </Card>
          ) : null}

          {commitmentHash ? (
            <p className="text-[11px] text-muted-foreground font-mono break-all">
              {t("commitmentLabel")}: {commitmentHash.slice(0, 16)}…
            </p>
          ) : null}
        </div>
      ) : null}

      {reveal ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 space-y-3 dr-slide-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{doorDisplay(reveal.door)}</div>
                <div
                  className={
                    "text-3xl font-black " +
                    (reveal.prize >= 805 ? "text-yellow-300" : reveal.prize === 0 ? "text-red-400" : "")
                  }
                >
                  {reveal.prize === 0 ? t("dudLabel") : `${reveal.prize} ${t("creditsLabel")}`}
                </div>
              </div>
              {lanterns}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reveal.meme.imageUrl} alt={reveal.meme.alt} className="w-full rounded-xl border border-border/60 object-cover max-h-72" />
            <p className="text-xs text-muted-foreground">{reveal.meme.caption}</p>
            {reveal.reaction ? <p className="text-sm italic">“{reveal.reaction}”</p> : null}
            {reveal.callResult ? (
              <p className={"text-xs font-semibold " + (reveal.callResult.correct ? "text-emerald-400" : "text-red-400")}>
                {reveal.callResult.correct ? t("callCorrect") : t("callWrong")}
              </p>
            ) : null}
            <Button className="w-full" onClick={closeReveal}>
              {t("continueGame")}
            </Button>
          </div>
        </div>
      ) : null}

      {phase !== "loading" && phase !== "failed" ? auctionPanel : null}
    </section>
  );
}
