/** True when a URL points at a directly playable video file. */
export function isVideoFileUrl(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|webm|mov|m4v)([?#].*)?$/i.test(url));
}
