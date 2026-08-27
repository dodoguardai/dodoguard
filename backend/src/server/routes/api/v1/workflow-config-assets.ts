/**
 * Workflow config assets API — POST create, GET list, GET by id
 * GET /api/v1/workflow-config-assets
 * POST /api/v1/workflow-config-assets
 * GET /api/v1/workflow-config-assets/:id
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { getWorkflowAssetNodeTypeDetail } from '../../../../services/workflowConfigAssetResourceRefsService';
import {
  createWorkflowConfigAsset,
  getWorkflowConfigAssetById,
  listWorkflowConfigAssets,
} from '../../../../services/workflowConfigAssetService';

import type { WorkflowSourceType } from '../../../../services/workflowConfigAssetParse';

const router = express.Router();

const sourceTypeEnum = z.enum(['dify', 'fastgpt', 'coze', 'unknown', 'auto']);

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

const postBodySchema = z.object({
  raw: z
    .string()
    .min(1, 'raw is required')
    .max(5 * 1024 * 1024),
  name: z.string().max(255).optional(),
  fileName: z.string().max(512).optional(),
  sourceType: sourceTypeEnum.optional(),
  targetAgentId: z.string().uuid().optional(),
});

/**
 * GET /api/v1/workflow-config-assets
 */
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const sourceType = typeof req.query.sourceType === 'string' ? req.query.sourceType : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const targetAgentIdRaw =
      typeof req.query.targetAgentId === 'string' ? req.query.targetAgentId : undefined;
    const targetAgentId =
      targetAgentIdRaw && /^[0-9a-f-]{36}$/i.test(targetAgentIdRaw.trim())
        ? targetAgentIdRaw.trim()
        : undefined;

    const result = await listWorkflowConfigAssets({
      organizationId,
      limit,
      offset,
      sourceType,
      q,
      targetAgentId,
    });

    if (result.ok === false) {
      const status = result.code === 'NOT_SUPPORTED' ? 501 : 500;
      return res.status(status).json({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('[workflow-config-assets] list failed', { error });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list workflow config assets' },
    });
  }
});

/**
 * POST /api/v1/workflow-config-assets
 */
router.post('/', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId || req.user?.id;
    if (!organizationId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER_CONTEXT', message: 'Organization and user are required' },
      });
    }

    const parsed = postBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.flatten().fieldErrors.raw?.[0] ?? 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const hint = parsed.data.sourceType as WorkflowSourceType | 'auto' | undefined;
    const createResult = await createWorkflowConfigAsset({
      organizationId,
      userId: String(userId),
      raw: parsed.data.raw,
      name: parsed.data.name,
      fileName: parsed.data.fileName,
      sourceTypeHint: hint,
      targetAgentId: parsed.data.targetAgentId,
    });

    if (createResult.ok === false) {
      const code = createResult.code;
      const status =
        code === 'VALIDATION_ERROR' || code === 'INVALID_TARGET_AGENT'
          ? 400
          : code === 'PAYLOAD_TOO_LARGE'
            ? 413
            : code === 'NOT_SUPPORTED'
              ? 501
              : 500;
      return res.status(status).json({
        success: false,
        error: { code: createResult.code, message: createResult.message },
      });
    }

    const statusCode = createResult.deduplicated ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      data: {
        asset: createResult.asset,
        deduplicated: createResult.deduplicated,
      },
    });
  } catch (error) {
    logger.error('[workflow-config-assets] create failed', { error });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create workflow config asset' },
    });
  }
});

/**
 * GET /api/v1/workflow-config-assets/:id/node-type-detail?nodeType=...
 * Nodes grouped by resource fingerprint + other agents using the same resource (org-wide index).
 */
router.get('/:id/node-type-detail', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const id = routeParam(req.params.id);
    const nodeType =
      typeof req.query.nodeType === 'string'
        ? req.query.nodeType
        : typeof req.query.node_type === 'string'
          ? req.query.node_type
          : '';

    const result = await getWorkflowAssetNodeTypeDetail({
      organizationId,
      assetId: id,
      nodeTypeQuery: nodeType,
    });

    if (result.ok === false) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'NOT_SUPPORTED'
            ? 501
            : result.code === 'BAD_REQUEST'
              ? 400
              : 500;
      return res.status(status).json({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return res.json({
      success: true,
      data: {
        assetName: result.assetName,
        nodeType: result.nodeType,
        groups: result.groups,
      },
    });
  } catch (error) {
    logger.error('[workflow-config-assets] node-type-detail failed', { error });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load node type detail' },
    });
  }
});

/**
 * GET /api/v1/workflow-config-assets/:id
 */
router.get('/:id', async (req: express.Request, res: express.Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const id = routeParam(req.params.id);
    const includeGraph =
      req.query.includeGraph === '1' ||
      req.query.includeGraph === 'true' ||
      req.query.include === 'graph';
    const includeRaw =
      req.query.includeRaw === '1' ||
      req.query.includeRaw === 'true' ||
      req.query.include === 'full';

    const result = await getWorkflowConfigAssetById({
      organizationId,
      id,
      includeGraph,
      includeRaw,
    });

    if (result.ok === false) {
      const status =
        result.code === 'NOT_FOUND' ? 404 : result.code === 'NOT_SUPPORTED' ? 501 : 500;
      return res.status(status).json({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return res.json({ success: true, data: { asset: result.asset } });
  } catch (error) {
    logger.error('[workflow-config-assets] get failed', { error });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get workflow config asset' },
    });
  }
});

export default router;
