// Seed the E2E user + brand into the temp DB via the app's Prisma client.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
await db.user.upsert({
  where: { id: "e2e-user" },
  create: {
    id: "e2e-user",
    whopId: "user_e2e12345",
    email: "e2e@example.com",
    name: "E2E Member",
    plan: "CREATOR",
    planSource: "whop_membership",
  },
  update: {},
});
await db.brandProfile.create({
  data: { userId: "e2e-user", name: "E2E Biz", website: "https://example.com" },
}).catch(() => undefined);
console.log("seeded");
await db.$disconnect();
