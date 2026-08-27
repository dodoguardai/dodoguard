/**
 * External API — remediations (Bearer zhian.* key).
 * Mounted at /api/v1/external/remediations
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../../logger';
import { EXTERNAL_API_SCOPES } from '../../../../../services/externalApiKeyService';
import {
  externalEvidenceSchema,
  externalRemediationUpdateSchema,
  externalRetestSchema,
  listExternalRemediations,
  loadExternalRemediationDetail,
  retestExternalRemediation,
  submitExternalRemediationEvidence,
  updateExternalRemediation,
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

router.get('/', requireExternalScopes(EXTERNAL_API_SCOPES.REMEDIATIONS_READ), async (req, res) => {
  try {
    const data = await listExternalRemediations(orgId(req), req.query as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('[external/remediations] list error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list remediations' },
    });
  }
});

router.get(
  '/:id',
  requireExternalScopes(EXTERNAL_API_SCOPES.REMEDIATIONS_READ),
  async (req, res) => {
    try {
      const data = await loadExternalRemediationDetail(orgId(req), paramId(req));
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Remediation not found' },
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[external/remediations] get error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get remediation' },
      });
    }
  },
);

router.patch(
  '/:id',
  requireExternalScopes(EXTERNAL_API_SCOPES.REMEDIATIONS_WRITE),
  async (req, res) => {
    try {
      const input = externalRemediationUpdateSchema.parse(req.body ?? {});
      const data = await updateExternalRemediation(orgId(req), actorId(req), paramId(req), input);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Remediation not found' },
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      logger.error('[external/remediations] update error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update remediation' },
      });
    }
  },
);

router.post(
  '/:id/evidence',
  requireExternalScopes(EXTERNAL_API_SCOPES.REMEDIATIONS_WRITE),
  async (req, res) => {
    try {
      const input = externalEvidenceSchema.parse(req.body ?? {});
      const data = await submitExternalRemediationEvidence(
        orgId(req),
        actorId(req),
        paramId(req),
        input,
      );
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Remediation not found' },
        });
      }
      res.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      logger.error('[external/remediations] evidence error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to submit evidence' },
      });
    }
  },
);

router.post(
  '/:id/retest',
  requireExternalScopes(EXTERNAL_API_SCOPES.REMEDIATIONS_WRITE),
  async (req, res) => {
    try {
      const input = externalRetestSchema.parse(req.body ?? {});
      const data = await retestExternalRemediation(orgId(req), actorId(req), paramId(req), input);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Remediation not found' },
        });
      }
      res.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      logger.error('[external/remediations] retest error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retest remediation' },
      });
    }
  },
);

export default router;
