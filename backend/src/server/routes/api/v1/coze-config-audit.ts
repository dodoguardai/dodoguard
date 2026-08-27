/**
 * Coze Config Audit API — static Coze workflow YAML security review via LLM.
 * POST /api/v1/coze-config-audit/analyze
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../../../logger';
import { reportService } from '../../../../services/reportService';
import { analyzeCozeConfigYaml } from '../../../../services/cozeConfigAuditService';
import { parseCozeYamlToStructure } from '../../../../services/cozeConfigStructure';
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
      parseCozeYamlToStructure(parsed.data.yaml);

    return res.json({
      success: true,
      data: { inventory, truncated, normalized, parseSummary, parseErrors },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[coze-config-audit] structure failed', { error: message });

    if (message.includes('Invalid YAML') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_YAML', message },
      });
    }
    if (
      message.includes('not a valid Coze') ||
      message.includes('Missing nodes') ||
      message.includes('Dify application export') ||
      message.includes('Unrecognized workflow export') ||
      message.includes('Invalid node')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COZE_EXPORT', message },
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
    const data = await analyzeCozeConfigYaml({
      yamlText: yaml,
      fileName,
      provider: reviewerProvider,
    });

    let reportId: string | undefined;
    if (organizationId) {
      try {
        reportId = await reportService.createAuditReport(organizationId, data as any, {
          fileName: fileName || undefined,
          reportType: 'coze_config_audit',
        });
      } catch (reportErr: any) {
        logger.warn('[coze-config-audit] Failed to save report', {
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
    logger.error('[coze-config-audit] analyze failed', { error: message });

    if (message.includes('Invalid YAML') || message.includes('exceeds maximum')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_YAML', message },
      });
    }
    if (
      message.includes('not a valid Coze') ||
      message.includes('Missing nodes') ||
      message.includes('Dify application export') ||
      message.includes('Unrecognized workflow export') ||
      message.includes('Invalid node')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_COZE_EXPORT', message },
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
