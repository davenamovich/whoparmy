import "server-only";
import { db } from "@/lib/db";
import { getBlueprint, draftBlueprint, type Blueprint } from "@/lib/blueprint";
import { composeSetupPrompt } from "@/lib/setup-prompt";
import { getSavedOfferLinks } from "@/lib/bridge";
import { getMemberLanguage } from "@/lib/member-language";

/**
 * ─── EXPERT PANEL (Dave, 2026-11-19) ──────────────────────────────
 * "Build in an expert panel / swarm using the Vercel Board."
 * A member sends their blueprint + Day-1 setup to a panel of four
 * expert lenses — Offer, Content Engine, Funnel, Risk & Honesty —
 * who review it as Board tasks (the Board swarm pattern: one task
 * per lens, workers under their own names, a synthesized verdict).
 * The app holds the queue and the verdict; the swarm itself runs
 * on the operator side (Muse + the Board CLI), because the Board
 * login lives there, not on this server. Storage follows the quiz
 * precedent: AppSetting JSON under panel:<userId>.
 */

export interface PanelVerdict {
  summary: string;
  lenses: { lens: string; findings: string }[];
  fixes: string[];
  reviewedAt: string;
}

export interface PanelState {
  status: "none" | "queued" | "in-review" | "reviewed";
  requestedAt?: string;
  boardTasks?: string[];
  verdict?: PanelVerdict;
}

const keyFor = (userId: string) => `panel:${userId}`;

export async function getPanel(userId: string): Promise<PanelState> {
  const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
  if (!row?.value) return { status: "none" };
  try {
    return JSON.parse(row.value) as PanelState;
  } catch {
    return { status: "none" };
  }
}

async function savePanel(userId: string, state: PanelState): Promise<void> {
  const value = JSON.stringify(state);
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    update: { value },
    create: { key: keyFor(userId), value },
  });
}

/** Member tap: queue this member's system for the panel. */
export async function requestPanel(user: { id: string; plan: string; whopId: string | null }): Promise<PanelState> {
  const current = await getPanel(user.id);
  if (current.status === "queued" || current.status === "in-review") return current;
  let bp = await getBlueprint(user.id);
  if (!bp) bp = await draftBlueprint(user);
  const state: PanelState = { status: "queued", requestedAt: new Date().toISOString() };
  await savePanel(user.id, state);
  return state;
}

export interface QueuedPanel {
  userId: string;
  requestedAt: string;
  business: string;
  website: string | null;
  blueprint: Blueprint;
  setupPrompt: string;
}

/** Runner side: every queued member, with the material the panel reviews. */
export async function panelQueue(): Promise<QueuedPanel[]> {
  const rows = await db.appSetting.findMany({ where: { key: { startsWith: "panel:" } } });
  const out: QueuedPanel[] = [];
  for (const row of rows) {
    let state: PanelState;
    try {
      state = JSON.parse(row.value ?? "") as PanelState;
    } catch {
      continue;
    }
    if (state.status !== "queued") continue;
    const userId = row.key.slice("panel:".length);
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true, whopId: true } });
    if (!user) continue;
    const bp = await getBlueprint(userId);
    if (!bp) continue;
    const brand = await db.brandProfile.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { name: true, website: true },
    });
    out.push({
      userId,
      requestedAt: state.requestedAt ?? "",
      business: brand?.name ?? "My business",
      website: brand?.website ?? null,
      blueprint: bp,
      // The panel reviews the plan and the prompt — never a live
      // connect link (minting is the member's own tap).
      setupPrompt: composeSetupPrompt({
        business: brand?.name ?? "My business",
        website: brand?.website ?? null,
        blueprint: bp,
        link: null,
        savedLinks: await getSavedOfferLinks(userId).catch(() => []),
        languageLabel: (await getMemberLanguage(userId).catch(() => null))?.label,
      }),
    });
  }
  return out;
}

export async function markPanelInReview(userId: string, boardTasks: string[]): Promise<void> {
  const current = await getPanel(userId);
  if (current.status !== "queued") return;
  await savePanel(userId, { ...current, status: "in-review", boardTasks });
}

export async function savePanelVerdict(userId: string, verdict: PanelVerdict): Promise<void> {
  const current = await getPanel(userId);
  await savePanel(userId, { ...current, status: "reviewed", verdict });
}
