export const FREE_DAY_SOURCE = "free_day";
export const FREE_DAY_BILLBOARD = "town-free-day";

export function isExcludedFreeDaySpace(...names: Array<string | null>) {
  return names.some((name) => name?.toLowerCase().replace(/[^a-z0-9]/g, "").includes("seniormoveplanner"));
}

export function pickFreeDaySpace<T extends { id: string; slug: string }>(spaces: T[], lastFeatured: Map<string, string>, date: string): T | undefined {
  const last = (space: T) => lastFeatured.get(space.id) ?? "";
  const ordered = [...spaces].sort((left, right) => {
    if (last(left) !== last(right)) return last(left) < last(right) ? -1 : 1;
    return left.slug < right.slug ? -1 : left.slug === right.slug ? 0 : 1;
  });
  if (!ordered.length) return undefined;
  const oldest = ordered.filter((space) => last(space) === last(ordered[0]));
  const dayNumber = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  return oldest[((dayNumber % oldest.length) + oldest.length) % oldest.length];
}

export function freeDayClaimKey(mode: string, spaceId: string, date: string) {
  return mode === "HOUSE" ? `space:${spaceId}` : `visit:${spaceId}:${date}`;
}

export function freeDayTickerEvent(row: { name: string; createdAt: Date }, kind: string) {
  const text = kind === "HOUSE" ? `Free Plot opened: ${row.name}`
    : kind === "HANDOUT" ? `Handout opened: ${row.name}`
    : kind === "VISIT" ? `Handout visit booked: ${row.name}`
    : kind === "CREDIT" ? `Free-Day rotator credit claimed: ${row.name}`
    : `Free-Day kit claimed: ${row.name}`;
  return { ts: row.createdAt, kind: "free_day", text };
}
