/**
 * ─── BANKR BINDINGS — admin view model (pure core, 2026-11-21) ────
 *
 * The settlements card's "Bindings — synced" section, as pure
 * functions so the grouping/labeling is unit-testable without a DB
 * or a browser. The API route enriches raw IdentityLink /
 * AgentWallet rows with display names (userDisplayName below — the
 * same name → whopUsername convention as lib/agent-profile.ts, with
 * the email prefix as an admin-only last resort); this module
 * groups the enriched rows for display:
 *
 *   - "Your wallet": the requesting operator's own identity links,
 *     split by kind, flagged when the EVM address is the known
 *     house Bankr wallet.
 *   - "Agent wallets": every AgentWallet row grouped by agent —
 *     this is the half the card used to throw away (it read only
 *     `links`), which is why Barry's bindings never rendered.
 *   - "Other bindings": everyone else's identity links, compact.
 *
 * Display only. Nothing here binds, resolves, or moves money.
 */

export interface UserNameParts {
  name: string | null;
  whopUsername: string | null;
  email: string;
}

/** Display name for a user: name → whopUsername → email prefix. */
export function userDisplayName(user: UserNameParts | null | undefined): string {
  if (!user) return "Whop Army member";
  const name = user.name?.trim();
  if (name) return name;
  const whop = user.whopUsername?.trim();
  if (whop) return whop;
  const prefix = user.email?.split("@")[0]?.trim();
  return prefix || "Whop Army member";
}

/** Middle-truncate a long value (wallet address) for display. */
export function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export interface EnrichedLink {
  kind: string;
  value: string;
  userId: string;
  userName: string;
  isOperator: boolean;
  verifiedAt: string | null;
}

export interface EnrichedWallet {
  agentId: string;
  userId: string;
  chain: string;
  address: string;
  source: string;
  verifiedAt: string | null;
  agentName: string;
  agentSlug: string | null;
  ownerName: string;
}

export interface YourWallet {
  evm: EnrichedLink | null;
  solana: EnrichedLink | null;
  bankrRef: EnrichedLink | null;
  /** True when the operator's bound EVM address IS the house Bankr wallet. */
  isHouse: boolean;
  hasAny: boolean;
}

export interface AgentWalletGroup {
  agentId: string;
  agentName: string;
  agentSlug: string | null;
  ownerUserId: string;
  ownerName: string;
  wallets: EnrichedWallet[];
}

export interface BindingsView {
  yours: YourWallet;
  agents: AgentWalletGroup[];
  others: EnrichedLink[];
}

export function groupBindings(input: {
  links: EnrichedLink[];
  wallets: EnrichedWallet[];
  operatorUserId: string;
  houseEvm: string;
}): BindingsView {
  const { links, wallets, operatorUserId, houseEvm } = input;
  const mine = links.filter((l) => l.userId === operatorUserId);
  const byKind = (kind: string) => mine.find((l) => l.kind === kind) ?? null;
  const evm = byKind("wallet_evm");
  const yours: YourWallet = {
    evm,
    solana: byKind("wallet_solana"),
    bankrRef: byKind("bankr_ref"),
    isHouse: evm !== null && evm.value.toLowerCase() === houseEvm.toLowerCase(),
    hasAny: mine.length > 0,
  };

  const byAgent = new Map<string, AgentWalletGroup>();
  for (const w of wallets) {
    let group = byAgent.get(w.agentId);
    if (!group) {
      group = {
        agentId: w.agentId,
        agentName: w.agentName,
        agentSlug: w.agentSlug,
        ownerUserId: w.userId,
        ownerName: w.ownerName,
        wallets: [],
      };
      byAgent.set(w.agentId, group);
    }
    group.wallets.push(w);
  }
  const agents = [...byAgent.values()].sort((a, b) =>
    a.agentName < b.agentName ? -1 : a.agentName > b.agentName ? 1 : 0,
  );

  const others = links.filter((l) => l.userId !== operatorUserId);
  return { yours, agents, others };
}

/** Shape of the bind-house summary (lib/wallet-bind-server.ts). */
export interface HouseBindSummaryView {
  identity: Array<{ kind: string; value: string; status: string; reason?: string | null }>;
  agent: {
    agentId: string;
    agentName?: string | null;
    wallets: Array<{ chain: string; status: string; reason?: string | null }>;
  } | null;
  agentSkipped: string | null;
}

const KIND_LABEL: Record<string, string> = {
  wallet_evm: "EVM wallet",
  wallet_solana: "Solana wallet",
  bankr_ref: "Bankr ref code",
};

function statusText(status: string, reason?: string | null): string {
  if (status === "bound") return "bound ✓";
  if (status === "existing") return "already bound (no change)";
  return reason ? `${status} — ${reason}` : status;
}

/**
 * Render the bind-house POST summary as plain lines for the card:
 * what was bound, what was already bound, and — crucially — what
 * was skipped and why (the old card discarded this and showed a
 * generic "bound" notice even when Barry was skipped).
 */
export function describeBindHouseSummary(house: HouseBindSummaryView): string[] {
  const lines: string[] = [];
  for (const entry of house.identity) {
    lines.push(`${KIND_LABEL[entry.kind] ?? entry.kind} ${entry.value}: ${statusText(entry.status, entry.reason)}`);
  }
  if (house.agent) {
    const label = house.agent.agentName?.trim() || `Agent ${house.agent.agentId}`;
    for (const w of house.agent.wallets) {
      lines.push(`${label} · ${w.chain} payout wallet: ${statusText(w.status, w.reason)}`);
    }
  }
  if (house.agentSkipped) {
    lines.push(`Barry skipped — ${house.agentSkipped}`);
  }
  return lines;
}
