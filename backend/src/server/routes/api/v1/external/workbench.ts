/**
 * External API — workbench todos summary (Bearer zhian.* key).
 * Mounted at /api/v1/external/workbench
 */

import express from 'express';
import logger from '../../../../../logger';
import { EXTERNAL_API_SCOPES } from '../../../../../services/externalApiKeyService';
import { listExternalWorkbenchTodos } from '../../../../../services/externalProductApiService';
import { requireExternalScopes } from './middleware';

const router = express.Router();

router.get(
  '/todos',
  requireExternalScopes(EXTERNAL_API_SCOPES.WORKBENCH_READ),
  async (req, res) => {
    try {
      const organizationId = (req as any).user?.organizationId as string;
      const data = await listExternalWorkbenchTodos(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[external/workbench] todos error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list workbench todos' },
      });
    }
  },
);

export default router;
