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
 *   in the rotator keep their row (weight / cap / position / enabled
 *   state untouched); saved links not yet in the rotator append
 *   after the current maximum position. Nothing is removed, ever:
 *   the member PUT flow replaces link sets, provisioning must not.
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
}

export interface ExistingRotatorLinkInput {
  engineLinkId: string;
  position: number;
}

export interface LinkSyncPlan {
  /** New AgentRotatorLink rows to create, in order. */
  toAdd: Array<{ engineLinkId: string; position: number }>;
  /** Total links in the rotator after the sync. */
  total: number;
  /** Any of the operator's saved links is the DH Media gate link. */
  hasDhMediaLink: boolean;
}

/**
 * The add-only sync plan: every saved EngineLink not already in the
 * rotator is appended after the current maximum position (saved
 * links arrive in the caller's stable order — createdAt, then id).
 * Existing rows are never in the plan: their weight, cap, position
 * and enabled state survive provisioning untouched.
 */
export function planAddOnlyLinkSync(
  existing: ExistingRotatorLinkInput[],
  owned: OwnedLinkInput[],
): LinkSyncPlan {
  const inRotator = new Set(existing.map((l) => l.engineLinkId));
  let nextPosition = existing.reduce((max, l) => Math.max(max, l.position), -1) + 1;
  const toAdd: Array<{ engineLinkId: string; position: number }> = [];
  for (const link of owned) {
    if (inRotator.has(link.id)) continue;
    toAdd.push({ engineLinkId: link.id, position: nextPosition });
    nextPosition += 1;
  }
  return {
    toAdd,
    total: existing.length + toAdd.length,
    hasDhMediaLink: owned.some((l) => DH_MEDIA_PARTNER_KEYS.includes(l.partner)),
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
}): BarryProvisionSummary {
  if (!input.gate.ok) {
    return { state: input.gate.state, detail: input.gate.detail };
  }
  if (input.linksTotal === 0) {
    return {
      state: "no-links",
      detail:
        "Barry's rotator is created but has no destinations — no saved links to rotate yet. Links come only from your saved EngineLinks: save your DH Media link on /bridge, then provision again.",
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
  const dh = input.hasDhMediaLink
    ? " Your DH Media link is in the rotation."
    : " Note: no DH Media link is saved, so Barry's gate link is not in the rotation.";
  return {
    state: "enabled",
    detail: `Barry's rotator is live with ${input.linksTotal} destination(s).${added}${dh}`,
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
 * weight/cap, or flips the rotator's enabled switch.
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
    }): Promise<Array<{ id: string; partner: string; createdAt: Date }>>;
  };
  agentRotatorLink: {
    findMany(args: {
      where: { rotatorId: string };
    }): Promise<Array<{ engineLinkId: string; position: number }>>;
    createMany(args: {
      data: Array<{ rotatorId: string; engineLinkId: string; position: number }>;
    }): Promise<{ count: number }>;
  };
}

export interface EnsureBarryRotatorResult extends BarryProvisionSummary {
  agentName: string | null;
  rotatorCreated: boolean;
  linksAdded: number;
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
      linksTotal: 0,
      ...summarizeBarryProvision({
        gate,
        rotatorEnabled: false,
        linksAdded: 0,
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
  if (plan.toAdd.length > 0) {
    await db.agentRotatorLink.createMany({
      data: plan.toAdd.map((l) => ({ rotatorId: rotator.id, engineLinkId: l.engineLinkId, position: l.position })),
    });
  }

  return {
    agentName: barry.name,
    rotatorCreated,
    linksAdded: plan.toAdd.length,
    linksTotal: plan.total,
    ...summarizeBarryProvision({
      gate,
      rotatorEnabled: rotator.enabled,
      linksAdded: plan.toAdd.length,
      linksTotal: plan.total,
      hasDhMediaLink: plan.hasDhMediaLink,
    }),
  };
}
