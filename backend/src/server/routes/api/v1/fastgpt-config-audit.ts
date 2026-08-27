/**
 * FastGPT Config Audit API — static FastGPT workflow JSON security review via LLM.
 * POST /api/v1/fastgpt-config-audit/analyze
 * POST /api/v1/fastgpt-config-audit/structure — inventory for UI / rule-hit mapping (same shape as Dify structure API).
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { reportService } from '../../../../services/reportService';
import { analyzeFastGptConfigJson } from '../../../../services/fastgptConfigAuditService';
import { parseFastGptTextToStructure } from '../../../../services/fastgptConfigStructure';
import { resolveConfigAuditReviewerProvider } from './config-audit-reviewer-provider';

const router = express.Router();

const structureBodySchema = z.object({
  json: z
    .string()
    .min(1, 'json is required')
    .max(5 * 1024 * 1024),
});

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

router.post('/structure', async (req: express.Request, res: express.Response) => {
  try {
    const parsed = structureBodySchema.safeParse(req.body);
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

    const { inventory, truncated, normalized, parseSummary, parseErrors } =
      parseFastGptTextToStructure(parsed.data.json);

    return res.json({
      success: true,
      data: { inventory, truncated, normalized, parseSummary, parseErrors },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[fastgpt-config-audit] structure failed', { error: message });

    if (message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message },
      });
    }
    if (
      message.includes('not a valid FastGPT') ||
      message.includes('Missing nodes') ||
      message.includes('Dify application export') ||
      message.includes('Coze workflow export') ||
      message.includes('Unrecognized workflow export')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FASTGPT_EXPORT', message },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'STRUCTURE_ERROR', message },
    });
  }
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
    const data = await analyzeFastGptConfigJson({
      jsonText: json,
      fileName,
      provider: reviewerProvider,
    });

    let reportId: string | undefined;
    if (organizationId) {
      try {
        reportId = await reportService.createAuditReport(organizationId, data as any, {
          fileName: fileName || undefined,
          reportType: 'fastgpt_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[fastgpt-config-audit] Failed to save report', {
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
    logger.error('[fastgpt-config-audit] analyze failed', { error: message });

    if (message.includes('Invalid JSON') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_JSON', message },
      });
    }
    if (
      message.includes('not a valid FastGPT') ||
      message.includes('Missing nodes') ||
      message.includes('Dify application export') ||
      message.includes('Coze workflow export') ||
      message.includes('Unrecognized workflow export')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FASTGPT_EXPORT', message },
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
