"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type ShowcaseItem = {
  id: string;
  pageUrl: string;
  title: string;
  format: string;
  handle?: string | null;
  createdAt: string;
};

const rotationMs = 12_000;
const fadeMs = 400;
const refreshMs = 60_000;
const motionQuery = "(prefers-reduced-motion: reduce)";
const getReducedMotion = () => window.matchMedia(motionQuery).matches;
const getHidden = () => document.hidden;
const getServerSnapshot = () => true;

function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function subscribeToVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function relativeTime(createdAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} d ago`;
}

export function ShowcasePhone() {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [now, setNow] = useState(0);
  const [selection, setSelection] = useState<{ currentId: string; outgoingId: string | null } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, getReducedMotion, getServerSnapshot);
  const hidden = useSyncExternalStore(subscribeToVisibility, getHidden, getServerSnapshot);
  const progressBar = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);

  const currentIndex = reducedMotion ? 0 : Math.max(0, items.findIndex((item) => item.id === selection?.currentId));
  const current = items[currentIndex];
  const currentId = current?.id;
  const canRotate = !reducedMotion && items.length > 1;
  const next = canRotate ? items[(currentIndex + 1) % items.length] : undefined;
  const nextId = next?.id;
  const outgoingId = canRotate && selection?.currentId === currentId ? selection?.outgoingId : null;
  const outgoing = items.find((item) => item.id === outgoingId);
  const frames = current ? [current, outgoing ?? next]
    .filter((item): item is ShowcaseItem => item !== undefined && (item === current || item.id !== currentId))
    .sort((left, right) => left.id.localeCompare(right.id)) : [];
  const isPlaying = canRotate && !hovered && !pressed && !focused && !hidden && !paused;

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    async function refresh() {
      setNow(Date.now());
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/showcase", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const feed: { items: ShowcaseItem[] } = await response.json();
        if (!controller.signal.aborted && feed.items.length > 0) setItems(feed.items);
      } catch {
        return;
      } finally {
        pending = false;
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, refreshMs);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [pressed]);

  useEffect(() => {
    if (!outgoingId) return;
    const timer = window.setTimeout(() => {
      setSelection((previous) => previous?.currentId === currentId && previous?.outgoingId === outgoingId
        ? { ...previous, outgoingId: null }
        : previous);
    }, fadeMs);
    return () => window.clearTimeout(timer);
  }, [currentId, outgoingId]);

  useEffect(() => {
    if (!currentId || !nextId || !progressBar.current) return;
    const progress = progressBar.current.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: rotationMs, fill: "forwards" },
    );
    progress.pause();
    progress.onfinish = () => setSelection({ currentId: nextId, outgoingId: currentId });
    animation.current = progress;
    return () => {
      progress.cancel();
      animation.current = null;
    };
  }, [currentId, nextId]);

  useEffect(() => {
    if (isPlaying) animation.current?.play();
    else animation.current?.pause();
  }, [currentId, nextId, isPlaying]);

  return (
    <div className="relative isolate mx-auto w-full max-w-[21rem] px-1" style={{ perspective: 1200 }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-12%] inset-y-[5%] -z-10 rounded-[50%] bg-primary/16 blur-[65px]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[-10%] -bottom-5 -z-10 h-12 rounded-[50%] bg-black blur-xl" />

      <div
        role="region"
        aria-label="Showcase from the Telegram bot"
        onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={() => setPressed(true)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        className="relative rounded-[2.9rem] bg-[linear-gradient(135deg,#77777c_0%,#252529_22%,#151518_67%,#55555c_100%)] p-[9px] shadow-[inset_0_0_0_1px_#797982,inset_0_0_0_4px_#27272c,inset_0_0_0_5px_#41414a,0_28px_70px_-24px_#000] motion-safe:transform-[rotateX(2deg)_rotateY(-5deg)_rotateZ(1deg)] motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:hover:transform-none motion-safe:focus-within:transform-none"
      >
        <div aria-hidden="true" className="absolute top-23 -left-0.5 h-6 w-[3px] rounded-l bg-linear-to-b from-zinc-500 to-zinc-800" />
        <div aria-hidden="true" className="absolute top-34 -left-0.5 h-13 w-[3px] rounded-l bg-linear-to-b from-zinc-500 to-zinc-800" />
        <div aria-hidden="true" className="absolute top-30 -right-0.5 h-14 w-[3px] rounded-r bg-linear-to-b from-zinc-500 to-zinc-800" />

        <div className="relative overflow-hidden rounded-[2.35rem] bg-zinc-950 ring-1 ring-black">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(145deg,white_0%,transparent_40%)] opacity-[0.07]" />
          <div aria-hidden="true" className="mx-auto mt-2.5 flex h-5 w-22 items-center justify-end rounded-full bg-black pr-2.5 ring-1 ring-white/8">
            <span className="size-1.5 rounded-full bg-zinc-800 shadow-[inset_0_0_0_1px_#3f3f46]" />
          </div>

          <div className="flex h-8 items-center justify-between gap-2 px-4 font-mono text-[10px] font-semibold tracking-wide">
            <span className="flex items-center gap-2" translate="no">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] motion-safe:animate-pulse" />
              <span><span className="text-primary">LIVE</span> · @thewhoppbot</span>
            </span>
            {current ? <span className="text-zinc-400 tabular-nums">{currentIndex + 1} / {items.length}</span> : null}
          </div>

          <div className="relative isolate aspect-[4/5] overflow-hidden border-y border-white/10 bg-zinc-900">
            {current ? frames.map((item) => {
              const active = item.id === currentId;
              return (
                <iframe
                  key={item.id}
                  src={item.pageUrl}
                  title={item.title}
                  tabIndex={-1}
                  aria-hidden={!active}
                  sandbox="allow-scripts allow-same-origin"
                  allow="autoplay"
                  referrerPolicy="no-referrer"
                  className={`pointer-events-none absolute inset-0 h-full w-full border-0 bg-zinc-900 motion-safe:transition-opacity motion-safe:duration-[400ms] ${active ? "z-10 opacity-100 motion-safe:starting:opacity-0" : item.id === outgoingId ? "opacity-100" : "opacity-0"}`}
                />
              );
            }) : (
              <div className="flex h-full flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)] px-5 text-center">
                <span translate="no" className="font-mono text-[10px] font-semibold tracking-[0.2em] text-primary">PLUNDER &amp; RIFFLE</span>
                <p className="max-w-52 text-2xl leading-tight font-bold tracking-tight text-balance text-zinc-50">The next generation lands here</p>
                <a href="https://t.me/thewhoppbot" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 touch-manipulation items-center rounded-full border border-white/20 px-4 text-xs font-semibold text-zinc-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Generate in the bot <span aria-hidden="true" className="ml-1.5">↗</span>
                </a>
              </div>
            )}
          </div>

          {current ? (
            <div className="relative pb-2">
              <div className="px-4 pt-3 pb-2">
                <p className="line-clamp-2 min-h-10 text-sm leading-5 font-bold wrap-anywhere text-zinc-50">{current.title}</p>
                <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-zinc-400">
                  <span className="max-w-24 shrink-0 truncate rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">{current.format}</span>
                  {current.handle ? <span className="truncate" translate="no">@{current.handle.replace(/^@+/, "")}</span> : null}
                  <time dateTime={current.createdAt} className="ml-auto shrink-0">{relativeTime(current.createdAt, now)}</time>
                </div>
              </div>
              {canRotate ? (
                <>
                  <div aria-hidden="true" className="mx-4 mt-1 h-0.5 overflow-hidden rounded-full bg-white/10">
                    <div ref={progressBar} className="h-full origin-left scale-x-0 bg-primary" />
                  </div>
                  <div className="flex flex-wrap justify-center px-1" role="group" aria-label="Choose a generation">
                    {items.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Show generation ${index + 1}: ${item.title}`}
                        aria-current={index === currentIndex ? "true" : undefined}
                        onClick={() => { if (item.id !== currentId) setSelection({ currentId: item.id, outgoingId: currentId ?? null }); }}
                        className="grid h-8 w-6 touch-manipulation place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      >
                        <span aria-hidden="true" className={`h-1.5 rounded-full ${index === currentIndex ? "w-3 bg-primary" : "w-1.5 bg-zinc-500"}`} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaused((previous) => !previous)}
                    className="mx-auto flex min-h-8 touch-manipulation items-center rounded-full px-2 font-mono text-[10px] text-zinc-400 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {paused ? "Resume rotation" : "Pause rotation"}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <p className="px-4 py-4 text-center font-mono text-[10px] tracking-wide text-zinc-400">WAITING FOR THE NEXT PACK</p>
          )}
          <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-20 rounded-full bg-white/25" />
        </div>
      </div>
    </div>
  );
}
