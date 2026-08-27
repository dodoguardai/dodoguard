import { edgeKindFromSourceHandle } from './edgeKind';
import { asString, isRecord } from './utils';

import type { NormalizedEdge, ParseError } from './normalizeTypes';

export type GraphIndexes = {
  nodeIds: Set<string>;
  outEdges: Map<string, NormalizedEdge[]>;
  inEdges: Map<string, NormalizedEdge[]>;
  normalizedEdges: NormalizedEdge[];
};

function edgeId(e: Record<string, unknown>, i: number): string {
  const id = asString(e.id);
  return id && id.length > 0 ? id : `__edge_${i}`;
}

export function normalizeRawEdges(
  rawEdges: unknown[],
  nodeIds: Set<string>,
  parseErrors: ParseError[],
): NormalizedEdge[] {
  const out: NormalizedEdge[] = [];
  rawEdges.forEach((e, i) => {
    if (!isRecord(e)) {
      parseErrors.push({
        level: 'warning',
        field: `edges[${i}]`,
        message: 'Edge is not an object; skipped',
      });
      return;
    }
    const source = asString(e.source) ?? '';
    const target = asString(e.target) ?? '';
    const sourceHandle = asString(e.sourceHandle) ?? asString(e.source_handle) ?? '';
    const targetHandle = asString(e.targetHandle) ?? asString(e.target_handle) ?? '';
    if (source && !nodeIds.has(source)) {
      parseErrors.push({
        level: 'warning',
        field: 'source',
        message: `Edge source "${source}" not found in nodes`,
      });
    }
    if (target && !nodeIds.has(target)) {
      parseErrors.push({
        level: 'warning',
        field: 'target',
        message: `Edge target "${target}" not found in nodes`,
      });
    }
    const edgeKind = edgeKindFromSourceHandle(sourceHandle);
    out.push({
      edge_id: edgeId(e, i),
      source,
      target,
      source_handle: sourceHandle,
      target_handle: targetHandle,
      source_type: asString(e.sourceType) ?? asString(e.source_type),
      target_type: asString(e.targetType) ?? asString(e.target_type),
      is_in_loop: Boolean(e.isInLoop ?? e.is_in_loop),
      is_in_iteration: Boolean(e.isInIteration ?? e.is_in_iteration),
      edge_kind: edgeKind,
    });
  });
  return out;
}

export function buildGraphIndexes(normalizedEdges: NormalizedEdge[]): GraphIndexes {
  const nodeIds = new Set<string>();
  const outEdges = new Map<string, NormalizedEdge[]>();
  const inEdges = new Map<string, NormalizedEdge[]>();

  for (const edge of normalizedEdges) {
    if (edge.source) {
      nodeIds.add(edge.source);
      if (!outEdges.has(edge.source)) {
        outEdges.set(edge.source, []);
      }
      outEdges.get(edge.source)!.push(edge);
    }
    if (edge.target) {
      nodeIds.add(edge.target);
      if (!inEdges.has(edge.target)) {
        inEdges.set(edge.target, []);
      }
      inEdges.get(edge.target)!.push(edge);
    }
  }

  return {
    nodeIds,
    outEdges,
    inEdges,
    normalizedEdges,
  };
}

/** Rebuild indexes including all node ids from workflow nodes (not only edge endpoints). */
export function mergeNodeIdsIntoSet(base: Set<string>, nodeIds: string[]): Set<string> {
  const s = new Set(base);
  for (const id of nodeIds) {
    s.add(id);
  }
  return s;
}
