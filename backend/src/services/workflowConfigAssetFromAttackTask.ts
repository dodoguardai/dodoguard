/**
 * When creating an attack task with config audit YAML/JSON, optionally persist the same payload as a workflow_config_assets row.
 */

import { getDbType } from '../database';
import logger from '../logger';
import { createWorkflowConfigAsset } from './workflowConfigAssetService';

function normalizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}

/** Normalize YAML/JSON export field from API (string or parsed object from some clients). */
export function configAuditExportToString(v: unknown): string {
  if (v == null) {
    return '';
  }
  if (typeof v === 'string') {
    return v.trim();
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  return String(v).trim();
}

/** Merge optional top-level `configAudit` from POST body into task metadata (keeps asset save reliable if nested metadata is stripped). */
export function mergeTopLevelConfigAuditIntoTaskMetadata(
  metadata: unknown,
  topLevel: { yaml?: unknown; json?: unknown; fileName?: unknown } | undefined,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (!topLevel || typeof topLevel !== 'object') {
    return base;
  }
  const yaml = configAuditExportToString(topLevel.yaml);
  const json = configAuditExportToString(topLevel.json);
  if (!yaml && !json) {
    return base;
  }
  const prev =
    base.configAudit && typeof base.configAudit === 'object' && !Array.isArray(base.configAudit)
      ? (base.configAudit as Record<string, unknown>)
      : {};
  const fn =
    typeof topLevel.fileName === 'string' && topLevel.fileName.trim()
      ? topLevel.fileName.trim()
      : typeof topLevel.fileName === 'number' || typeof topLevel.fileName === 'boolean'
        ? String(topLevel.fileName)
        : '';
  base.configAudit = {
    ...prev,
    ...(yaml ? { yaml } : {}),
    ...(json ? { json } : {}),
    ...(fn ? { fileName: fn } : {}),
  };
  return base;
}

/**
 * If `saveWorkflowConfigAsset` is true and `metadata.configAudit` has non-empty yaml or json,
 * upserts workflow_config_assets and sets `metadata.configAssetId` (+ optional dedup flag).
 */
export async function mergeWorkflowConfigAssetIntoTaskMetadata(params: {
  organizationId: string;
  userId: string;
  metadata: unknown;
  platformFamily?: string | null;
  saveWorkflowConfigAsset?: boolean;
  /** When saving an asset for an agent-scoped task, ties the row to that target agent. */
  targetAgentId?: string | null;
}): Promise<Record<string, unknown>> {
  const meta = normalizeMetadata(params.metadata);

  if (!params.saveWorkflowConfigAsset) {
    return meta;
  }

  logger.info('[workflowConfigAssetFromAttackTask] workflow asset save requested', {
    dbType: getDbType(),
    hasConfigAudit: Boolean(meta.configAudit && typeof meta.configAudit === 'object'),
  });

  const cfg = meta.configAudit;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    meta.workflowConfigAssetSave = {
      ok: false,
      code: 'MISSING_CONFIG_AUDIT',
      message: 'metadata.configAudit missing; enable export payload or send top-level configAudit',
    };
    return meta;
  }

  const c = cfg as Record<string, unknown>;
  const yaml = configAuditExportToString(c.yaml);
  const json = configAuditExportToString(c.json);
  const raw = yaml || json;
  if (!raw) {
    meta.workflowConfigAssetSave = {
      ok: false,
      code: 'EMPTY_EXPORT',
      message: 'configAudit yaml/json is empty',
    };
    return meta;
  }

  const fileName = typeof c.fileName === 'string' ? c.fileName.trim() : undefined;
  // Auto-detect format: platform_family on the task can still be wrong for some entry paths; parser tries Dify → FastGPT → Coze.
  try {
    const result = await createWorkflowConfigAsset({
      organizationId: params.organizationId,
      userId: params.userId,
      raw,
      fileName: fileName || undefined,
      name: fileName || undefined,
      sourceTypeHint: 'auto',
      targetAgentId: params.targetAgentId,
    });

    if (result.ok === false) {
      meta.workflowConfigAssetSave = {
        ok: false,
        code: result.code,
        message: result.message,
      };
      logger.warn('[workflowConfigAssetFromAttackTask] asset save skipped', {
        code: result.code,
        message: result.message,
      });
    } else {
      meta.configAssetId = result.asset.id;
      meta.workflowConfigAssetDeduplicated = result.deduplicated;
      meta.workflowConfigAssetSave = {
        ok: true,
        assetId: result.asset.id,
        deduplicated: result.deduplicated,
      };
      if (result.deduplicated) {
        logger.info(
          '[workflowConfigAssetFromAttackTask] linked to existing workflow_config_assets row (same org+type+hash+agent); no new INSERT',
          { assetId: result.asset.id },
        );
      } else {
        logger.info('[workflowConfigAssetFromAttackTask] inserted new workflow_config_assets row', {
          assetId: result.asset.id,
        });
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    meta.workflowConfigAssetSave = {
      ok: false,
      code: 'EXCEPTION',
      message,
    };
    logger.warn('[workflowConfigAssetFromAttackTask] asset save threw', {
      message,
    });
  }

  return meta;
}
