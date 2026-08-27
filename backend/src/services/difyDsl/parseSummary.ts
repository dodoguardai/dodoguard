import { isMvpKnownType } from './payloads/index';

import type { NormalizedEdge, NormalizedNode, ParseSummary } from './normalizeTypes';

export function buildParseSummary(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  _parseErrors: { level: string }[],
): ParseSummary {
  const node_type_distribution: Record<string, number> = {};
  let unknown_node_type_count = 0;

  for (const n of nodes) {
    const t = n.node_type || 'unknown';
    node_type_distribution[t] = (node_type_distribution[t] ?? 0) + 1;
    if (!isMvpKnownType(t)) {
      unknown_node_type_count++;
    }
  }

  let branch_count = 0;
  let fail_branch_count = 0;
  for (const e of edges) {
    if (e.edge_kind !== 'normal') {
      branch_count++;
    }
    if (e.edge_kind === 'fail_branch') {
      fail_branch_count++;
    }
  }

  let ref_count = 0;
  for (const n of nodes) {
    ref_count += n.refs_in.length;
  }

  return {
    node_count: nodes.length,
    edge_count: edges.length,
    node_type_distribution,
    branch_count,
    fail_branch_count,
    ref_count,
    unknown_node_type_count,
  };
}
