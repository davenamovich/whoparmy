// ─── PREVIEW SEED: demo agents for the /agents marketplace ─────────
// Run (against a SCRATCH database only):
//   DATABASE_URL="file:/tmp/whoparmy-preview/dev.db" bun scripts/apply-schema.ts
//   DATABASE_URL="file:/tmp/whoparmy-preview/dev.db" bun --conditions=react-server scripts/agents-preview/seed.ts
//
// Fills a throwaway DB with eight public agents, their rotators,
// counted (and some filtered) hops over the last 7 days, and
// placements in tonight's spot window, so the marketplace, profile
// pages, sparklines, live feed and spot board have something to draw.
// Refuses to run unless DATABASE_URL is a local file whose path says
// "preview", "scratch", "smoke" or "tmp"/"temp" — it never touches a
// real database. Re-running wipes and re-seeds only its own rows.
import type { Prisma } from "@prisma/client";
import { db } from "../../src/lib/db";
import { placementDateForSpotWindow, spotWindowFor } from "../../src/lib/rotator-market";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:") || !/(preview|scratch|smoke|tmp|temp)/i.test(url)) {
  console.error(`Refusing to seed: DATABASE_URL must be a scratch file (got "${url || "unset"}").`);
  process.exit(1);
}

const MARK = "@agents-preview.test";

const AGENTS = [
  { name: "BTC Barry", cat: "Marketing", desc: "Runs The BTC Experiment funnel — memes, hooks and a nightly recap for crypto-curious buyers.", caps: ["Memes", "Hooks", "Daily recap", "Telegram"], hops: 46, used: 7, age: 12 },
  { name: "Nova Leads", cat: "Business", desc: "Finds local service businesses with weak sites and pitches them a 30-second before/after.", caps: ["Lead research", "Cold pitch", "Before/after"], hops: 31, used: 5, age: 9 },
  { name: "Clip Corsair", cat: "Content", desc: "Cuts long podcasts into captioned vertical clips and queues them for your approval.", caps: ["Short video", "Captions", "Scheduling", "Hooks"], hops: 24, used: 4, age: 6 },
  { name: "Quill", cat: "Creative", desc: "Writes landing-page copy in your voice and A/B tests two headlines a day.", caps: ["Copywriting", "A/B tests"], hops: 17, used: 3, age: 5 },
  { name: "Ledger Lou", cat: "Finance", desc: "Turns your Stripe export into a plain-English weekly money note.", caps: ["Reports", "Stripe", "Summaries"], hops: 9, used: 2, age: 4 },
  { name: "Scout Nine", cat: "Research", desc: "Watches five competitors and tells you what changed on their pages this week.", caps: ["Monitoring", "Diffs", "Weekly brief"], hops: 6, used: 1, age: 3 },
  { name: "Meme Mate", cat: "Marketing", desc: "Daily on-brand memes in 23 languages; nothing posts without your yes.", caps: ["Memes", "Translation", "Approvals"], hops: 3, used: 0, age: 2 },
  { name: "Harbor Bot", cat: "Automation", desc: "Answers your Whop community's FAQs at 3 a.m. and flags anything it can't.", caps: ["Support", "Whop", "Escalation"], hops: 0, used: 0, age: 1, paused: true },
];

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const now = new Date();
  // Wipe this script's own rows (cascade drops agents, rotators, placements).
  const old = await db.user.findMany({ where: { email: { endsWith: MARK } }, select: { id: true } });
  if (old.length) {
    const ids = old.map((u) => u.id);
    await db.rotatorHop.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }

  const placementDate = placementDateForSpotWindow(spotWindowFor(now).key);
  let seq = 0;
  for (const a of AGENTS) {
    const slug = slugOf(a.name);
    const user = await db.user.create({
      data: { email: `${slug}${MARK}`, name: `${a.name.split(" ")[0]}'s owner`, whopUsername: `${slug}-owner` },
    });
    const agent = await db.hiredAgent.create({
      data: {
        userId: user.id,
        templateKey: "custom",
        name: a.name,
        tokenBudget: 100_000,
        status: a.paused ? "PAUSED" : "ACTIVE",
        slug,
        publicProfile: true,
        description: a.desc,
        category: a.cat,
        capabilitiesJson: JSON.stringify(a.caps),
        createdAt: new Date(now.getTime() - a.age * 86_400_000),
      },
    });
    const rotator = await db.agentRotator.create({ data: { agentId: agent.id, userId: user.id } });

    // Counted hops spread over the last 7 days, weighted toward recent days,
    // plus a few filtered ones that must never show up anywhere.
    const hops: Prisma.RotatorHopCreateManyInput[] = [];
    for (let i = 0; i < a.hops; i++) {
      const daysAgo = Math.floor(Math.pow(((i * 7919) % 1000) / 1000, 1.6) * 7);
      const ts = new Date(now.getTime() - daysAgo * 86_400_000 - ((i * 104_729) % 80_000_000));
      hops.push({
        ts: ts > now ? now : ts,
        surface: i % 3 === 0 ? "ALLOCATOR" : "AGENT",
        rotatorId: rotator.id,
        agentId: agent.id,
        userId: user.id,
        code: `seed-${seq++}`,
        counted: true,
      });
    }
    for (let i = 0; i < 3; i++) {
      hops.push({ ts: now, surface: "AGENT", rotatorId: rotator.id, agentId: agent.id, userId: user.id, code: `seed-f-${seq++}`, counted: false, filtered: true, filterReason: "bot-ua" });
    }
    if (hops.length) await db.rotatorHop.createMany({ data: hops });

    // Placements in tonight's window fill this agent's spots.
    for (let i = 0; i < a.used; i++) {
      await db.rotatorPlacement.create({
        data: { userId: user.id, partner: `preview_partner_${i}`, date: placementDate, url: "https://example.com" },
      });
    }
    console.log(`seeded ${a.name.padEnd(12)} /agent/${slug}  hops=${a.hops} spotsUsed=${a.used}`);
  }
  // One fresh serve so the live feed has a "just now" row.
  const barry = await db.agentRotator.findFirst({ where: { agent: { slug: "btc-barry" } } });
  if (barry) {
    await db.rotatorHop.create({
      data: { surface: "AGENT", rotatorId: barry.id, agentId: barry.agentId, userId: barry.userId, code: `seed-now-${seq++}`, counted: true },
    });
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
