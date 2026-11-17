"use client";

// Client-side export helpers: classic meme compositing on canvas,
// text file downloads and clipboard copy.

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for restricted contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

/** Compose a classic meme (image + impact-style captions) and download it. */
export async function downloadMeme(opts: {
  imageUrl: string;
  assetId?: string;
  topText?: string | null;
  bottomText?: string | null;
  filename: string;
}) {
  // Remote (engine-hosted) images send no CORS headers, so the canvas
  // compositor cannot load them cross-origin. Route those through the
  // same-origin asset image proxy instead.
  const src =
    opts.assetId && opts.imageUrl.startsWith("http")
      ? `/api/assets/${opts.assetId}/image`
      : opts.imageUrl;
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.drawImage(img, 0, 0);

  const fontSize = Math.round(canvas.width * 0.072);
  ctx.font = `800 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const maxWidth = canvas.width * 0.92;
  const margin = canvas.width * 0.035;

  const drawBlock = (text: string, position: "top" | "bottom") => {
    const lines = wrapText(ctx, text.toUpperCase(), maxWidth);
    const lineHeight = fontSize * 1.12;
    const strokeW = Math.max(2, fontSize * 0.09);
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";

    if (position === "top") {
      lines.forEach((line, i) => {
        const y = margin + fontSize * 0.85 + i * lineHeight;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillText(line, canvas.width / 2, y);
      });
    } else {
      lines.forEach((line, i) => {
        const y = canvas.height - margin - (lines.length - 1 - i) * lineHeight;
        ctx.strokeText(line, canvas.width / 2, y);
        ctx.fillText(line, canvas.width / 2, y);
      });
    }
  };

  if (opts.topText) drawBlock(opts.topText, "top");
  if (opts.bottomText) drawBlock(opts.bottomText, "bottom");

  const url = canvas.toDataURL("image/png");
  triggerDownload(url, opts.filename);
}

export function safeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "content";
}
