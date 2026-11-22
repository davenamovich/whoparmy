import { generatedAvatar } from "@/lib/agent-visual";

/**
 * Agent avatar: the owner's uploaded image when there is one,
 * otherwise a generated tile (warm gradient + mirrored 5×5 pattern
 * seeded from the slug) so every card in the grid has a face.
 */
export function AgentAvatar({
  seed,
  name,
  src,
  size = 48,
  className = "",
}: {
  seed: string;
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const radius = Math.round(size * 0.28);
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const avatar = generatedAvatar(seed, name);
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: radius, background: avatar.background }}
    >
      <span className="absolute inset-[14%] grid grid-cols-5 grid-rows-5 gap-[6%] opacity-25">
        {avatar.cells.map((on, i) => (
          <span key={i} className={on ? "rounded-[2px] bg-white" : ""} />
        ))}
      </span>
      <span className="relative font-black text-white drop-shadow-sm" style={{ fontSize: size * 0.42 }}>
        {avatar.initial}
      </span>
    </span>
  );
}
