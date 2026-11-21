/**
 * ─── BTC BARRY ROTATOR — pure core ─────────────────────────────────
 *
 * Dave tapped "Provision Barry's rotator" (2026-11-21): Barry's
 * public profile was live but his rotator access read "not-set-up" —
 * the operator's btc-barry HiredAgent had no AgentRotator row, so
 * there was no Ride door. This module is the pure half of the
 * provisioning (the traffic-pool-core / barry-agent-core precedent —
 * no imports, loadable by `node --test`): the gate, the add-only
 * link-sync plan, the plain-language summary, and the provisioning
 * flow against a structural db.
 *
 * Rules baked in here:
 * - OPERATOR'S BARRY ONLY. The caller resolves the operator's own
 *   oldest btc-barry row (selectBarryRecord semantics); this core
 *   never sees another member's Barry.
 * - WORKING GATE. A Barry who is not ACTIVE (or is past expiry) is
 *   refused with the reason — the /r/a serve gate
 *   (rotator-v2-core isAgentWorking) would refuse him anyway, so
 *   provisioning a dead rotator would only lie on the profile.
 *   The check below mirrors isAgentWorking exactly.
 * - ADD-ONLY LINK SYNC. Destinations come ONLY from the operator's
 *   saved EngineLink records — never a hardcoded URL. Links already
 *   in the rotator keep their row (cap / position / enabled state
 *   untouched); saved links not yet in the rotator append after the
 *   current maximum position. Nothing is removed, ever: the member
 *   PUT flow replaces link sets, provisioning must not.
 * - THE LEAD IS THE OUTCOME, NEVER AN OFFER (Dave, 2026-11-21):
 *   the Muse and Agent37 links are LEAD destinations — on a sync
 *   they are added ahead of every standard link and carry
 *   LEAD_WEIGHT (3× a standard link's 1) in the WEIGHTED pick.
 *   Offers (DH Media included) are standard rotation members:
 *   present, never first, never weighted up. The one routing
 *   exception to add-only purity: an existing lead link whose
 *   weight sits BELOW the lead weight is raised to it — weights
 *   are routing config, not owner content. A weight is never
 *   lowered, and caps / enabled / positions of existing rows are
 *   still never touched (new links append; leads among the new
 *   ones go first, which is what puts them at the front on the
 *   first sync of a fresh rotator).
 * - HONEST EMPTY STATE. No saved links → the rotator still gets
 *   created (so the next save can sync into it), but the summary
 *   says plainly that it has no destinations.
 *
 * The provisioning flow itself (provisionBarryRotator, bottom)
 * also lives here, written against a structural db — the
 * lib/identity.ts precedent: this file stays import-free so
 * `node --test` can load it, while the server wrapper
 * (lib/barry-agent.ts ensureBarryRotatorForOperator) resolves the
 * operator's Barry via barry-agent-core's selectBarryRecord and
 * hands the record in. Selection stays single-sourced there;
 * everything after selection is decided here.
 */

/** EngineLink partner keys that are Barry's DH Media gate link:
 *  the canonical P&R MCP step, plus the legacy key for any row the
 *  boot migration has not rewritten yet — the same pair
 *  lib/btc-addresses.ts getSavedDhMediaLink reads. */
export const DH_MEDIA_PARTNER_KEYS: readonly string[] = ["salarium", "dh-media"];

/**
 * Lead destinations (Dave, 2026-11-21): Barry's rotator leads with
 * the outcome pages — Muse (the workhouse; "muse" is the offers
 * catalog's local-extra partner key) and Agent37 (the workforce;
 * canonical MCP step "agent37_ref", plus the legacy "agent37" key
 * for any row the boot migration has not rewritten yet). Every
 * other saved link — every offer — rotates behind them at the
 * standard weight.
 */
export const LEAD_PARTNER_KEYS: readonly string[] = ["muse", "agent37_ref", "agent37"];

/** Weight a lead link carries in the WEIGHTED pick (rotator-v2-core
 *  pickWeighted): 3× a standard link, so the outcome pages take
 *  roughly three of every five rides when both leads are present. */
export const LEAD_WEIGHT = 3;

/** Weight every non-lead (offer) link is created with — the schema
 *  default, stated here so the sync plan is explicit. */
export const STANDARD_WEIGHT = 1;

const LEAD_DISPLAY_NAMES: ReadonlyArray<{ keys: readonly string[]; name: string }> = [
  { keys: ["muse"], name: "Muse" },
  { keys: ["agent37_ref", "agent37"], name: "Agent37" },
];

/** Display name for a lead partner key, or null for standard links. */
export function leadPartnerName(partner: string): string | null {
  for (const entry of LEAD_DISPLAY_NAMES) {
    if (entry.keys.includes(partner)) return entry.name;
  }
  return null;
}

export function isLeadPartner(partner: string): boolean {
  return LEAD_PARTNER_KEYS.includes(partner);
}

/** Lead display names present among the given partner keys, in
 *  canonical order (Muse before Agent37), de-duplicated across
 *  canonical/legacy key spellings. */
export function leadNamesFor(partners: readonly string[]): string[] {
  const present = new Set(partners);
  return LEAD_DISPLAY_NAMES.filter((entry) => entry.keys.some((k) => present.has(k))).map((entry) => entry.name);
}

export interface BarryRotatorCandidate {
  id: string;
  name: string;
  status: string;
  expiresAt: Date | null;
}

export type BarryRotatorGate =
  | { ok: true }
  | { ok: false; state: "no-barry" | "barry-not-active"; detail: string };

/**
 * May this Barry hold a live rotator? Mirrors
 * rotator-v2-core.isAgentWorking (status ACTIVE and unexpired) —
 * the exact rule the /r/a serve applies, so a provisioned rotator
 * is always a servable one.
 */
export function barryRotatorGate(barry: BarryRotatorCandidate | null, now: Date): BarryRotatorGate {
  if (!barry) {
    return {
      ok: false,
      state: "no-barry",
      detail:
        "No BTC Barry agent record for this operator yet — launch the BTC Experiment once (it creates Barry's record), then provision his rotator.",
    };
  }
  if (barry.status !== "ACTIVE") {
    return {
      ok: false,
      state: "barry-not-active",
      detail: `Barry's record is ${barry.status}, not ACTIVE — a paused or depleted agent's rotator refuses to serve, so nothing was provisioned. Resume Barry first.`,
    };
  }
  if (barry.expiresAt !== null && barry.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      state: "barry-not-active",
      detail: "Barry's record is ACTIVE but past its expiry — the serve gate would refuse him, so nothing was provisioned.",
    };
  }
  return { ok: true };
}

export interface OwnedLinkInput {
  id: string;
  partner: string;
  /** EngineLink.source: "pr-mcp" when the link was populated from
   *  the owner's own P&R record by their Muse's bridge offers
   *  sync, "manual" when pasted by hand. */
  source: string;
}

export interface ExistingRotatorLinkInput {
  engineLinkId: string;
  position: number;
  weight: number;
}

export interface LinkSyncPlan {
  /** New AgentRotatorLink rows to create, in order: lead links
   *  first (so a fresh rotator's front positions are the outcome
   *  pages), then standard links in saved order. */
  toAdd: Array<{ engineLinkId: string; position: number; weight: number }>;
  /** Existing LEAD links whose weight is below LEAD_WEIGHT, to be
   *  raised to it. Raise-only: a weight is never lowered here, and
   *  standard links never appear. */
  weightRaises: Array<{ engineLinkId: string; weight: number }>;
  /** Total links in the rotator after the sync. */
  total: number;
  /** Any of the operator's saved links is the DH Media gate link. */
  hasDhMediaLink: boolean;
  /** Lead display names ("Muse", "Agent37") among the saved links. */
  leadNames: string[];
  /** Where the lead links came from: all populated from the owner's
   *  P&R record via the bridge offers sync ("pr-mcp"), all saved
   *  manually, a mix — or null when there are no lead links. */
  leadSource: "pr-mcp" | "manual" | "mixed" | null;
}

/**
 * The add-only sync plan: every saved EngineLink not already in the
 * rotator is appended after the current maximum position (saved
 * links arrive in the caller's stable order — createdAt, then id),
 * with lead links ahead of standard ones among the additions and
 * carrying LEAD_WEIGHT. Existing rows keep their cap, position and
 * enabled state; the single exception is a lead link's weight,
 * raised to LEAD_WEIGHT when it sits below it (never lowered).
 */
export function planAddOnlyLinkSync(
  existing: ExistingRotatorLinkInput[],
  owned: OwnedLinkInput[],
): LinkSyncPlan {
  const inRotator = new Set(existing.map((l) => l.engineLinkId));
  const partnerById = new Map(owned.map((l) => [l.id, l.partner]));
  let nextPosition = existing.reduce((max, l) => Math.max(max, l.position), -1) + 1;

  const weightRaises: Array<{ engineLinkId: string; weight: number }> = [];
  for (const row of existing) {
    const partner = partnerById.get(row.engineLinkId);
    if (partner !== undefined && isLeadPartner(partner) && row.weight < LEAD_WEIGHT) {
      weightRaises.push({ engineLinkId: row.engineLinkId, weight: LEAD_WEIGHT });
    }
  }

  const missing = owned.filter((l) => !inRotator.has(l.id));
  const ordered = [
    ...missing.filter((l) => isLeadPartner(l.partner)),
    ...missing.filter((l) => !isLeadPartner(l.partner)),
  ];
  const toAdd: Array<{ engineLinkId: string; position: number; weight: number }> = [];
  for (const link of ordered) {
    toAdd.push({
      engineLinkId: link.id,
      position: nextPosition,
      weight: isLeadPartner(link.partner) ? LEAD_WEIGHT : STANDARD_WEIGHT,
    });
    nextPosition += 1;
  }
  const leadOwned = owned.filter((l) => isLeadPartner(l.partner));
  const leadSource: LinkSyncPlan["leadSource"] =
    leadOwned.length === 0
      ? null
      : leadOwned.every((l) => l.source === "pr-mcp")
        ? "pr-mcp"
        : leadOwned.every((l) => l.source !== "pr-mcp")
          ? "manual"
          : "mixed";
  return {
    toAdd,
    weightRaises,
    total: existing.length + toAdd.length,
    hasDhMediaLink: owned.some((l) => DH_MEDIA_PARTNER_KEYS.includes(l.partner)),
    leadNames: leadNamesFor(owned.map((l) => l.partner)),
    leadSource,
  };
}

export type BarryProvisionState = "enabled" | "no-links" | "disabled" | "no-barry" | "barry-not-active";

export interface BarryProvisionSummary {
  state: BarryProvisionState;
  detail: string;
}

/**
 * The plain-language outcome Dave reads in /admin. `state` is
 * "enabled" only when the rotator exists, is switched on, and has
 * at least one destination — anything less names the gap instead of
 * dressing up as live.
 */
export function summarizeBarryProvision(input: {
  gate: BarryRotatorGate;
  rotatorEnabled: boolean;
  linksAdded: number;
  linksTotal: number;
  hasDhMediaLink: boolean;
  leadNames: string[];
  leadSource: "pr-mcp" | "manual" | "mixed" | null;
}): BarryProvisionSummary {
  if (!input.gate.ok) {
    return { state: input.gate.state, detail: input.gate.detail };
  }
  if (input.linksTotal === 0) {
    return {
      state: "no-links",
      detail:
        "Barry's rotator is created but has no destinations — no saved links to rotate yet. Links come only from your saved EngineLinks: save your Muse and Agent37 links on /bridge so Barry has lead destinations, plus any offers you want rotating behind them, then provision again.",
    };
  }
  if (!input.rotatorEnabled) {
    return {
      state: "disabled",
      detail: `Barry's rotator exists with ${input.linksTotal} destination(s) but is switched off — provisioning left its on/off state untouched. Re-enable it in the rotator settings to open the Ride door.`,
    };
  }
  const added =
    input.linksAdded > 0 ? ` ${input.linksAdded} saved link(s) were added to the rotation this run.` : " No new links to add — the rotation already matches your saved links.";
  // The lead is stated by name when outcome pages are saved; when
  // none are, the gap is named instead of letting an offer look
  // like the lead (Dave, 2026-11-21: never lead with an offer).
  const leadOrigin =
    input.leadSource === "pr-mcp"
      ? " Lead links populated from your P&R record via the bridge sync."
      : input.leadSource === "mixed"
        ? " Lead links populated from your P&R record and manual saves."
        : input.leadSource === "manual"
          ? " Lead links saved manually."
          : "";
  const lead =
    input.leadNames.length > 0
      ? ` Lead: ${input.leadNames.join(" + ")} — offers rotate behind.${leadOrigin}`
      : " Note: no Muse link saved — rotator has no lead destination. Save your Muse and Agent37 links on /bridge so the outcome pages lead.";
  const dh = input.hasDhMediaLink
    ? input.leadNames.length > 0
      ? " Your DH Media link is in the rotation behind the lead."
      : " Your DH Media link is in the rotation."
    : " Note: no DH Media link is saved, so Barry's gate link is not in the rotation.";
  return {
    state: "enabled",
    detail: `Barry's rotator is live with ${input.linksTotal} destination(s).${lead}${added}${dh}`,
  };
}

/**
 * ─── Provisioning flow (structural db) ─────────────────────────────
 *
 * Creation path: the AgentRotator row is find-or-created with the
 * exact upsert the member agent-rotator API uses (extracted in
 * lib/rotator-v2.ts as ensureAgentRotatorRow) — the create payload
 * is only { agentId, userId }; mode (WEIGHTED) and enabled defaults
 * live in the schema, and the signed /r/a serve code is derived
 * from the row id at read time, never stored. One creation path,
 * two callers, no forked defaults.
 *
 * Idempotent and self-healing: re-running creates nothing twice
 * (rotator upsert + @@unique([rotatorId, engineLinkId])), adds only
 * saved links that are missing, and never removes a link, resets a
 * cap, or flips the rotator's enabled switch. The one weight change
 * it ever makes is raising a lead link to LEAD_WEIGHT (see the
 * header rules).
 */
export interface BarryRotatorDb {
  agentRotator: {
    findUnique(args: {
      where: { agentId: string };
    }): Promise<{ id: string; agentId: string; userId: string; enabled: boolean } | null>;
    upsert(args: {
      where: { agentId: string };
      create: { agentId: string; userId: string };
      update: Record<string, never>;
    }): Promise<{ id: string; agentId: string; userId: string; enabled: boolean }>;
  };
  engineLink: {
    findMany(args: {
      where: { userId: string };
      orderBy: [{ createdAt: "asc" }, { id: "asc" }];
    }): Promise<Array<{ id: string; partner: string; source: string; createdAt: Date }>>;
  };
  agentRotatorLink: {
    findMany(args: {
      where: { rotatorId: string };
    }): Promise<Array<{ engineLinkId: string; position: number; weight: number }>>;
    createMany(args: {
      data: Array<{ rotatorId: string; engineLinkId: string; position: number; weight: number }>;
    }): Promise<{ count: number }>;
    updateMany(args: {
      where: { rotatorId: string; engineLinkId: string };
      data: { weight: number };
    }): Promise<{ count: number }>;
  };
}

export interface EnsureBarryRotatorResult extends BarryProvisionSummary {
  agentName: string | null;
  rotatorCreated: boolean;
  linksAdded: number;
  linksTotal: number;
  /** Lead display names ("Muse", "Agent37") among the operator's
   *  saved links — the destinations the rotation leads with. */
  leadNames: string[];
  /** Where the lead links came from (bridge sync vs manual save). */
  leadSource: "pr-mcp" | "manual" | "mixed" | null;
}

/**
 * Provision (or re-sync) Barry's rotator. `barry` is the operator's
 * OWN record, already resolved by the caller (oldest btc-barry row,
 * selectBarryRecord) — another member's Barry is never passed in,
 * and every query below is scoped by operatorUserId besides.
 * A Barry who isn't working is refused before any write.
 */
export async function provisionBarryRotator(
  db: BarryRotatorDb,
  input: { barry: BarryRotatorCandidate | null; operatorUserId: string; now?: Date },
): Promise<EnsureBarryRotatorResult> {
  const { barry, operatorUserId } = input;
  const gate = barryRotatorGate(barry, input.now ?? new Date());
  if (!barry || !gate.ok) {
    return {
      agentName: barry?.name ?? null,
      rotatorCreated: false,
      linksAdded: 0,
      linksTotal: 0,
      leadNames: [],
      leadSource: null,
      ...summarizeBarryProvision({
        gate,
        rotatorEnabled: false,
        linksAdded: 0,
        linksTotal: 0,
        hasDhMediaLink: false,
        leadNames: [],
        leadSource: null,
      }),
    };
  }

  const existing = await db.agentRotator.findUnique({ where: { agentId: barry.id } });
  const rotator = await db.agentRotator.upsert({
    where: { agentId: barry.id },
    create: { agentId: barry.id, userId: operatorUserId },
    update: {},
  });
  const rotatorCreated = existing === null;

  const [ownedLinks, rotatorLinks] = await Promise.all([
    db.engineLink.findMany({
      where: { userId: operatorUserId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.agentRotatorLink.findMany({ where: { rotatorId: rotator.id } }),
  ]);
  const plan = planAddOnlyLinkSync(rotatorLinks, ownedLinks);
  // Raise-only lead weights on existing rows (routing config, never
  // a lowering, never a cap/enabled/position change).
  for (const raise of plan.weightRaises) {
    await db.agentRotatorLink.updateMany({
      where: { rotatorId: rotator.id, engineLinkId: raise.engineLinkId },
      data: { weight: raise.weight },
    });
  }
  if (plan.toAdd.length > 0) {
    await db.agentRotatorLink.createMany({
      data: plan.toAdd.map((l) => ({
        rotatorId: rotator.id,
        engineLinkId: l.engineLinkId,
        position: l.position,
        weight: l.weight,
      })),
    });
  }

  return {
    agentName: barry.name,
    rotatorCreated,
    linksAdded: plan.toAdd.length,
    linksTotal: plan.total,
    leadNames: plan.leadNames,
    leadSource: plan.leadSource,
    ...summarizeBarryProvision({
      gate,
      rotatorEnabled: rotator.enabled,
      linksAdded: plan.toAdd.length,
      linksTotal: plan.total,
      hasDhMediaLink: plan.hasDhMediaLink,
      leadNames: plan.leadNames,
      leadSource: plan.leadSource,
    }),
  };
}
