/**
 * Heuristic mapping from config-audit finding locations to inventory nodes (Dify + Coze pointers).
 */

import type { DifyConfigAuditFinding } from '@/services/api/dify-config-audit';
import type { DifyNodeInventoryItem } from '@/services/api/dify-config-audit';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function nodeIndexFromLogicalPointer(pointer: string | undefined): string | undefined {
  if (!pointer) {
    return undefined;
  }
  const mDify = pointer.match(/\/workflow\/graph\/nodes\/(\d+)\//i);
  if (mDify) {
    return mDify[1];
  }
  const mCoze = pointer.match(/\/nodes\/(\d+)(?:\/|$)/i);
  return mCoze?.[1];
}

export function locationMatchesNode(location: string, node: DifyNodeInventoryItem): boolean {
  const loc = location.toLowerCase();
  const nid = node.id.toLowerCase();
  if (nid && loc.includes(nid)) {
    return true;
  }
  const graphIdx = nodeIndexFromLogicalPointer(node.logicalPointer);
  if (graphIdx) {
    const norm = location.replace(/\\/g, '/').toLowerCase();
    if (norm.includes(`/workflow/graph/nodes/${graphIdx}/`)) {
      return true;
    }
    if (
      norm.includes(`/nodes/${graphIdx}/`) ||
      norm.includes(`/nodes/${graphIdx}（`) ||
      norm.endsWith(`/nodes/${graphIdx}`)
    ) {
      return true;
    }
    if (norm.includes(`nodes/${graphIdx}/`) || norm.includes(`nodes/${graphIdx}/data`)) {
      return true;
    }
  }
  if (node.logicalPointer) {
    const lp = node.logicalPointer.toLowerCase();
    if (loc.includes(lp)) {
      return true;
    }
    const withoutData = lp.replace(/\/data$/i, '');
    if (withoutData.length > 12 && loc.includes(withoutData)) {
      return true;
    }
  }
  if (node.title) {
    const t = node.title.trim().toLowerCase();
    const sliceLen = Math.min(40, Math.max(4, t.length));
    if (t.length >= 4 && loc.includes(t.slice(0, sliceLen))) {
      return true;
    }
  }
  const uuids = location.match(UUID_RE) ?? [];
  for (const u of uuids) {
    if (u.toLowerCase() === nid) {
      return true;
    }
  }
  return false;
}

export function partitionFindingsByNode(
  findings: DifyConfigAuditFinding[],
  nodes: DifyNodeInventoryItem[],
): { byNodeId: Map<string, DifyConfigAuditFinding[]>; unmatched: DifyConfigAuditFinding[] } {
  const byNodeId = new Map<string, DifyConfigAuditFinding[]>();
  for (const n of nodes) {
    byNodeId.set(n.id, []);
  }
  const unmatched: DifyConfigAuditFinding[] = [];

  for (const f of findings) {
    let assigned = false;
    for (const n of nodes) {
      if (locationMatchesNode(f.location, n)) {
        byNodeId.get(n.id)!.push(f);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      unmatched.push(f);
    }
  }

  return { byNodeId, unmatched };
}

const SEVERITY_RANK: Record<DifyConfigAuditFinding['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function highestSeverity(
  findings: DifyConfigAuditFinding[],
): DifyConfigAuditFinding['severity'] | null {
  if (findings.length === 0) {
    return null;
  }
  let best = findings[0]!.severity;
  for (let i = 1; i < findings.length; i++) {
    const s = findings[i]!.severity;
    if (SEVERITY_RANK[s] > SEVERITY_RANK[best]) {
      best = s;
    }
  }
  return best;
}
