// Seed the gate-check users (+ optionally the gate row) into the temp DB.
//   node seed-gate.mjs          → operator + member users only
//   GATE_ON=1 node seed-gate.mjs → also writes AppSetting site:gate = "on"
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
await db.user.upsert({
  where: { id: "gate-op" },
  create: {
    id: "gate-op",
    whopId: "user_gateop123",
    whopUsername: "gateop",
    email: "gateop@example.com",
    name: "Gate Operator",
    plan: "PRO",
    planSource: "whop_membership",
  },
  update: {},
});
await db.user.upsert({
  where: { id: "gate-member" },
  create: {
    id: "gate-member",
    whopId: "user_gatemember1",
    whopUsername: "gatemember",
    email: "gatemember@example.com",
    name: "Gate Member",
    plan: "PRO",
    planSource: "whop_membership",
  },
  update: {},
});
if (process.env.GATE_ON === "1") {
  await db.appSetting.upsert({
    where: { key: "site:gate" },
    create: { key: "site:gate", value: "on" },
    update: { value: "on" },
  });
  console.log("seeded + gate ON");
} else {
  console.log("seeded (no gate row)");
}
await db.$disconnect();
