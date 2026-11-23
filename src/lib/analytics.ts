export type TimedRow = { createdAt: Date };
export function countSince(rows: TimedRow[], since: Date) {
  return rows.filter((row) => row.createdAt >= since).length;
}

export function summarizePageViews(rows: Array<{ path: string; referrerHost: string | null }>) {
  const paths = new Map<string, number>();
  const referrers = new Map<string, number>();
  for (const row of rows) {
    paths.set(row.path, (paths.get(row.path) ?? 0) + 1);
    if (row.referrerHost) referrers.set(row.referrerHost, (referrers.get(row.referrerHost) ?? 0) + 1);
  }
  const top = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name, count]) => ({ name, count }));
  return { views: rows.length, uniquePaths: paths.size, topPaths: top(paths), topReferrers: top(referrers) };
}

export function aggregateAgentActivity(hops: Array<{ agentId: string | null }>, agents: Array<{ id: string; name: string }>) {
  return agents.map((agent) => ({
    agentId: agent.id,
    name: agent.name,
    hops: hops.filter((hop) => hop.agentId === agent.id).length,
  })).filter((row) => row.hops).sort((a, b) => b.hops - a.hops);
}
