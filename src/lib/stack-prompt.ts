import "server-only";
import type { User } from "@prisma/client";
import type { Stack } from "@/lib/stacks";
import { catalogEntrySync } from "@/lib/offer-catalog";
import { getSavedDhMediaLink } from "@/lib/btc-addresses";
import { getMemberLanguage } from "@/lib/member-language";
import { codeTtlLabel } from "@/lib/experiment-scope";

/**
 * Fill a stack's ignition prompt for one member and one minted code.
 * One implementation for every place a prompt is handed out — the
 * operator launcher (/api/admin/launch), the member's /bridge
 * (/api/bridge/agent) and the agent link (/connect/<code>) — so the
 * three can never disagree about what the agent is told.
 *
 * Slots: {BRIDGE_CODE}, {CODE_TTL} (the code's real lifetime for its
 * scope), {MEMBER_NAME}, {DH_MEDIA_LINK} (the CURRENT saved link,
 * never cached), {LANGUAGE} (the member's stored language).
 */
export async function fillStackPrompt(
  stack: Pick<Stack, "promptTemplate" | "bridgeScope">,
  user: Pick<User, "id" | "name" | "whopUsername">,
  code: string,
): Promise<string> {
  let prompt = (stack.promptTemplate ?? "").replaceAll("{BRIDGE_CODE}", code);
  prompt = prompt.replaceAll("{CODE_TTL}", codeTtlLabel(stack.bridgeScope ?? "week"));
  if (prompt.includes("{MEMBER_NAME}")) {
    prompt = prompt.replaceAll("{MEMBER_NAME}", user.name ?? user.whopUsername ?? "a Whop Army member");
  }
  if (prompt.includes("{DH_MEDIA_LINK}")) {
    // Callers gate the BTC stack on a saved link; the fallback is the
    // /bridge placeholder example for any template carrying the slot
    // ungated.
    const saved = await getSavedDhMediaLink(user.id).catch(() => null);
    const fallback =
      catalogEntrySync("salarium")?.example ?? "https://dh.media/?affid=Vesselprotocol";
    prompt = prompt.replaceAll("{DH_MEDIA_LINK}", saved ?? fallback);
  }
  if (prompt.includes("{LANGUAGE}")) {
    const memberLanguage = await getMemberLanguage(user.id).catch(() => null);
    prompt = prompt.replaceAll("{LANGUAGE}", memberLanguage?.label ?? "English");
  }
  return prompt;
}
