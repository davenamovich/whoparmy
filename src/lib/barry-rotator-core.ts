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
 * - DH MEDIA ONLY (Dave, 2026-11-22 — supersedes the 2026-11-21
 *   lead rule for Barry's rotator): Barry's Ride rotator carries
 *   ONLY the operator's DH Media link(s) (DH_MEDIA_PARTNER_KEYS).
 *   Every other saved link — Muse, Agent37, Fish, Temu, any other
 *   P&R offer — stays on Barry's profile CTA strip where it
 *   belongs, but NEVER enters this rotation. The sync therefore
 *   both adds missing DH Media links AND prunes any non-DH row
 *   already in the rotator (earlier syncs added the full saved
 *   set; add-only could never undo that). DH rows already in the
 *   rotator keep their cap / position / enabled state untouched.
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

/** True only for Barry's DH Media gate link keys — the sole
 *  partners allowed in Barry's Ride rotator (Dave, 2026-11-22). */
export function isBarryRotatorPartner(partner: string): boolean {
  return DH_MEDIA_PARTNER_KEYS.includes(partner);
}

/** Weight every link in Barry's rotator is created with — the
 *  schema default, stated here so the sync plan is explicit. */
export const STANDARD_WEIGHT = 1;

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
  /** New AgentRotatorLink rows to create: the operator's DH Media
   *  link(s) not already in the rotator, in saved order. */
  toAdd: Array<{ engineLinkId: string; position: number; weight: number }>;
  /** Existing rows to DELETE: anything that is not a DH Media
   *  link (a known non-DH partner, or a row whose link is no
   *  longer among the operator's saved links and so cannot be
   *  verified as DH Media). Barry's rotator is DH-only, so an
   *  unverifiable row does not stay. */
  toRemove: Array<{ engineLinkId: string }>;
  /** Total links in the rotator after the sync. */
  total: number;
  /** Any of the operator's saved links is the DH Media gate link. */
  hasDhMediaLink: boolean;
}

/**
 * The DH-only sync plan (Dave, 2026-11-22): only the operator's
 * DH Media EngineLinks may sit in Barry's rotator. Missing DH
 * links append after the current maximum position; every existing
 * non-DH (or unverifiable) row is pruned; DH rows already present
 * keep their cap, position, weight and enabled state untouched.
 */
export function planAddOnlyLinkSync(
  existing: ExistingRotatorLinkInput[],
  owned: OwnedLinkInput[],
): LinkSyncPlan {
  const dhOwned = owned.filter((l) => isBarryRotatorPartner(l.partner));
  const dhIds = new Set(dhOwned.map((l) => l.id));
  const inRotator = new Set(existing.map((l) => l.engineLinkId));
  let nextPosition = existing.reduce((max, l) => Math.max(max, l.position), -1) + 1;

  const toRemove = existing
    .filter((row) => !dhIds.has(row.engineLinkId))
    .map((row) => ({ engineLinkId: row.engineLinkId }));

  const toAdd: Array<{ engineLinkId: string; position: number; weight: number }> = [];
  for (const link of dhOwned.filter((l) => !inRotator.has(l.id))) {
    toAdd.push({ engineLinkId: link.id, position: nextPosition, weight: STANDARD_WEIGHT });
    nextPosition += 1;
  }
  return {
    toAdd,
    toRemove,
    total: existing.length - toRemove.length + toAdd.length,
    hasDhMediaLink: dhOwned.length > 0,
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
  linksRemoved?: number;
  linksTotal: number;
  hasDhMediaLink: boolean;
}): BarryProvisionSummary {
  if (!input.gate.ok) {
    return { state: input.gate.state, detail: input.gate.detail };
  }
  if (input.linksTotal === 0) {
    return {
      state: "no-links",
      detail:
        "Barry's rotator is created but has no destinations — Barry's Ride is DH Media only, and no DH Media link is saved yet. Save your DH Media link, then provision again. Your other saved links stay off this rotator by design.",
    };
  }
  if (!input.rotatorEnabled) {
    return {
      state: "disabled",
      detail: `Barry's rotator exists with ${input.linksTotal} destination(s) but is switched off — provisioning left its on/off state untouched. Re-enable it in the rotator settings to open the Ride door.`,
    };
  }
  const added =
    input.linksAdded > 0 ? ` ${input.linksAdded} DH Media link(s) were added to the rotation this run.` : "";
  const removed =
    input.linksRemoved && input.linksRemoved > 0
      ? ` ${input.linksRemoved} non-DH link(s) were removed from the rotation this run.`
      : "";
  return {
    state: "enabled",
    detail: `Barry's rotator is live with ${input.linksTotal} destination(s) — DH Media only.${added}${removed} Your DH Media link is the rotation.`,
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
 * the missing DH Media link(s), prunes any non-DH row left by an
 * earlier full-set sync, and never resets a DH row's cap or flips
 * the rotator's enabled switch.
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
    deleteMany(args: {
      where: { rotatorId: string; engineLinkId: { in: string[] } };
    }): Promise<{ count: number }>;
  };
}

export interface EnsureBarryRotatorResult extends BarryProvisionSummary {
  agentName: string | null;
  rotatorCreated: boolean;
  linksAdded: number;
  /** Non-DH rows pruned from the rotation on this run. */
  linksRemoved: number;
  linksTotal: number;
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
      linksRemoved: 0,
      linksTotal: 0,
      ...summarizeBarryProvision({
        gate,
        rotatorEnabled: false,
        linksAdded: 0,
        linksRemoved: 0,
        linksTotal: 0,
        hasDhMediaLink: false,
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
  // DH-only prune: remove every non-DH row an earlier sync added.
  if (plan.toRemove.length > 0) {
    await db.agentRotatorLink.deleteMany({
      where: { rotatorId: rotator.id, engineLinkId: { in: plan.toRemove.map((l) => l.engineLinkId) } },
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
    linksRemoved: plan.toRemove.length,
    linksTotal: plan.total,
    ...summarizeBarryProvision({
      gate,
      rotatorEnabled: rotator.enabled,
      linksAdded: plan.toAdd.length,
      linksRemoved: plan.toRemove.length,
      linksTotal: plan.total,
      hasDhMediaLink: plan.hasDhMediaLink,
    }),
  };
}
