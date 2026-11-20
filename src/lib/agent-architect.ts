import "server-only";
import { db } from "@/lib/db";
import { callAgentLLM } from "@/lib/agent-runner";
import { architectSystemPrompt, parseArchitectConfig, type AgentConfig } from "@/lib/agent-architect-core";
import { researchBrand, isEngineConfigured } from "@/lib/engine";
import { mnemosCapture, mnemosPersonFor } from "@/lib/mnemos-bridge";

/**
 * ─── AGENT ARCHITECT — server lane ─────────────────────────────────
 *
 * SMB Agent Factory (Dave, 2026-11-18): the owner describes the job
 * in plain English; the architect designs the agent. One shot in v1:
 * brief (+ the business's website research when a URL is given, via
 * the P&R engine's research_brand — the same research every other
 * Whoparmy surface works from) → one Starimg pass on the mid tier →
 * a validated AgentConfig the owner reviews before installing.
 *
 * The architect DESIGNS only. Installing is the existing rent call
 * (POST /api/agents with templateKey "custom"); running is the
 * existing agent runner (CUSTOM kind). Nothing here writes an agent,
 * spends plan meter, or charges the hire wallet.
 */

export interface ArchitectResult {
  config: AgentConfig;
  researched: boolean;
  researchDigest?: string;
}

export async function architectAgent(params: {
  userId: string;
  brief: string;
  website?: string;
}): Promise<ArchitectResult> {
  const brief = params.brief.trim().slice(0, 1500);
  let researchDigest = "";
  let researched = false;

  // The member's stored brand research first — if the house already
  // researched this business, the architect works from the same
  // evidence everything else does instead of re-deriving it.
  try {
    const brand = await db.brandProfile.findFirst({
      where: { userId: params.userId, researchJson: { not: null } },
      orderBy: { updatedAt: "desc" },
    });
    if (brand?.researchJson) {
      const r = JSON.parse(brand.researchJson) as {
        analysisSummary?: string;
        offer?: string;
        audience?: string;
        pains?: string[];
        angles?: string[];
        competitors?: string[];
      };
      const lines = [
        r.analysisSummary ? `What the business is: ${r.analysisSummary}` : null,
        r.offer ? `Offer: ${r.offer}` : null,
        r.audience ? `Audience: ${r.audience}` : null,
        r.pains?.length ? `Customer pains: ${r.pains.join("; ")}` : null,
        r.angles?.length ? `Marketing angles: ${r.angles.join("; ")}` : null,
        r.competitors?.length ? `Competitors: ${r.competitors.join(", ")}` : null,
      ].filter(Boolean);
      if (lines.length) {
        researchDigest = lines.join("\n");
        researched = true;
      }
    }
  } catch {
    // stored research is an enhancement, never a blocker
  }

  // A website the owner gave us and we haven't researched yet: run
  // the engine's research_brand now (free, ~1–2 min) so the design
  // is grounded in the real business, not the owner's shorthand.
  const website = params.website?.trim();
  if (website && isEngineConfigured()) {
    try {
      const research = await researchBrand({ url: website });
      if (research.digest) {
        researchDigest = researchDigest
          ? `${researchDigest}\n${research.digest}`.slice(0, 3000)
          : research.digest.slice(0, 3000);
        researched = true;
      }
    } catch {
      // research failed (site blocks it, engine busy) — design from the brief
    }
  }

  const userMsg = [
    `OWNER'S BRIEF: ${brief}`,
    website ? `BUSINESS WEBSITE: ${website}` : null,
    researchDigest ? `\nBUSINESS RESEARCH (work only from this — invent nothing):\n${researchDigest}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callAgentLLM("mid", architectSystemPrompt(), userMsg);
  const config = parseArchitectConfig(result.text, brief);

  // The need the owner described is durable business context — it
  // belongs in their memory whether or not they install this agent.
  // Awaited (short timeout, never throws): fire-and-forget here could be
  // cut off when the route's response completes, dropping the fact.
  const captured = await mnemosCapture(
    mnemosPersonFor(params.userId),
    `Owner described an agent need: ${brief.slice(0, 400)} — architect designed "${config.name}" (${config.role.slice(0, 200)})`,
    "SMB Agent Factory — architect session",
    { timeoutMs: 8_000 },
  );
  if (!captured) console.warn("[architect] agent need not captured to memory");

  return { config, researched, researchDigest: researchDigest || undefined };
}
