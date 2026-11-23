import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function grantPack(userId: string, externalId: string, amount: number): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      await tx.creditGrant.create({ data: { userId, source: "pack", externalId, amount } });
      await tx.user.update({ where: { id: userId }, data: { freeGenBalance: { increment: amount } } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
