import type { ReactNode } from "react";

/**
 * Beveled phone frame for agent/Space demos (Dave, 2026-11-24:
 * "display the agent demo in beveled phones"). A metallic beveled
 * edge, black bezel, dynamic island, and side buttons around a
 * portrait screen; the demo media (video or screenshot) fills the
 * screen with object-cover. Pure presentational server component —
 * size it from the parent via className (e.g. "max-w-[300px]").
 */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[300px] ${className}`} data-phone-frame>
      {/* side buttons */}
      <div aria-hidden className="absolute -left-[2.5px] top-24 z-0 h-10 w-[3px] rounded-l-md bg-zinc-400" />
      <div aria-hidden className="absolute -left-[2.5px] top-40 z-0 h-14 w-[3px] rounded-l-md bg-zinc-400" />
      <div aria-hidden className="absolute -right-[2.5px] top-32 z-0 h-20 w-[3px] rounded-r-md bg-zinc-400" />
      {/* beveled metallic edge */}
      <div className="relative rounded-[3.2rem] bg-gradient-to-b from-zinc-200 via-zinc-500 to-zinc-300 p-[3px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]">
        {/* bezel */}
        <div className="rounded-[3rem] bg-black p-[10px] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.07)]">
          {/* screen */}
          <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.35rem] bg-zinc-900">
            {/* dynamic island */}
            <div aria-hidden className="absolute left-1/2 top-2.5 z-10 h-[22px] w-24 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10" />
            <div className="absolute inset-0 [&>*]:h-full [&>*]:w-full [&>*]:object-cover">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
