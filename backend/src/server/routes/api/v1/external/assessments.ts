/**
 * External API — assessments / scan tasks (Bearer zhian.* key).
 * Mounted at /api/v1/external/assessments
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../../logger';
import { EXTERNAL_API_SCOPES } from '../../../../../services/externalApiKeyService';
import {
  externalQuickStartSchema,
  quickStartExternalAssessment,
} from '../../../../../services/externalAssessmentQuickStartService';
import {
  createExternalAssessment,
  executeExternalAssessment,
  externalCreateAssessmentSchema,
  externalExecuteAssessmentSchema,
  getExternalAssessment,
  listExternalAssessments,
  listExternalFindings,
} from '../../../../../services/externalProductApiService';
import { requireExternalScopes } from './middleware';

const router = express.Router();

function orgId(req: express.Request): string {
  return (req as any).user?.organizationId as string;
}

function actorId(req: express.Request): string | null {
  return (req as any).user?.userId || (req as any).user?.id || null;
}

function paramId(req: express.Request, name = 'id'): string {
  const v = req.params[name];
  return Array.isArray(v) ? String(v[0]) : String(v);
}

function respondQuickStartError(res: express.Response, error: unknown, context: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
    });
  }
  const code = (error as Error & { code?: string }).code;
  const message = error instanceof Error ? error.message : 'Request failed';
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ success: false, error: { code, message } });
  }
  if (
    code === 'ASSET_RUNTIME_MISSING' ||
    code === 'NO_LIBRARIES' ||
    code === 'JUDGE_MODEL_MISSING'
  ) {
    return res.status(400).json({ success: false, error: { code, message } });
  }
  logger.error(
    `[external/assessments] ${context}: ${error instanceof Error ? error.message : String(error)}`,
  );
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to quick-start assessment' },
  });
}

router.get(
  '/tasks',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_READ),
  async (req, res) => {
    try {
      const data = await listExternalAssessments(orgId(req), req.query as Record<string, unknown>);
      res.json({ success: true, data });
    } catch (error) {
      logger.error(
        `[external/assessments] list error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list assessment tasks' },
      });
    }
  },
);

/**
 * One-click create (mirrors UI wizards): recommend libraries + fill runtime/judge, then create (+ optional execute).
 * Prefer this over POST /tasks when integrating from Python without manual library selection.
 */
router.post(
  '/quick-start',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_WRITE),
  async (req, res) => {
    try {
      const input = externalQuickStartSchema.parse(req.body);
      const data = await quickStartExternalAssessment({
        organizationId: orgId(req),
        actorUserId: actorId(req),
        input,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      return respondQuickStartError(res, error, 'quick-start error');
    }
  },
);

router.post(
  '/tasks',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_WRITE),
  async (req, res) => {
    try {
      const input = externalCreateAssessmentSchema.parse(req.body);
      const data = await createExternalAssessment(orgId(req), actorId(req), input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      logger.error(
        `[external/assessments] create error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create assessment task' },
      });
    }
  },
);

router.get(
  '/tasks/:id',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_READ),
  async (req, res) => {
    try {
      const data = await getExternalAssessment(orgId(req), paramId(req));
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Assessment task not found' },
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      logger.error(
        `[external/assessments] get error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get assessment task' },
      });
    }
  },
);

router.post(
  '/tasks/:id/execute',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_WRITE),
  async (req, res) => {
    try {
      const input = externalExecuteAssessmentSchema.parse(req.body ?? {});
      const data = await executeExternalAssessment(orgId(req), actorId(req), paramId(req), input);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      if (error instanceof Error && (error as Error & { code?: string }).code === 'NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      logger.error(
        `[external/assessments] execute error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to execute assessment task' },
      });
    }
  },
);

router.get(
  '/tasks/:id/findings',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSESSMENTS_READ),
  async (req, res) => {
    try {
      const data = await listExternalFindings(orgId(req), {
        ...(req.query as Record<string, unknown>),
        taskId: paramId(req),
      });
      res.json({ success: true, data });
    } catch (error) {
      logger.error(
        `[external/assessments] findings error: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list findings' },
      });
    }
  },
);

export default router;
