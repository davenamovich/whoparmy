import { NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOUSE_PERSON, mnemosExport, mnemosPersonFor } from "@/lib/mnemos-bridge";
import { getSessionOperator } from "@/lib/site-gate";
import type { ResearchSummary } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/memory/export — one-click memory export (Dave,
 * 2026-11-18). Members own their memory: this downloads everything
 * the house store holds for them (their Mnemos scope), plus their
 * brand profiles and research findings, as ONE Obsidian-ready
 * markdown file. It's the ownership promise made literal — and the
 * bridge to their own stack: the same file seeds a member-owned
 * Mnemos later.
 */
export async function GET() {
  const user = await getWhopUser();
  const person = mnemosPersonFor(user.id);
  // Designated-operator sessions also export the house scope, as its
  // own labeled section (Dave's order, 2026-11-18: operators see
  // house memory). Real sessions only — the anonymous operator
  // fallback does not pass getSessionOperator.
  const operator = await getSessionOperator().catch(() => null);
  const [facts, brands, houseFactsRaw] = await Promise.all([
    mnemosExport(person).catch(() => [] as string[]),
    db.brandProfile.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }).catch(() => []),
    operator ? mnemosExport(HOUSE_PERSON).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);
  const memberKeys = new Set(facts.map((f) => f.toLowerCase().replace(/\s+/g, " ").slice(0, 140)));
  const houseFacts = houseFactsRaw.filter((f) => !memberKeys.has(f.toLowerCase().replace(/\s+/g, " ").slice(0, 140)));

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "---",
    "source: Plunder & Riffle — memory export",
    `exported: ${today}`,
    `account: ${user.name ?? user.email ?? user.id}`,
    "---",
    "",
    "# My memory — everything my agents hold on my business",
    "",
    "This file is yours. Drop it into Obsidian, keep it in git, or hand it to any",
    "agent to bring them up to speed on your business. Exported from your",
    "Plunder & Riffle memory on " + today + ".",
    "",
    `## What your agents remember (${facts.length})`,
    "",
  ];
  if (facts.length === 0) {
    lines.push("_Nothing yet — tell Ralph about your business and it lands here._", "");
  } else {
    for (const f of facts) lines.push(`- ${f}`);
    lines.push("");
  }

  if (operator) {
    lines.push(`## House memory — operator scope (${houseFacts.length})`, "");
    if (houseFacts.length === 0) {
      lines.push("_Nothing recalled from the house scope._", "");
    } else {
      for (const f of houseFacts) lines.push(`- ${f}`);
      lines.push("");
    }
  }

  if (brands.length > 0) {
    lines.push("## Your brands and research", "");
    for (const b of brands) {
      lines.push(`### ${b.name}${b.website ? ` — ${b.website}` : ""}`, "");
      if (b.description) lines.push(b.description, "");
      if (b.audience) lines.push(`**Audience:** ${b.audience}`, "");
      if (b.products) lines.push(`**Products/services:** ${b.products}`, "");
      if (b.cta) lines.push(`**Call to action:** ${b.cta}`, "");
      if (b.researchJson) {
        try {
          const r = JSON.parse(b.researchJson) as ResearchSummary;
          if (r.analysisSummary) lines.push(`**Research summary:** ${r.analysisSummary}`, "");
          if (r.offer) lines.push(`**Offer:** ${r.offer}`, "");
          if (r.pains?.length) lines.push("**Customer pains:**", ...r.pains.map((p) => `- ${p}`), "");
          if (r.angles?.length) lines.push("**Content angles:**", ...r.angles.map((a) => `- ${a}`), "");
          if (r.competitors?.length) lines.push(`**Competitors:** ${r.competitors.join(", ")}`, "");
        } catch {
          // researchJson is best-effort in the export; a bad blob skips its section
        }
      }
    }
  }

  lines.push(
    "## About this export",
    "",
    "Memory recall is word-based: this export pulls everything your memory",
    "answers to broad questions about your business. A fact phrased very",
    "unusually could be missed — if something's absent or wrong, tell Ralph",
    "and the correction lands in the same memory.",
    "",
  );

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="plunder-riffle-memory-${today}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
