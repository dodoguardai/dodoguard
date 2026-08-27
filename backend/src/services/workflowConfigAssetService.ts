/**
 * Persistence for workflow_config_assets (P0 — create / list / get).
 */

import { createHash } from 'node:crypto';

import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../database';
import logger from '../logger';
import {
  detectRawFormat,
  parseWorkflowConfigContent,
  WORKFLOW_CONFIG_ASSET_PARSER_VERSION,
  type WorkflowSourceType,
} from './workflowConfigAssetParse';
import { syncResourceRefsForAsset } from './workflowConfigAssetResourceRefsService';

import type { NormalizedWorkflow } from './difyDsl/normalizeTypes';

export const WORKFLOW_CONFIG_RAW_MAX_BYTES = 5 * 1024 * 1024;

type WorkflowAssetRow =
  typeof import('../database/tables-mysql').workflowConfigAssetsTable.$inferSelect;

function getWorkflowConfigAssetsTable():
  | typeof import('../database/tables-mysql').workflowConfigAssetsTable
  | typeof import('../database/tables-enterprise').workflowConfigAssetsTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.workflowConfigAssetsTable;
  }
  if (dbType === 'postgres') {
    const pgTables = require('../database/tables-enterprise');
    return pgTables.workflowConfigAssetsTable;
  }
  return null;
}

function getTargetAgentsTable():
  | typeof import('../database/tables-mysql').targetAgentsTable
  | typeof import('../database/tables-enterprise').targetAgentsTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.targetAgentsTable;
  }
  if (dbType === 'postgres') {
    const pgTables = require('../database/tables-enterprise');
    return pgTables.targetAgentsTable;
  }
  return null;
}

async function assertTargetAgentInOrganization(
  organizationId: string,
  targetAgentId: string,
): Promise<boolean> {
  const agentsTable = getTargetAgentsTable();
  if (!agentsTable) {
    return false;
  }
  const [row] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(and(eq(agentsTable.id, targetAgentId), eq(agentsTable.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

function getAttackTasksTableForAssetLink():
  | typeof import('../database/tables-mysql').attackTasksTable
  | typeof import('../database/tables-enterprise').attackTasksTable
  | null {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.attackTasksTable;
  }
  if (dbType === 'postgres') {
    const pgTables = require('../database/tables-enterprise');
    return pgTables.attackTasksTable;
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Asset IDs referenced by attack tasks for this target agent (metadata.configAssetId),
 * e.g. when creating a task with "save workflow config asset".
 */
async function fetchWorkflowAssetIdsLinkedToTargetAgent(
  organizationId: string,
  targetAgentId: string,
): Promise<string[]> {
  const dbType = getDbType();
  const attackTable = getAttackTasksTableForAssetLink();
  if (!attackTable) {
    return [];
  }

  if (dbType === 'mysql') {
    const [rows] = (await db.execute(sql`
      SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.configAssetId')) AS assetId
      FROM attack_tasks
      WHERE organization_id = ${organizationId}
        AND target_type = 'agent'
        AND JSON_UNQUOTE(JSON_EXTRACT(target_config, '$.agentId')) = ${targetAgentId}
        AND JSON_EXTRACT(metadata, '$.configAssetId') IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.configAssetId')) != ''
    `)) as [unknown, unknown];
    const arr = Array.isArray(rows) ? rows : ((rows as { 0?: unknown[] })?.[0] ?? []);
    const ids = new Set<string>();
    for (const r of arr as { assetId?: string }[]) {
      const id = String(r?.assetId ?? '').trim();
      if (id && UUID_RE.test(id)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  const rows = await db
    .selectDistinct({
      assetId: sql<string>`${attackTable.metadata}->>'configAssetId'`,
    })
    .from(attackTable)
    .where(
      and(
        eq(attackTable.organizationId, organizationId),
        eq(attackTable.targetType, 'agent'),
        sql`${attackTable.targetConfig}->>'agentId' = ${targetAgentId}`,
        sql`${attackTable.metadata}->>'configAssetId' is not null`,
        sql`coalesce(trim(${attackTable.metadata}->>'configAssetId'), '') <> ''`,
      ),
    );

  const ids = new Set<string>();
  for (const r of rows) {
    const id = String(r.assetId ?? '').trim();
    if (id && UUID_RE.test(id)) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function sha256HexOfUtf8(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function maybeSyncResourceRefsForRow(
  organizationId: string,
  assetId: string,
  targetAgentKey: string,
  row: WorkflowAssetRow,
): Promise<void> {
  if (row.parseStatus !== 'ok' || !row.graphSnapshot) {
    return;
  }
  try {
    await syncResourceRefsForAsset({
      organizationId,
      assetId,
      targetAgentId: String((row as { targetAgentId?: string }).targetAgentId ?? targetAgentKey),
      graph: row.graphSnapshot as NormalizedWorkflow,
    });
  } catch {
    // best-effort index for cross-agent resource view
  }
}

function mapRowToApi(
  row: WorkflowAssetRow,
  options: { includeGraph: boolean; includeRaw: boolean },
) {
  const agentScope =
    'targetAgentId' in row &&
    String((row as { targetAgentId?: string }).targetAgentId ?? '').trim() !== ''
      ? String((row as { targetAgentId?: string }).targetAgentId)
      : undefined;
  const base = {
    id: String(row.id),
    organizationId: String(row.organizationId),
    createdByUserId: String(row.createdByUserId),
    targetAgentId: agentScope,
    name: row.name,
    sourceType: row.sourceType,
    fileName: row.fileName ?? undefined,
    contentHash: row.contentHash,
    rawFormat: row.rawFormat,
    parseStatus: row.parseStatus,
    parseError: row.parseError ?? undefined,
    parseSummary: row.parseSummary ?? undefined,
    parserVersion: row.parserVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (options.includeGraph) {
    return {
      ...base,
      graphSnapshot: row.graphSnapshot ?? undefined,
      rawContent: options.includeRaw ? row.rawContent : undefined,
    };
  }
  return {
    ...base,
    graphSnapshot: undefined,
    rawContent: options.includeRaw ? row.rawContent : undefined,
  };
}

export async function createWorkflowConfigAsset(params: {
  organizationId: string;
  userId: string;
  raw: string;
  name?: string;
  fileName?: string;
  sourceTypeHint?: WorkflowSourceType | 'auto';
  /** When set, asset is listed under that target agent; dedup is per (org, source, hash, agent). */
  targetAgentId?: string | null;
}): Promise<
  | { ok: true; deduplicated: boolean; asset: ReturnType<typeof mapRowToApi> }
  | { ok: false; code: string; message: string }
> {
  const table = getWorkflowConfigAssetsTable();
  if (!table) {
    return {
      ok: false,
      code: 'NOT_SUPPORTED',
      message: 'Workflow config assets require MySQL or PostgreSQL',
    };
  }

  const rawTrimmed = String(params.raw ?? '').trim();
  if (!rawTrimmed) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'raw content is required' };
  }
  if (Buffer.byteLength(rawTrimmed, 'utf8') > WORKFLOW_CONFIG_RAW_MAX_BYTES) {
    return {
      ok: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: `raw content exceeds ${WORKFLOW_CONFIG_RAW_MAX_BYTES} bytes`,
    };
  }

  const rawFormat = detectRawFormat(rawTrimmed);

  let targetAgentKey = '';
  const tidRaw = params.targetAgentId != null ? String(params.targetAgentId).trim() : '';
  if (tidRaw) {
    if (!UUID_RE.test(tidRaw)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'targetAgentId must be a UUID' };
    }
    const agentOk = await assertTargetAgentInOrganization(params.organizationId, tidRaw);
    if (agentOk) {
      targetAgentKey = tidRaw;
    } else {
      // Still persist the export as an org-wide asset so workflow library is populated; agent-scoped lists use task linkage.
      logger.warn('[workflowConfigAssetService] target agent not in org; saving asset org-wide', {
        organizationId: params.organizationId,
        targetAgentId: tidRaw,
      });
      targetAgentKey = '';
    }
  }

  const parsed = parseWorkflowConfigContent(
    rawTrimmed,
    params.sourceTypeHint === undefined || params.sourceTypeHint === 'auto'
      ? 'auto'
      : params.sourceTypeHint,
  );
  const sourceType: WorkflowSourceType = parsed.sourceType;
  const contentHash = sha256HexOfUtf8(rawTrimmed);

  const [existing] = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.organizationId, params.organizationId),
        eq(table.sourceType, sourceType),
        eq(table.contentHash, contentHash),
        eq((table as any).targetAgentId, targetAgentKey),
      ),
    )
    .limit(1);

  if (existing) {
    await maybeSyncResourceRefsForRow(
      params.organizationId,
      String(existing.id),
      targetAgentKey,
      existing as WorkflowAssetRow,
    );
    return {
      ok: true,
      deduplicated: true,
      asset: mapRowToApi(existing as WorkflowAssetRow, { includeGraph: true, includeRaw: true }),
    };
  }

  const id = uuidv4();
  const displayName =
    (params.name && params.name.trim()) ||
    (params.fileName && params.fileName.trim()) ||
    `workflow-config-${id.slice(0, 8)}`;

  const parseStatus = parsed.parseStatus === 'ok' ? 'ok' : 'failed';
  const parserVersion = WORKFLOW_CONFIG_ASSET_PARSER_VERSION;
  const parseSummaryJson =
    parsed.parseSummary ??
    (parsed.parseStatus === 'failed'
      ? {
          parserVersion,
          sourceType,
          parseError: parsed.parseError ?? 'Parse failed',
        }
      : null);

  const graphJson =
    parsed.parseStatus === 'ok' && parsed.graphSnapshot ? parsed.graphSnapshot : null;

  try {
    await db.insert(table).values({
      id,
      organizationId: params.organizationId,
      createdByUserId: params.userId,
      targetAgentId: targetAgentKey,
      name: displayName,
      sourceType,
      fileName: params.fileName?.trim() || null,
      contentHash,
      rawFormat,
      rawContent: rawTrimmed,
      parseStatus,
      parseError: parsed.parseError ?? null,
      parseSummary: parseSummaryJson,
      graphSnapshot: graphJson,
      parserVersion,
    } as any);

    const [inserted] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!inserted) {
      return {
        ok: false,
        code: 'INSERT_FAILED',
        message: 'Could not read inserted workflow config asset',
      };
    }

    await maybeSyncResourceRefsForRow(
      params.organizationId,
      id,
      targetAgentKey,
      inserted as WorkflowAssetRow,
    );

    return {
      ok: true,
      deduplicated: false,
      asset: mapRowToApi(inserted as WorkflowAssetRow, { includeGraph: true, includeRaw: true }),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[workflowConfigAssetService] insert failed', { error: msg });
    if (msg.includes('Duplicate') || msg.includes('duplicate') || msg.includes('UNIQUE')) {
      const [again] = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.organizationId, params.organizationId),
            eq(table.sourceType, sourceType),
            eq(table.contentHash, contentHash),
            eq((table as any).targetAgentId, targetAgentKey),
          ),
        )
        .limit(1);
      if (again) {
        await maybeSyncResourceRefsForRow(
          params.organizationId,
          String(again.id),
          targetAgentKey,
          again as WorkflowAssetRow,
        );
        return {
          ok: true,
          deduplicated: true,
          asset: mapRowToApi(again as WorkflowAssetRow, { includeGraph: true, includeRaw: true }),
        };
      }
    }
    return { ok: false, code: 'INSERT_FAILED', message: msg };
  }
}

export async function listWorkflowConfigAssets(params: {
  organizationId: string;
  limit: number;
  offset: number;
  sourceType?: string;
  q?: string;
  /** When set, only assets linked from this agent's attack tasks (metadata.configAssetId). */
  targetAgentId?: string;
}): Promise<
  | {
      ok: true;
      items: Array<ReturnType<typeof mapRowToApi> & { nodeCount?: number }>;
      total: number;
    }
  | { ok: false; code: string; message: string }
> {
  const table = getWorkflowConfigAssetsTable();
  if (!table) {
    return {
      ok: false,
      code: 'NOT_SUPPORTED',
      message: 'Workflow config assets require MySQL or PostgreSQL',
    };
  }

  const conditions = [eq(table.organizationId, params.organizationId)];
  if (params.sourceType) {
    conditions.push(eq(table.sourceType, params.sourceType));
  }
  if (params.q?.trim()) {
    const pattern = `%${params.q.trim()}%`;
    conditions.push(or(like(table.name, pattern), like(table.fileName, pattern))!);
  }

  if (params.targetAgentId?.trim()) {
    const aid = params.targetAgentId.trim();
    const linkedIds = await fetchWorkflowAssetIdsLinkedToTargetAgent(params.organizationId, aid);
    const scopedToAgent = eq((table as any).targetAgentId, aid);
    if (linkedIds.length > 0) {
      conditions.push(or(scopedToAgent, inArray(table.id, linkedIds))!);
    } else {
      conditions.push(scopedToAgent);
    }
  }

  const whereClause = and(...conditions);

  const countRows = await db.select({ n: sql<number>`count(*)` }).from(table).where(whereClause);
  const total = Number(countRows[0]?.n ?? 0);

  const rows = await db
    .select()
    .from(table)
    .where(whereClause)
    .orderBy(desc(table.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  const items = rows.map((row) => {
    const api = mapRowToApi(row as WorkflowAssetRow, { includeGraph: false, includeRaw: false });
    const summary = row.parseSummary as { dslParseSummary?: { node_count?: number } } | null;
    const nodeCount =
      typeof summary?.dslParseSummary?.node_count === 'number'
        ? summary.dslParseSummary.node_count
        : undefined;
    return { ...api, nodeCount };
  });

  return { ok: true, items, total };
}

export async function getWorkflowConfigAssetById(params: {
  organizationId: string;
  id: string;
  includeGraph: boolean;
  includeRaw: boolean;
}): Promise<
  | { ok: true; asset: ReturnType<typeof mapRowToApi> }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_SUPPORTED'; message: string }
> {
  const table = getWorkflowConfigAssetsTable();
  if (!table) {
    return {
      ok: false,
      code: 'NOT_SUPPORTED',
      message: 'Workflow config assets require MySQL or PostgreSQL',
    };
  }

  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.organizationId, params.organizationId), eq(table.id, params.id)))
    .limit(1);

  if (!row) {
    return { ok: false, code: 'NOT_FOUND', message: 'Workflow config asset not found' };
  }

  return {
    ok: true,
    asset: mapRowToApi(row as WorkflowAssetRow, {
      includeGraph: params.includeGraph,
      includeRaw: params.includeRaw,
    }),
  };
}
