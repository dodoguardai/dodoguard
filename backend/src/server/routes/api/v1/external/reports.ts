/**
 * External API — reports (Bearer zhian.* key).
 * Mounted at /api/v1/external/reports
 */

import fs from 'node:fs';
import express from 'express';
import logger from '../../../../../logger';
import { EXTERNAL_API_SCOPES } from '../../../../../services/externalApiKeyService';
import { reportService } from '../../../../../services/reportService';
import { requireExternalScopes } from './middleware';

const router = express.Router();

function orgId(req: express.Request): string {
  return (req as any).user?.organizationId as string;
}

function paramId(req: express.Request, name = 'id'): string {
  const v = req.params[name];
  return Array.isArray(v) ? String(v[0]) : String(v);
}

function contentDispositionAttachment(fileName: string): string {
  const safe = fileName.replace(/["\r\n]/g, '_');
  return `attachment; filename="${safe}"`;
}

router.get('/', requireExternalScopes(EXTERNAL_API_SCOPES.REPORTS_READ), async (req, res) => {
  try {
    const { limit = 50, offset = 0, taskId, format } = req.query;
    const result = await reportService.getReports(orgId(req), {
      limit: Number(limit),
      offset: Number(offset),
      taskId: taskId as string,
      format: format as string,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[external/reports] list error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list reports' },
    });
  }
});

router.get(
  '/:id/download',
  requireExternalScopes(EXTERNAL_API_SCOPES.REPORTS_READ),
  async (req, res) => {
    try {
      const requestedFormat =
        typeof req.query.format === 'string' && req.query.format.trim()
          ? String(req.query.format).trim().toLowerCase()
          : undefined;
      const download = await reportService.downloadReport(
        paramId(req),
        orgId(req),
        requestedFormat,
      );
      res.setHeader('Content-Type', download.contentType);
      res.setHeader('Content-Disposition', contentDispositionAttachment(download.fileName));
      fs.createReadStream(download.filePath).pipe(res);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[external/reports] download error:', err);
      if (err.message === 'Report not found') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Report not found' },
        });
      }
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to download report' },
      });
    }
  },
);

router.get('/:id', requireExternalScopes(EXTERNAL_API_SCOPES.REPORTS_READ), async (req, res) => {
  try {
    const report = await reportService.getReport(paramId(req), orgId(req));
    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('[external/reports] get error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get report' },
    });
  }
});

export default router;
