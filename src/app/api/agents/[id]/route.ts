import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, isDesignatedOperator, UnauthorizedError } from "@/lib/auth";
import { verifyBridgeToken } from "@/lib/muse-bridge";
import { isGrantExpired } from "@/lib/bot-grants";
import { toolsFromJson, toolsToJson } from "@/lib/agent-architect-core";
import { capabilitiesToJson, isAgentCategory, isHttpUrl, isValidSlug, slugify } from "@/lib/agent-profile";

export const runtime = "nodejs";

/** Pause/resume one of your hired agents, or update its Factory
 *  settings (name, role, instructions, tools) from the control
 *  center's Settings tab.
 *
 *  Two auth paths (Whop Army 2.0, Slice 4 addition — Dave: "can
 *  their Muse connect with their agent via the bridge code in Whop
 *  to make changes?"):
 *   (a) Session — as before; designated operators may also manage
 *       house agents.
 *   (b) Bridge token — `Authorization: Bearer prb_…` from the
 *       member's own Muse (verified by lib/muse-bridge
 *       verifyBridgeToken). OWNER-ONLY: the token's user must own
 *       the agent, no operator override. The token path may update
 *       the agent's PROFILE/design fields only (name, description,
 *       category, capabilities, avatarUrl, demoUrl, appUrl, gitUrl,
 *       buildPrompt, spaceUrl, publicProfile) — never status, role,
 *       instructions, tools, slug, ownership, budgets or agent37Ref.
 *       This is agent-record management, not content publishing:
 *       the bridge's content-only posting rule is untouched. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] ?? null;
    let actorId: string;
    let operator = false;
    let viaToken = false;
    if (bearer) {
      const bridgeSession = await verifyBridgeToken(bearer);
      if (!bridgeSession) return NextResponse.json({ error: "Invalid or expired bridge token." }, { status: 401 });
      actorId = bridgeSession.user.id;
      viaToken = true;
    } else {
      const user = await getWhopUser();
      actorId = user.id;
      operator = isDesignatedOperator(user);
    }
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      name?: string;
      role?: string;
      instructions?: string;
      toolsJson?: string;
      // Whop Army 2.0 Slice 2: public profile fields.
      slug?: string;
      publicProfile?: boolean;
      avatarUrl?: string;
      description?: string;
      category?: string;
      capabilities?: string[];
      demoUrl?: string;
      appUrl?: string;
      gitUrl?: string;
      buildPrompt?: string;
      spaceUrl?: string;
    };
    const hire = await db.hiredAgent.findFirst({ where: { id } });
    if (!hire) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    // Owner-only, except designated operators on the SESSION path
    // (who manage house agents like BTC Barry). The bridge-token
    // path has no operator override: the token's user must own it.
    if (hire.userId !== actorId && !operator) {
      return NextResponse.json({ error: "This agent belongs to another member." }, { status: 403 });
    }
    // Bridge-token path: profile/design fields only. Anything else
    // is refused by name, so the member's Muse learns the boundary
    // instead of silently half-applying an update.
    if (viaToken) {
      const restricted = (["status", "role", "instructions", "toolsJson", "slug", "agent37Ref", "tokenBudget", "userId"] as const).filter(
        (k) => (body as Record<string, unknown>)[k] !== undefined,
      );
      if (restricted.length > 0) {
        return NextResponse.json(
          { error: `A bridge token can only update the agent's profile fields (name, description, category, capabilities, avatarUrl, demoUrl, appUrl, gitUrl, buildPrompt, spaceUrl, publicProfile). Refused: ${restricted.join(", ")}.` },
          { status: 400 },
        );
      }
    }

    // Settings update (no status in the body): name / role /
    // instructions / tools, each clamped and tool-validated.
    if (body.status === undefined) {
      const data: {
        name?: string;
        role?: string;
        instructions?: string;
        toolsJson?: string;
        slug?: string | null;
        publicProfile?: boolean;
        avatarUrl?: string | null;
        description?: string | null;
        category?: string | null;
        capabilitiesJson?: string;
        demoUrl?: string | null;
        appUrl?: string | null;
        gitUrl?: string | null;
        buildPrompt?: string | null;
        spaceUrl?: string | null;
      } = {};
      if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
      if (typeof body.role === "string") data.role = body.role.trim().slice(0, 300);
      if (typeof body.instructions === "string") data.instructions = body.instructions.trim().slice(0, 4000);
      if (typeof body.toolsJson === "string") {
        const tools = toolsFromJson(body.toolsJson);
        if (tools.length === 0) {
          return NextResponse.json({ error: "Pick at least one real tool for this agent." }, { status: 400 });
        }
        data.toolsJson = toolsToJson(tools);
      }
      // ─── Public profile (Whop Army 2.0, Slice 2) ────────────────
      if (body.slug !== undefined) {
        const slug = typeof body.slug === "string" ? slugify(body.slug) : "";
        if (!slug) {
          data.slug = null;
        } else {
          if (!isValidSlug(slug)) {
            return NextResponse.json({ error: "Slug must be 2–60 chars of lowercase letters, numbers and hyphens." }, { status: 400 });
          }
          const taken = await db.hiredAgent.findFirst({ where: { slug, id: { not: id } }, select: { id: true } });
          if (taken) return NextResponse.json({ error: "That slug is already taken by another agent." }, { status: 400 });
          data.slug = slug;
        }
      }
      if (typeof body.publicProfile === "boolean") {
        const effectiveSlug = data.slug !== undefined ? data.slug : hire.slug;
        if (body.publicProfile && !effectiveSlug) {
          return NextResponse.json({ error: "Set a slug before publishing this profile." }, { status: 400 });
        }
        data.publicProfile = body.publicProfile;
      }
      const urlField = (value: string | undefined, key: "avatarUrl" | "demoUrl" | "appUrl" | "gitUrl" | "spaceUrl", label: string) => {
        if (value === undefined) return null;
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) {
          data[key] = null;
          return null;
        }
        if (!isHttpUrl(trimmed)) return NextResponse.json({ error: `${label} must be an http(s) URL.` }, { status: 400 });
        data[key] = trimmed.slice(0, 500);
        return null;
      };
      for (const [value, key, label] of [
        [body.avatarUrl, "avatarUrl", "Avatar URL"],
        [body.demoUrl, "demoUrl", "Demo URL"],
        [body.appUrl, "appUrl", "App URL"],
        [body.gitUrl, "gitUrl", "Git URL"],
        [body.spaceUrl, "spaceUrl", "Space URL"],
      ] as const) {
        const err = urlField(value, key, label);
        if (err) return err;
      }
      if (body.description !== undefined) {
        data.description = typeof body.description === "string" ? body.description.trim().slice(0, 300) || null : null;
      }
      if (body.category !== undefined) {
        const category = typeof body.category === "string" ? body.category.trim() : "";
        if (!category) {
          data.category = null;
        } else if (!isAgentCategory(category)) {
          return NextResponse.json({ error: "Unknown category." }, { status: 400 });
        } else {
          data.category = category;
        }
      }
      if (body.capabilities !== undefined) {
        if (!Array.isArray(body.capabilities) || body.capabilities.some((c) => typeof c !== "string")) {
          return NextResponse.json({ error: "Capabilities must be an array of strings." }, { status: 400 });
        }
        data.capabilitiesJson = capabilitiesToJson(body.capabilities);
      }
      if (body.buildPrompt !== undefined) {
        data.buildPrompt = typeof body.buildPrompt === "string" ? body.buildPrompt.trim().slice(0, 8000) || null : null;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
      }
      const updated = await db.hiredAgent.update({ where: { id }, data });
      return NextResponse.json({ hire: updated });
    }

    if (body.status !== "ACTIVE" && body.status !== "PAUSED") {
      return NextResponse.json({ error: "Status must be ACTIVE or PAUSED." }, { status: 400 });
    }
    if (hire.status === "DEPLETED" && body.status === "ACTIVE") {
      return NextResponse.json({ error: "This bot has used up its fuel for the month. It refills with your plan — or connect your own key (BYOK) to run uncapped." }, { status: 400 });
    }
    if (body.status === "ACTIVE" && isGrantExpired(hire)) {
      await db.hiredAgent.update({ where: { id }, data: { status: "PAUSED" } });
      return NextResponse.json({ error: "Your 24-hour referral bot has expired — refer another member and have them save their links to earn it again, or rent a bot on your plan." }, { status: 400 });
    }
    const updated = await db.hiredAgent.update({ where: { id }, data: { status: body.status } });
    return NextResponse.json({ hire: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
}
