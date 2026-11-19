import "server-only";
import { db } from "@/lib/db";
import {
  AGENT_OPTIONS,
  PROMOTING_OPTIONS,
  type AgentPathId,
  type PromotingId,
} from "@/lib/quiz-shared";

/**
 * ─── THE FRONT-DOOR QUIZ (Dave, 2026-11-18) ─────────────────────────
 * "What if the user isn't a brand? We need a short quiz to find out
 * what the user is promoting, and send them to Muse or Agent37."
 * The app assumed every member is a business with a website. Two
 * questions fix the routing:
 *   1. What are you promoting?  → which in-app room they land in
 *   2. How do you want to run it? → Muse (baby steps, lead
 *      orchestrator), Agent37 (the full team), or self-drive.
 * Answers persist per user in AppSetting under `quiz:<userId>`
 * (the house key-value store — no schema change). A skipped quiz
 * stays skipped. Option tables live in lib/quiz-shared.ts.
 */

export interface QuizRecord {
  promoting: PromotingId | null;
  agentPath: AgentPathId | null;
  skipped?: boolean;
  at: string;
}

const keyFor = (userId: string) => `quiz:${userId}`;

export function isPromotingId(v: unknown): v is PromotingId {
  return PROMOTING_OPTIONS.some((o) => o.id === v);
}

export function isAgentPathId(v: unknown): v is AgentPathId {
  return AGENT_OPTIONS.some((o) => o.id === v);
}

export async function getQuiz(userId: string): Promise<QuizRecord | null> {
  const row = await db.appSetting.findUnique({ where: { key: keyFor(userId) } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as QuizRecord;
    if (typeof parsed.at !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveQuiz(userId: string, record: Omit<QuizRecord, "at">): Promise<QuizRecord> {
  const full: QuizRecord = { ...record, at: new Date().toISOString() };
  await db.appSetting.upsert({
    where: { key: keyFor(userId) },
    create: { key: keyFor(userId), value: JSON.stringify(full) },
    update: { value: JSON.stringify(full) },
  });
  return full;
}
