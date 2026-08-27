/**
 * Persists per-asset resource fingerprints for cross-asset / cross-agent lookup.
 */

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';
import {
  buildResourceDescriptor,
  fingerprintForNode,
  normalizeWorkflowNodeTypeKey,
} from './workflowConfigResourceFingerprint';

import type { NormalizedWorkflow } from './difyDsl/normalizeTypes';

function getRefsTable():
  | typeof import('../database/tables-mysql').workflowConfigAssetResourceRefsTable
  | typeof import('../database/tables-enterprise').workflowConfigAssetResourceRefsTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../database/tables-mysql').workflowConfigAssetResourceRefsTable;
  }
  if (dbType === 'postgres') {
    return require('../database/tables-enterprise').workflowConfigAssetResourceRefsTable;
  }
  return null;
}

function getWorkflowConfigAssetsTable():
  | typeof import('../database/tables-mysql').workflowConfigAssetsTable
  | typeof import('../database/tables-enterprise').workflowConfigAssetsTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../database/tables-mysql').workflowConfigAssetsTable;
  }
  if (dbType === 'postgres') {
    return require('../database/tables-enterprise').workflowConfigAssetsTable;
  }
  return null;
}

function getTargetAgentsTable():
  | typeof import('../database/tables-mysql').targetAgentsTable
  | typeof import('../database/tables-enterprise').targetAgentsTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    return require('../database/tables-mysql').targetAgentsTable;
  }
  if (dbType === 'postgres') {
    return require('../database/tables-enterprise').targetAgentsTable;
  }
  return null;
}

type GroupKey = string;

function groupKey(nodeType: string, fp: string): GroupKey {
  return `${normalizeWorkflowNodeTypeKey(nodeType)}|${fp}`;
}

/**
 * Replace all resource ref rows for an asset from the normalized graph.
 */
export async function syncResourceRefsForAsset(params: {
  organizationId: string;
  assetId: string;
  targetAgentId: string;
  graph: NormalizedWorkflow | null;
}): Promise<void> {
  const table = getRefsTable();
  if (!table) {
    return;
  }

  const { organizationId, assetId, targetAgentId } = params;
  const agentKey = String(targetAgentId ?? '').trim();

  await db.delete(table).where(eq(table.assetId, assetId as any));

  if (!params.graph?.nodes?.length) {
    return;
  }

  const groups = new Map<
    GroupKey,
    { nodeType: string; fp: string; label: string; nodeIds: string[] }
  >();

  for (const node of params.graph.nodes) {
    const fp = fingerprintForNode(node);
    const { label } = buildResourceDescriptor(node);
    const gk = groupKey(node.node_type, fp);
    const cur = groups.get(gk);
    if (cur) {
      cur.nodeIds.push(node.node_id);
    } else {
      groups.set(gk, {
        nodeType: node.node_type,
        fp,
        label,
        nodeIds: [node.node_id],
      });
    }
  }

  const values: Array<{
    id: string;
    organizationId: string;
    assetId: string;
    targetAgentId: string;
    nodeType: string;
    resourceFingerprint: string;
    resourceLabel: string;
    nodeIds: string[];
  }> = [];

  for (const g of groups.values()) {
    values.push({
      id: uuidv4(),
      organizationId,
      assetId,
      targetAgentId: agentKey,
      nodeType: g.nodeType,
      resourceFingerprint: g.fp,
      resourceLabel: g.label.slice(0, 500),
      nodeIds: g.nodeIds,
    });
  }

  if (values.length === 0) {
    return;
  }

  try {
    await db.insert(table).values(
      values.map((v) => ({
        id: v.id,
        organizationId: v.organizationId,
        assetId: v.assetId,
        targetAgentId: v.targetAgentId,
        nodeType: v.nodeType,
        resourceFingerprint: v.resourceFingerprint,
        resourceLabel: v.resourceLabel,
        nodeIds: v.nodeIds,
      })) as any,
    );
  } catch (e) {
    logger.warn('[workflowConfigAssetResourceRefs] sync insert failed', {
      message: e instanceof Error ? e.message : String(e),
      assetId,
    });
  }
}

export type NodeTypeDetailGroup = {
  fingerprint: string;
  label: string;
  nodes: Array<{ nodeId: string; title: string; graphType?: string }>;
  otherAgents: Array<{
    targetAgentId: string;
    agentName: string | null;
    assetId: string;
    assetName: string;
    nodeCount: number;
  }>;
};

export async function getWorkflowAssetNodeTypeDetail(params: {
  organizationId: string;
  assetId: string;
  nodeTypeQuery: string;
}): Promise<
  | {
      ok: true;
      assetName: string;
      nodeType: string;
      groups: NodeTypeDetailGroup[];
    }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_SUPPORTED' | 'BAD_REQUEST'; message: string }
> {
  const assetsTable = getWorkflowConfigAssetsTable();
  const refsTable = getRefsTable();
  if (!assetsTable || !refsTable) {
    return { ok: false, code: 'NOT_SUPPORTED', message: 'Requires MySQL or PostgreSQL' };
  }

  const wanted = String(params.nodeTypeQuery ?? '').trim();
  if (!wanted) {
    return { ok: false, code: 'BAD_REQUEST', message: 'nodeType is required' };
  }
  const wantedNorm = normalizeWorkflowNodeTypeKey(wanted);

  const [row] = await db
    .select()
    .from(assetsTable)
    .where(
      and(
        eq(assetsTable.organizationId, params.organizationId),
        eq(assetsTable.id, params.assetId),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'Asset not found' };
  }

  const graph = row.graphSnapshot as NormalizedWorkflow | null;

  const refCount = await countResourceRefsForAsset(params.assetId);
  if (refCount === 0 && graph?.nodes?.length) {
    const agentScope = String((row as { targetAgentId?: string }).targetAgentId ?? '');
    await syncResourceRefsForAsset({
      organizationId: params.organizationId,
      assetId: params.assetId,
      targetAgentId: agentScope,
      graph,
    });
  }

  if (row.parseStatus !== 'ok' || !graph?.nodes?.length) {
    return {
      ok: true,
      assetName: row.name,
      nodeType: wanted,
      groups: [],
    };
  }

  const matchedNodes = graph.nodes.filter(
    (n) => normalizeWorkflowNodeTypeKey(n.node_type) === wantedNorm,
  );

  if (matchedNodes.length === 0) {
    return {
      ok: true,
      assetName: row.name,
      nodeType: wanted,
      groups: [],
    };
  }

  const fpGroups = new Map<
    string,
    { fingerprint: string; label: string; nodes: NodeTypeDetailGroup['nodes'] }
  >();

  for (const node of matchedNodes) {
    const fp = fingerprintForNode(node);
    const { label } = buildResourceDescriptor(node);
    const g = fpGroups.get(fp);
    const entry = {
      nodeId: node.node_id,
      title: node.title,
      graphType: node.graph_type,
    };
    if (g) {
      g.nodes.push(entry);
    } else {
      fpGroups.set(fp, {
        fingerprint: fp,
        label,
        nodes: [entry],
      });
    }
  }

  const agentsTable = getTargetAgentsTable();
  const groups: NodeTypeDetailGroup[] = [];

  for (const g of fpGroups.values()) {
    const otherRefs = await db
      .select({
        assetId: refsTable.assetId,
        targetAgentId: refsTable.targetAgentId,
        nodeIds: refsTable.nodeIds,
        assetName: assetsTable.name,
      })
      .from(refsTable)
      .innerJoin(assetsTable, eq(refsTable.assetId, assetsTable.id))
      .where(
        and(
          eq(refsTable.organizationId, params.organizationId),
          eq(refsTable.resourceFingerprint, g.fingerprint),
          ne(refsTable.assetId, params.assetId),
        ),
      );

    const byAsset = new Map<
      string,
      { assetId: string; assetName: string; targetAgentId: string; nodeCount: number }
    >();
    for (const r of otherRefs) {
      const aid = String(r.assetId);
      const ids = Array.isArray(r.nodeIds) ? r.nodeIds : [];
      const n = typeof ids === 'object' && Array.isArray(ids) ? ids.length : 0;
      const prev = byAsset.get(aid);
      if (prev) {
        prev.nodeCount += n;
      } else {
        byAsset.set(aid, {
          assetId: aid,
          assetName: String(r.assetName ?? ''),
          targetAgentId: String(r.targetAgentId ?? ''),
          nodeCount: n,
        });
      }
    }

    const agentIds = [
      ...new Set([...byAsset.values()].map((x) => x.targetAgentId).filter(Boolean)),
    ];
    const namesByAgentId = new Map<string, string>();
    if (agentsTable && agentIds.length > 0) {
      const agRows = await db
        .select({ id: agentsTable.id, name: agentsTable.name })
        .from(agentsTable)
        .where(
          and(
            eq(agentsTable.organizationId, params.organizationId),
            inArray(agentsTable.id, agentIds as any),
          ),
        );
      for (const a of agRows) {
        namesByAgentId.set(String(a.id), String(a.name ?? ''));
      }
    }

    const otherAgents: NodeTypeDetailGroup['otherAgents'] = [...byAsset.values()].map((x) => ({
      targetAgentId: x.targetAgentId,
      agentName: x.targetAgentId ? (namesByAgentId.get(x.targetAgentId) ?? null) : null,
      assetId: x.assetId,
      assetName: x.assetName,
      nodeCount: x.nodeCount,
    }));

    otherAgents.sort((a, b) => b.nodeCount - a.nodeCount || a.assetName.localeCompare(b.assetName));

    groups.push({
      fingerprint: g.fingerprint,
      label: g.label,
      nodes: g.nodes,
      otherAgents,
    });
  }

  groups.sort((a, b) => b.nodes.length - a.nodes.length || a.label.localeCompare(b.label));

  return {
    ok: true,
    assetName: row.name,
    nodeType: wanted,
    groups,
  };
}

/**
 * Count existing ref rows for an asset (cheap existence check).
 */
export async function countResourceRefsForAsset(assetId: string): Promise<number> {
  const refsTable = getRefsTable();
  if (!refsTable) {
    return 0;
  }
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(refsTable)
    .where(eq(refsTable.assetId, assetId as any));
  return Number(rows[0]?.n ?? 0);
}
