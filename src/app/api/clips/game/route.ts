import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser } from "@/lib/auth";
import {
  declineRound,
  resolve,
  roundFor,
  sessionSeed,
  startSession,
  takeUpside,
  type BriefCard,
  type GameState,
} from "@/lib/clips/game";

export const runtime = "nodejs";

/**
 * The Box Trade. Start a session, then take or decline one round at a time.
 *
 * The server owns the seed, the floor and the round number — the client
 * sends a choice, never an outcome. That is what makes "you never lose"
 * true: the floor is a stored number, not a message.
 */

function hydrate(row: {
  id: string;
  floor: number;
  bonus: number;
  briefs: string;
  round: number;
  maxRounds: number;
  seed: number;
  chosen: string;
}): GameState {
  let briefs: BriefCard[] = [];
  let chosen: number[] = [];
  try {
    briefs = JSON.parse(row.briefs) as BriefCard[];
  } catch {
    briefs = [];
  }
  try {
    chosen = JSON.parse(row.chosen) as number[];
  } catch {
    chosen = [];
  }
  return {
    floor: row.floor,
    bonus: row.bonus,
    briefs,
    round: row.round,
    maxRounds: row.maxRounds,
    seed: row.seed,
    chosen,
  };
}

function view(state: GameState) {
  const open = state.round < state.maxRounds;
  return {
    floor: state.floor,
    round: state.round,
    maxRounds: state.maxRounds,
    open,
    roundView: open ? roundFor(state) : null,
    resolution: open ? null : resolve(state),
    briefs: state.briefs,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { pageId?: string; floor?: number };

    if (!body.pageId) return NextResponse.json({ error: "Pick a page first." }, { status: 400 });
    const floor = Math.trunc(Number(body.floor ?? 0));
    if (!Number.isFinite(floor) || floor < 1 || floor > 500) {
      return NextResponse.json({ error: "A pack is between 1 and 500 clips." }, { status: 400 });
    }

    const page = await db.clipPage.findFirst({ where: { id: body.pageId, userId: user.id } });
    if (!page) return NextResponse.json({ error: "No page with that id belongs to you." }, { status: 404 });

    // One open session per page per day: refreshing the page is not a way
    // to get a new board.
    const seed = sessionSeed(user.id, page.id);
    const existing = await db.clipGameSession.findFirst({
      where: { userId: user.id, pageId: page.id, status: "open", seed },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const state = hydrate(existing);
      return NextResponse.json({ id: existing.id, ...view(state), note: "This is today's board — it does not re-roll." });
    }

    const state = startSession({ floor, seed });
    const row = await db.clipGameSession.create({
      data: {
        userId: user.id,
        pageId: page.id,
        floor: state.floor,
        bonus: 0,
        briefs: "[]",
        round: 0,
        maxRounds: state.maxRounds,
        seed,
        chosen: "[]",
      },
    });

    return NextResponse.json({
      id: row.id,
      ...view(state),
      note: `${state.floor} clips is your floor. Trades add; they never take.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open a board." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getWhopUser();
    const body = (await req.json()) as { sessionId?: string; action?: string; index?: number };
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });

    const row = await db.clipGameSession.findFirst({ where: { id: body.sessionId, userId: user.id } });
    if (!row) return NextResponse.json({ error: "No board with that id belongs to you." }, { status: 404 });
    if (row.status !== "open") {
      return NextResponse.json({ error: "That board is finished." }, { status: 409 });
    }

    const state = hydrate(row);
    let next: GameState;

    if (body.action === "decline") {
      next = declineRound(state);
    } else if (body.action === "take") {
      const index = body.index === 1 ? 1 : body.index === 0 ? 0 : null;
      if (index === null) return NextResponse.json({ error: "index must be 0 or 1." }, { status: 400 });
      // Re-derive this round server-side; the client never sends a prize.
      const round = roundFor(state);
      if (!round.options[index]) return NextResponse.json({ error: "No such box." }, { status: 400 });
      next = takeUpside(state, index);
    } else {
      return NextResponse.json({ error: 'action must be "take" or "decline".' }, { status: 400 });
    }

    const done = next.round >= next.maxRounds;
    const updated = await db.clipGameSession.update({
      where: { id: row.id },
      data: {
        bonus: next.bonus,
        briefs: JSON.stringify(next.briefs),
        round: next.round,
        chosen: JSON.stringify(next.chosen),
        status: done ? "resolved" : "open",
        resolvedAt: done ? new Date() : null,
      },
    });

    return NextResponse.json({ id: updated.id, ...view(next) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "That move did not go through." },
      { status: 500 },
    );
  }
}
