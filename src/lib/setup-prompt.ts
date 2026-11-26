import "server-only";
import { db } from "@/lib/db";
import { draftBlueprint, getBlueprint, type Blueprint } from "@/lib/blueprint";
import {
  assertBridgeEligible,
  bridgeOffer,
  getMemberEngineKey,
  mintBridgeCode,
  mintUpdateToken,
  BridgeError,
} from "@/lib/muse-bridge";
import { teamBoardSection } from "@/lib/team-board";
import { getSavedOfferLinks } from "@/lib/bridge";
import { getMemberLanguage } from "@/lib/member-language";
import type { SavedOfferLink } from "@/lib/muse-week-command";
import { composeEnginePrompt } from "@/lib/setup-prompt-compose";
import type { WalkthroughOffer } from "@/lib/build-walkthrough-core";
import { HOUSE_ACCOUNT_EMAIL } from "@/lib/upload-post";

/**
 * ─── THE ONE AGENT-CREATION PROMPT (Dave, 2026-11-19; consolidated
 * 2026-11-20) ─────────────────────────────────────────────────────
 * This prompt IS the agent creation door — the single way agents
 * get built for a member. The old rent-a-bot catalog and the
 * in-app architect install were inferior parallel paths; Dave
 * ordered them consolidated away (2026-11-20). Ralph composes ONE
 * master prompt from the member's blueprint; the member pastes it
 * to their own Muse with their bridge connect link, and their
 * Muse builds the member's complete autonomous content engine
 * AS A SPACE in the member's own Muse (the layered model: the
 * member's factory lives in THEIR Muse — house Spaces are never
 * shared), connects the bridge, and starts generating content on
 * autopilot within the bridge budget cap. Generation is the
 * autopilot; publishing still waits for the member's approve tap
 * in their own factory (their Upload-Post, their key in their
 * Muse's secure storage). The bridge stays content-only.
 *
 * The pure text composition lives in setup-prompt-compose.ts
 * (unit-tested); this module is the server wrapper that gathers
 * the blueprint, mints the link, and injects the team board.
 */

type Actor = { id: string; plan: string; whopId: string | null; email?: string | null };

export interface SetupPromptResult {
  eligible: boolean;
  link: string | null;
  prompt: string;
  blueprintStatus: string;
}

export function composeSetupPrompt(args: {
  business: string;
  website: string | null;
  blueprint: Blueprint;
  link: string | null;
  updateToken?: string | null;
  savedLinks?: SavedOfferLink[];
  languageLabel?: string;
  walkthroughOffers?: WalkthroughOffer[];
  keyClaimLink?: string | null;
  houseAccount?: boolean;
  offer?: string;
  audience?: string;
  firstResult?: string;
  neverDo?: string;
}): string {
  return composeEnginePrompt({
    ...args,
    teamSection: teamBoardSection(args.blueprint, args.business, "## 7. Stand up my team board"),
    houseAccount: args.houseAccount,
  });
}

export async function craftSetupPrompt(user: Actor): Promise<SetupPromptResult> {
  let bp = await getBlueprint(user.id);
  if (!bp) bp = await draftBlueprint(user);
  const brand = await db.brandProfile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { name: true, website: true },
  });

  let link: string | null = null;
  const updateToken = (await mintUpdateToken(user.id)).token;
  let eligible = false;
  const accountRecord = await db.user.findUnique({ where: { id: user.id }, select: { email: true } });
  const houseAccount = (user.email ?? accountRecord?.email)?.toLowerCase() === HOUSE_ACCOUNT_EMAIL;
  try {
    const full = await db.user.findUnique({ where: { id: user.id } });
    if (full) {
      assertBridgeEligible(full);
      await getMemberEngineKey(full); // prove the engine link before minting
      const offer = bridgeOffer("week");
      const { code } = await mintBridgeCode(user.id, offer.budgetCredits);
      link = `https://whop.plunderandriffle.com/connect/${code}`;
      eligible = true;
    }
  } catch (e) {
    if (!(e instanceof BridgeError)) throw e;
    // Not eligible or engine link unproven: the prompt still crafts,
    // with the get-your-link step written into section 1.
  }

  return {
    eligible,
    link,
    prompt: composeSetupPrompt({
      business: brand?.name ?? "My business",
      website: brand?.website ?? null,
      blueprint: bp,
      link,
      updateToken,
      savedLinks: await getSavedOfferLinks(user.id).catch(() => []),
      languageLabel: (await getMemberLanguage(user.id).catch(() => null))?.label,
      houseAccount,
    }),
    blueprintStatus: bp.status,
  };
}
