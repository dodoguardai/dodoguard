/**
 * External API — asset ledger (Bearer zhian.* key).
 * Mounted at /api/v1/external/assets
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../../logger';
import { EXTERNAL_API_SCOPES } from '../../../../../services/externalApiKeyService';
import {
  claimExternalDiscovered,
  createExternalAsset,
  externalCreateAssetSchema,
  externalUpdateAssetSchema,
  ignoreExternalDiscovered,
  listExternalAssets,
  listExternalDiscovered,
  loadExternalAssetDetail,
  updateExternalAsset,
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

router.get('/agents', requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_READ), async (req, res) => {
  try {
    const data = await listExternalAssets(orgId(req), req.query as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('[external/assets] list agents error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list assets' },
    });
  }
});

router.post(
  '/agents',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_WRITE),
  async (req, res) => {
    try {
      const input = externalCreateAssetSchema.parse(req.body);
      const data = await createExternalAsset(orgId(req), actorId(req), input);
      res.status(201).json({ success: true, data });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
        });
      }
      if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'DUPLICATE_ASSET_NAME'
      ) {
        return res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE_ASSET_NAME', message: error.message },
        });
      }
      logger.error('[external/assets] create agent error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create asset' },
      });
    }
  },
);

router.get(
  '/agents/:id',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_READ),
  async (req, res) => {
    try {
      const data = await loadExternalAssetDetail(orgId(req), paramId(req));
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Asset not found' },
        });
      }
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[external/assets] get agent error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get asset' },
      });
    }
  },
);

router.patch(
  '/agents/:id',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_WRITE),
  async (req, res) => {
    try {
      const input = externalUpdateAssetSchema.parse(req.body);
      const data = await updateExternalAsset(orgId(req), actorId(req), paramId(req), input);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Asset not found' },
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
      logger.error('[external/assets] update agent error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update asset' },
      });
    }
  },
);

router.get(
  '/discovered',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_READ),
  async (req, res) => {
    try {
      const data = await listExternalDiscovered(orgId(req), req.query as Record<string, unknown>);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[external/assets] list discovered error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list discovered assets' },
      });
    }
  },
);

router.post(
  '/discovered/:id/claim',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_WRITE),
  async (req, res) => {
    try {
      const data = await claimExternalDiscovered(
        orgId(req),
        actorId(req),
        paramId(req),
        req.body || {},
      );
      res.status(201).json({ success: true, data });
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
      logger.error('[external/assets] claim discovered error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to claim discovered asset' },
      });
    }
  },
);

router.post(
  '/discovered/:id/ignore',
  requireExternalScopes(EXTERNAL_API_SCOPES.ASSETS_WRITE),
  async (req, res) => {
    try {
      await ignoreExternalDiscovered(orgId(req), paramId(req));
      res.json({ success: true, data: { message: 'Discovered asset ignored' } });
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === 'NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      logger.error('[external/assets] ignore discovered error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to ignore discovered asset' },
      });
    }
  },
);

export default router;
