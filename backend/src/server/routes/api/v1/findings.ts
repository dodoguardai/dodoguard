/**
 * Findings API Routes
 * List and manage vulnerability findings (from attack_results produced by task runs).
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { createRetestTaskFromFinding } from '../../../../services/findingRetestService';
import { getTimelineForFinding } from '../../../../services/findingTimelineService';
import { findingsService } from '../../../../services/findingsService';
import { runAttackTaskInBackground } from './attack-tasks';

type CreateRetestTaskFailure = Extract<
  Awaited<ReturnType<typeof createRetestTaskFromFinding>>,
  { ok: false }
>;

const router = express.Router();

const retestBodySchema = z.object({
  mode: z.enum(['finding_scoped', 'full_task']).default('finding_scoped'),
  nameSuffix: z.string().max(200).optional(),
  autoStart: z.boolean().default(true),
  configAudit: z
    .object({
      yaml: z.string().optional(),
      json: z.string().optional(),
      fileName: z.string().max(300).optional(),
    })
    .partial()
    .optional(),
});

/**
 * GET /api/v1/findings
 * List findings for the organization (from attack_results).
 */
router.get('/', async (req, res) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const { limit, offset, search, riskLevel, status, agentId, taskId } = req.query;
    const result = await findingsService.list(organizationId, {
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
      search: search as string | undefined,
      riskLevel: riskLevel as string | undefined,
      status: status as string | undefined,
      agentId: agentId as string | undefined,
      taskId: taskId as string | undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('List findings error:', { message: error?.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list findings',
      },
    });
  }
});

/**
 * POST /api/v1/findings/:id/retest
 * Clone baseline attack task and optionally start execution (scoped or full vulnerability set).
 */
router.post('/:id/retest', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = (
      req as express.Request & { user?: { organizationId?: string; id?: string } }
    ).user?.organizationId;
    const userId = (req as express.Request & { user?: { id?: string } }).user?.id;

    if (!organizationId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'Organization and user context required' },
      });
    }

    const parsed = retestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const mode = parsed.data.mode ?? 'finding_scoped';
    const autoStart = parsed.data.autoStart !== false;

    const result = await createRetestTaskFromFinding({
      findingId: id,
      organizationId,
      userId,
      mode,
      nameSuffix: parsed.data.nameSuffix,
      configAudit: parsed.data.configAudit,
    });

    if (result.ok) {
      if (autoStart) {
        runAttackTaskInBackground(result.task.id, organizationId).catch((error) => {
          logger.error('Background retest task run error:', error);
        });
      }

      return res.status(201).json({
        success: true,
        data: {
          task: result.task,
          taskId: result.task.id,
          started: autoStart,
        },
      });
    }

    const err = result as CreateRetestTaskFailure;
    return res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details != null ? { details: err.details } : {}),
      },
    });
  } catch (error: unknown) {
    logger.error(`Retest finding error for ${req.params.id}:`, {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create retest task',
      },
    });
  }
});

/**
 * GET /api/v1/findings/:id/timeline
 * Ordered security events for this finding (task, scans, retests, conclusion).
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = (req as express.Request & { user?: { organizationId?: string } }).user
      ?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const timeline = await getTimelineForFinding(id, organizationId);
    if (!timeline) {
      return res.status(404).json({
        success: false,
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

    res.json({
      success: true,
      data: timeline,
    });
  } catch (error: unknown) {
    logger.error(`Finding timeline error for ${req.params.id}:`, {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load timeline',
      },
    });
  }
});

/**
 * GET /api/v1/findings/:id
 * Get a single finding by ID (detail view).
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const finding = await findingsService.getById(id, organizationId);
    if (!finding) {
      return res.status(404).json({
        success: false,
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

    res.json({
      success: true,
      data: finding,
    });
  } catch (error: any) {
    logger.error(`Get finding error for ${req.params.id}:`, { message: error?.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get finding',
      },
    });
  }
});

/**
 * PATCH /api/v1/findings/:id
 * Update finding status or audit notes.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const { status, auditNotes } = req.body || {};
    const updated = await findingsService.update(id, organizationId, {
      status: status as string | undefined,
      auditNotes: auditNotes as string | undefined,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

    res.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    logger.error(`Update finding error for ${req.params.id}:`, { message: error?.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update finding',
      },
    });
  }
});

/**
 * DELETE /api/v1/findings/:id
 * Delete a finding (remove attack_result row).
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }

    const deleted = await findingsService.delete(id, organizationId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' },
      });
    }

    res.json({
      success: true,
      message: 'Finding deleted',
    });
  } catch (error: any) {
    logger.error(`Delete finding error for ${req.params.id}:`, { message: error?.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete finding',
      },
    });
  }
});

export default router;
