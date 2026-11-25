import type { Prisma } from "@prisma/client";

export async function resolveHouseUserId(store: Prisma.TransactionClient): Promise<string | null> {
  const direct = process.env.HOUSE_BIND_USER_ID?.trim();
  if (direct) return (await store.user.findUnique({ where: { id: direct }, select: { id: true } }))?.id ?? null;
  const whopId = process.env.OPERATOR_WHOP_IDS?.split(",").map((value) => value.trim()).find(Boolean);
  if (whopId) {
    const user = await store.user.findUnique({ where: { whopId }, select: { id: true } });
    if (user) return user.id;
  }
  const username = process.env.OPERATOR_WHOP_USERNAMES?.split(",").map((value) => value.trim().toLowerCase()).find(Boolean);
  if (!username) return null;
  const users = await store.user.findMany({ where: { whopUsername: { not: null } }, orderBy: { id: "asc" }, select: { id: true, whopUsername: true } });
  return users.find((user) => user.whopUsername?.toLowerCase() === username)?.id ?? null;
}
