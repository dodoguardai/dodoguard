import type { NormalizedEdgeKind } from './normalizeTypes';

/**
 * Spec 8.2: classify edge from source_handle.
 */
export function edgeKindFromSourceHandle(
  sourceHandle: string | undefined | null,
): NormalizedEdgeKind {
  const h = String(sourceHandle ?? '').trim();
  if (!h) {
    return 'normal';
  }
  const lower = h.toLowerCase();
  if (lower === 'true') {
    return 'branch_true';
  }
  if (lower === 'false') {
    return 'branch_false';
  }
  if (lower === 'fail-branch' || lower === 'fail_branch') {
    return 'fail_branch';
  }
  return 'branch_custom';
}
