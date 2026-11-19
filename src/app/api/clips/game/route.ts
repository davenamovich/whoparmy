import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhopUser, UnauthorizedError } from "@/lib/auth";
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
    const body = (await req.json()) as { pageId?: string };

    if (!body.pageId) return NextResponse.json({ error: "Pick a page first." }, { status: 400 });

    const page = await db.clipPage.findFirst({ where: { id: body.pageId, userId: user.id } });
    if (!page) return NextResponse.json({ error: "No page with that id belongs to you." }, { status: 404 });

    // The floor is the member's bought pack — loaded from their own
    // purchase grants, NEVER from the caller. (The old route accepted
    // any floor 1–500 from the request body, so a member with no pack
    // at all could open a 500-clip board and farm its bonus grants.)
    const purchases = await db.clipCreditGrant.findMany({
      where: {
        userId: user.id,
        source: "purchase",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { amount: true },
    });
    const floor = purchases.reduce((max, g) => Math.max(max, g.amount), 0);
    if (floor < 1) {
      return NextResponse.json(
        { error: "The Box Trade trades up from a pack you own. Buy a clip pack first — its size becomes your floor." },
        { status: 402 },
      );
    }

    // One board per page per day, WHATEVER its state: refreshing the
    // page is not a way to get a new board, and neither is finishing
    // one — the old lookup only matched OPEN sessions, so a resolved
    // board could be re-rolled the same day for a second bonus.
    const seed = sessionSeed(user.id, page.id);
    const existing = await db.clipGameSession.findFirst({
      where: { userId: user.id, pageId: page.id, seed },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      const state = hydrate(existing);
      return NextResponse.json({
        id: existing.id,
        ...view(state),
        note:
          existing.status === "resolved"
            ? "Today's board is settled — it does not re-roll."
            : "This is today's board — it does not re-roll.",
      });
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
      { status: err instanceof UnauthorizedError ? 401 : 500 },
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

    if (!done) {
      const updated = await db.clipGameSession.update({
        where: { id: row.id },
        data: {
          bonus: next.bonus,
          briefs: JSON.stringify(next.briefs),
          round: next.round,
          chosen: JSON.stringify(next.chosen),
        },
      });
      return NextResponse.json({ id: updated.id, ...view(next) });
    }

    // Resolving is the one moment that pays out, so it happens exactly
    // once — and atomically: the state transition AND the grant are
    // written in ONE transaction, claimed on the session still being
    // open, with the grant keyed to the board id (a pre-create
    // existence check inside the tx). The old flow claimed first and
    // granted after: a crash between them stranded a resolved board
    // with no bonus, and the two writes were never atomic.
    let granted = 0;
    let alreadySettled = false;
    await db.$transaction(async (tx) => {
      const claimed = await tx.clipGameSession.updateMany({
        where: { id: row.id, status: "open" },
        data: {
          bonus: next.bonus,
          briefs: JSON.stringify(next.briefs),
          round: next.round,
          chosen: JSON.stringify(next.chosen),
          status: "resolved",
          resolvedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        alreadySettled = true;
        return;
      }
      if (next.bonus > 0) {
        const prior = await tx.clipCreditGrant.findFirst({
          where: { source: "game_bonus", reference: row.id },
          select: { id: true },
        });
        if (!prior) {
          await tx.clipCreditGrant.create({
            data: {
              userId: user.id,
              amount: next.bonus,
              source: "game_bonus",
              label: `Box Trade bonus on a ${next.floor}-clip pack`,
              reference: row.id,
            },
          });
          granted = next.bonus;
        }
      }
    });

    if (alreadySettled) {
      return NextResponse.json({ id: row.id, ...view(next), note: "That board was already settled." });
    }

    const resolution = resolve(next);
    return NextResponse.json({
      id: row.id,
      ...view(next),
      granted,
      note: granted
        ? `${resolution.note} ${granted} bonus clips are on your balance now.`
        : resolution.note,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "That move did not go through." },
      { status: err instanceof UnauthorizedError ? 401 : 500 },
    );
  }
}
