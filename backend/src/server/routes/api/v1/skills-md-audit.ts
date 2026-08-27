/**
 * SKILLS.md Audit API — static Markdown security review via LLM.
 * POST /api/v1/skills-md-audit/analyze
 * - application/json: { markdown, fileName?, provider? }
 * - multipart/form-data: field "archive" (.zip), optional "provider" JSON string
 */

import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import logger from '../../../../logger';
import { syncCapabilityAuditResult } from '../../../../services/capabilityAuditSyncService';
import { MAX_SKILL_ZIP_BYTES } from '../../../../services/skillPackageExtract';
import {
  analyzeSkillsMdMarkdown,
  analyzeSkillZipPackage,
} from '../../../../services/skillsMdAuditService';
import { resolveConfigAuditReviewerProvider } from './config-audit-reviewer-provider';

const router = express.Router();

const providerSchema = z
  .object({
    id: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })
  .optional();

async function persistSkillsAudit(
  req: express.Request,
  data: Awaited<ReturnType<typeof analyzeSkillsMdMarkdown>>,
  fileName?: string,
  archive?: { buffer: Buffer; fileName: string },
) {
  const organizationId = (
    req as express.Request & { user?: { organizationId?: string; id?: string; userId?: string } }
  ).user?.organizationId;
  if (!organizationId) {
    return {};
  }
  const user = (req as express.Request & { user?: { id?: string; userId?: string } }).user;
  try {
    const sync = await syncCapabilityAuditResult({
      organizationId,
      userId: user?.id || user?.userId || null,
      auditData: {
        summary: data.summary ?? '',
        overallRisk: data.overallRisk ?? 'low',
        findings: (data.findings ?? []).map((finding) => ({
          severity: finding.severity ?? 'medium',
          category: finding.category ?? '',
          location: finding.location ?? '',
          issue: finding.issue ?? '',
          evidence: finding.evidence ?? '',
          recommendation: finding.recommendation ?? '',
          ...(finding.dimension ? { dimension: finding.dimension } : {}),
          ...(finding.sourceFile ? { sourceFile: finding.sourceFile } : {}),
        })),
        recommendations: data.recommendations ?? [],
        warnings: data.warnings ?? [],
        truncated: data.truncated,
        scannedFiles: data.scannedFiles ?? [],
      },
      fileName,
      artifactKind: 'skills',
      ...(archive ? { archiveBuffer: archive.buffer, archiveFileName: archive.fileName } : {}),
    });
    return {
      reportId: sync.reportId,
      securityScanTaskId: sync.scanTaskId,
      remediationIds: sync.remediationIds,
      registryId: sync.registryId,
      syncedFindings: sync.syncedFindings,
    };
  } catch (error) {
    logger.warn('[skills-md-audit] Failed to sync audit outputs', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

const analyzeBodySchema = z.object({
  markdown: z
    .string()
    .min(1, 'markdown is required')
    .max(5 * 1024 * 1024),
  fileName: z.string().max(512).optional(),
  provider: providerSchema,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SKILL_ZIP_BYTES },
});

router.post(
  '/analyze',
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.is('multipart/form-data')) {
      upload.single('archive')(req, res, next);
    } else {
      next();
    }
  },
  async (req: express.Request, res: express.Response) => {
    try {
      if (req.is('multipart/form-data') && !req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ARCHIVE',
            message: 'Multipart request must include file field "archive" (.zip)',
          },
        });
      }

      if (req.file) {
        const original = req.file.originalname || 'skill.zip';
        if (!original.toLowerCase().endsWith('.zip')) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_ARCHIVE',
              message: 'Expected a .zip skill package',
            },
          });
        }

        let provider: z.infer<typeof providerSchema>;
        const rawProvider = (req.body as { provider?: unknown }).provider;
        if (rawProvider === undefined || rawProvider === '') {
          provider = undefined;
        } else {
          try {
            const parsed = typeof rawProvider === 'string' ? JSON.parse(rawProvider) : rawProvider;
            const pr = providerSchema.safeParse(parsed);
            if (!pr.success) {
              return res.status(400).json({
                success: false,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid provider JSON in multipart field',
                  details: pr.error.flatten(),
                },
              });
            }
            provider = pr.data;
          } catch {
            return res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'provider must be valid JSON' },
            });
          }
        }

        const organizationId = (req as express.Request & { user?: { organizationId?: string } })
          .user?.organizationId;
        const reviewerProvider = await resolveConfigAuditReviewerProvider({
          provider: provider?.id ? { id: provider.id, config: provider.config } : undefined,
          organizationId,
        });

        const data = await analyzeSkillZipPackage(
          req.file.buffer,
          original,
          reviewerProvider?.id
            ? { id: reviewerProvider.id, config: reviewerProvider.config }
            : undefined,
        );
        const syncMeta = await persistSkillsAudit(req, data, original, {
          buffer: req.file.buffer,
          fileName: original,
        });

        return res.json({
          success: true,
          data: { ...data, ...syncMeta },
        });
      }

      const parsed = analyzeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.flatten().fieldErrors.markdown?.[0] ?? 'Invalid request body',
            details: parsed.error.flatten(),
          },
        });
      }

      const { markdown, fileName, provider } = parsed.data;
      const organizationId = (req as express.Request & { user?: { organizationId?: string } }).user
        ?.organizationId;
      const reviewerProvider = await resolveConfigAuditReviewerProvider({
        provider: provider?.id ? { id: provider.id, config: provider.config } : undefined,
        organizationId,
      });
      const data = await analyzeSkillsMdMarkdown({
        markdown,
        fileName,
        provider: reviewerProvider?.id
          ? {
              id: reviewerProvider.id,
              config: reviewerProvider.config,
            }
          : undefined,
      });

      const syncMeta = await persistSkillsAudit(req, data, fileName || undefined);

      return res.json({
        success: true,
        data: { ...data, ...syncMeta },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[skills-md-audit] analyze failed', { error: message });

      if (message.includes('exceeds maximum') || message.includes('exceeds limit')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_MARKDOWN', message },
        });
      }
      if (
        message.includes('No readable text files') ||
        message.includes('Invalid or corrupted ZIP')
      ) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ARCHIVE', message },
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
  },
);

export default router;
