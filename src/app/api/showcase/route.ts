import { z } from "zod";

const origin = "https://bot.plunderandriffle.com";
const itemSchema = z.object({
  id: z.string().min(1),
  pageUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.origin === origin && /^\/m\/[^/]+\/?$/.test(url.pathname);
  }),
  title: z.string().min(1),
  format: z.string().min(1),
  handle: z.string().nullish(),
  // The live feed emits epoch milliseconds (number); normalize to the
  // ISO string the phone component renders.
  createdAt: z
    .union([z.number(), z.string()])
    .transform((value) => new Date(value).toISOString())
    .refine((value) => Number.isFinite(Date.parse(value))),
  pinned: z.boolean(),
});
const feedSchema = z.object({ success: z.literal(true), version: z.literal(1), items: z.array(z.unknown()) });

let lastGoodItems: z.infer<typeof itemSchema>[] = [];

export async function GET() {
  try {
    const response = await fetch(`${origin}/api/showcase/feed?limit=12`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const feed = feedSchema.safeParse(await response.json());
      if (feed.success) {
        const items = feed.data.items.slice(0, 12).flatMap((item) => {
          const parsed = itemSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        });
        if (items.length > 0) lastGoodItems = items;
      }
    }
  } catch {
    return Response.json({ items: lastGoodItems });
  }

  return Response.json({ items: lastGoodItems });
}
