/**
 * Dify Config gray-box scanning API — YAML structure (Beta) + LLM audit.
 * POST /api/v1/dify-config-audit/structure | /analyze
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { analyzeDifyConfigYaml } from '../../../../services/difyConfigAuditService';
import { parseDifyYamlToStructure } from '../../../../services/difyConfigStructure';
import { reportService } from '../../../../services/reportService';
import { resolveConfigAuditReviewerProvider } from './config-audit-reviewer-provider';

const router = express.Router();

const structureBodySchema = z.object({
  yaml: z
    .string()
    .min(1, 'yaml is required')
    .max(5 * 1024 * 1024),
});

const analyzeBodySchema = z.object({
  yaml: z
    .string()
    .min(1, 'yaml is required')
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
          message: parsed.error.flatten().fieldErrors.yaml?.[0] ?? 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const { inventory, truncated, normalized, parseSummary, parseErrors } =
      parseDifyYamlToStructure(parsed.data.yaml);

    return res.json({
      success: true,
      data: { inventory, truncated, normalized, parseSummary, parseErrors },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[dify-config-audit] structure failed', { error: message });

    if (message.includes('Invalid YAML') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_YAML', message },
      });
    }
    if (
      message.includes('not a valid Dify') ||
      message.includes('Missing workflow') ||
      message.includes('Unsupported export')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DIFY_EXPORT', message },
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
          message: parsed.error.flatten().fieldErrors.yaml?.[0] ?? 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const { yaml, fileName, provider } = parsed.data;
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
    const data = await analyzeDifyConfigYaml({
      yamlText: yaml,
      fileName,
      provider: reviewerProvider,
    });

    // Task mode: persist audit result to Reports
    let reportId: string | undefined;
    if (organizationId) {
      try {
        reportId = await reportService.createAuditReport(organizationId, data as any, {
          fileName: fileName || undefined,
          reportType: 'dify_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[dify-config-audit] Failed to save report', {
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
    logger.error('[dify-config-audit] analyze failed', { error: message });

    if (message.includes('Invalid YAML') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_YAML', message },
      });
    }
    if (
      message.includes('not a valid Dify') ||
      message.includes('Missing workflow') ||
      message.includes('Unsupported export')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DIFY_EXPORT', message },
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
