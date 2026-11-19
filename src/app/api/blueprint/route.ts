import { NextRequest, NextResponse } from "next/server";
import { getWhopUser } from "@/lib/auth";
import { getBlueprint, draftBlueprint, approveBlueprint, systemSummary, systemContext } from "@/lib/blueprint";
import { launchReport, dailyBriefing } from "@/lib/briefing";
import { craftSetupPrompt } from "@/lib/setup-prompt";
import { composeTeamPrompt, getTeamConfirmedAt, confirmTeamBoard, boardNameFor } from "@/lib/team-board";

export const runtime = "nodejs";

/**
 * /api/blueprint — the member's AI-system blueprint + dashboard
 * state (Slice 1, Dave 2026-11-19). GET returns the blueprint (or
 * null) plus the live system summary. POST {action:"draft"}
 * (re)generates a draft from research; POST {action:"approve"}
 * approves it and hires the workforce within the plan's seats.
 */
export async function GET() {
  try {
    const user = await getWhopUser();
    const [blueprint, summary, report, briefing, teamConfirmedAt, ctx] = await Promise.all([
      getBlueprint(user.id),
      systemSummary(user),
      launchReport(user),
      dailyBriefing(user),
      getTeamConfirmedAt(user.id),
      systemContext(user),
    ]);
    // Your Team (Dave, 2026-11-19): the standalone board prompt is
    // pure composition from the blueprint — no minting, safe on GET.
    const team = {
      confirmedAt: teamConfirmedAt,
      roster: blueprint
        ? blueprint.workforce.map((a) => ({
            name: a.name,
            role: a.role,
            boardName: boardNameFor(a),
            seated: a.seated !== false,
          }))
        : [],
      prompt: blueprint
        ? composeTeamPrompt({
            business: ctx.brandName ?? "your business",
            website: ctx.brandWebsite,
            blueprint,
          })
        : null,
    };
    return NextResponse.json({ blueprint, summary, report, briefing, team });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (body.action === "setup") {
      // Day-1 setup (Dave): Ralph crafts the master prompt + a fresh
      // bridge connect link; minting retires older unused codes, so
      // this only ever runs on the member's explicit tap.
      return NextResponse.json(await craftSetupPrompt(user));
    }
    if (body.action === "team-confirm") {
      // The member's word that their own Muse stood their board
      // up — Whoparmy cannot see their Vercel board, by design.
      const confirmedAt = await confirmTeamBoard(user.id);
      return NextResponse.json({ team: { confirmedAt } });
    }
    if (body.action === "draft") {
      const blueprint = await draftBlueprint(user);
      return NextResponse.json({ blueprint });
    }
    if (body.action === "approve") {
      const blueprint = await approveBlueprint(user);
      const summary = await systemSummary(user);
      return NextResponse.json({ blueprint, summary });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
