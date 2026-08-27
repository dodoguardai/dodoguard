/**
 * n8n Config Audit API — static n8n workflow security review via LLM.
 * POST /api/v1/n8n-config-audit/analyze
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { analyzeN8nConfigJson } from '../../../../services/n8nConfigAuditService';
import { reportService } from '../../../../services/reportService';
import { resolveConfigAuditReviewerProvider } from './config-audit-reviewer-provider';

const router = express.Router();

const analyzeBodySchema = z.object({
  json: z
    .string()
    .min(1, 'json is required')
    .max(5 * 1024 * 1024),
  fileName: z.string().max(512).optional(),
  provider: z
    .object({
      id: z.string().min(1),
      config: z.record(z.unknown()).optional(),
    })
    .optional(),
});

router.post('/analyze', async (req: express.Request, res: express.Response) => {
  try {
    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.flatten().fieldErrors.json?.[0] ?? 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const { json, fileName, provider } = parsed.data;
    const organizationId = (req as any).user?.organizationId;
    const reviewerProvider = await resolveConfigAuditReviewerProvider({
      provider: provider
        ? {
            id: provider.id,
            config: provider.config,
          }
        : undefined,
      organizationId,
    });
    const data = await analyzeN8nConfigJson({
      jsonText: json,
      fileName,
      provider: reviewerProvider,
    });

    let reportId: string | undefined;
    if (organizationId) {
      try {
        reportId = await reportService.createAuditReport(organizationId, data as any, {
          fileName: fileName || undefined,
          reportType: 'n8n_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[n8n-config-audit] Failed to save report', {
          error: reportErr?.message || String(reportErr),
        });
      }
    }

    return res.json({
      success: true,
      data: { ...data, reportId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[n8n-config-audit] analyze failed', { error: message });

    if (message.includes('Invalid JSON') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message },
      });
    }

    if (
      message.includes('Missing nodes') ||
      message.includes('Invalid node') ||
      message.includes('JSON root')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_N8N_EXPORT', message },
      });
    }

    if (message.includes('No API key')) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_API_KEY', message },
      });
    }

    return res.status(502).json({
      success: false,
      error: { code: 'LLM_OR_PARSE_ERROR', message },
    });
  }
});

export default router;
