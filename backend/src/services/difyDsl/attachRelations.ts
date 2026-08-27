import type { GraphIndexes } from './buildGraphIndexes';
import type { NormalizedNode, ParseError } from './normalizeTypes';

export function attachRelationsToNodes(
  nodes: NormalizedNode[],
  indexes: GraphIndexes,
  parseErrors: ParseError[],
): void {
  for (const node of nodes) {
    const id = node.node_id;
    const incoming = indexes.inEdges.get(id) ?? [];
    const outgoing = indexes.outEdges.get(id) ?? [];

    node.upstream = [...new Set(incoming.map((e) => e.source).filter(Boolean))];
    node.downstream = [...new Set(outgoing.map((e) => e.target).filter(Boolean))];

    node.branches = outgoing.map((e) => ({
      handle: e.source_handle || '',
      target: e.target,
      edge_kind: e.edge_kind,
    }));
  }

  for (const node of nodes) {
    const nt = node.node_type.replace(/_/g, '-').toLowerCase();
    if (nt !== 'if-else') {
      continue;
    }
    const cases = node.payload.cases;
    if (!Array.isArray(cases)) {
      continue;
    }
    const handles = new Set(node.branches.map((b) => b.handle));
    for (const c of cases) {
      if (typeof c !== 'object' || c === null) {
        continue;
      }
      const caseId = String((c as { case_id?: string }).case_id ?? '');
      if (caseId && !handles.has(caseId)) {
        parseErrors.push({
          level: 'warning',
          node_id: node.node_id,
          field: 'cases',
          message: `If-Else case_id "${caseId}" has no matching outgoing edge handle`,
        });
      }
    }
  }
}
