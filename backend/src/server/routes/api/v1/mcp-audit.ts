/**
 * MCP server source audit API — zip upload, LLM structured JSON (11 dimensions).
 * POST /api/v1/mcp-audit/analyze
 * - multipart/form-data: field "archive" (.zip), optional "provider" JSON string
 */

import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import logger from '../../../../logger';
import { syncCapabilityAuditResult } from '../../../../services/capabilityAuditSyncService';
import { MAX_SKILL_ZIP_BYTES } from '../../../../services/skillPackageExtract';
import { analyzeMcpSourceZip } from '../../../../services/skillsMdAuditService';
import { resolveConfigAuditReviewerProvider } from './config-audit-reviewer-provider';

const router = express.Router();

const providerSchema = z
  .object({
    id: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })
  .optional();

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
      if (!req.is('multipart/form-data') || !req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ARCHIVE',
            message: 'Multipart request must include file field "archive" (.zip MCP server source)',
          },
        });
      }

      const original = req.file.originalname || 'mcp-server.zip';
      if (!original.toLowerCase().endsWith('.zip')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ARCHIVE',
            message: 'Expected a .zip archive of MCP server source',
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

      const organizationId = (req as { user?: { organizationId?: string } }).user?.organizationId;
      const reviewerProvider = await resolveConfigAuditReviewerProvider({
        provider: provider?.id
          ? {
              id: provider.id,
              config: provider.config,
            }
          : undefined,
        organizationId,
      });

      const data = await analyzeMcpSourceZip(
        req.file.buffer,
        original,
        reviewerProvider?.id
          ? { id: reviewerProvider.id, config: reviewerProvider.config }
          : undefined,
      );
      const user = (req as { user?: { id?: string; userId?: string } }).user;
      let syncMeta: Record<string, unknown> = {};
      if (organizationId) {
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
            fileName: original,
            artifactKind: 'mcp',
            archiveBuffer: req.file.buffer,
            archiveFileName: original,
          });
          syncMeta = {
            reportId: sync.reportId,
            securityScanTaskId: sync.scanTaskId,
            remediationIds: sync.remediationIds,
            registryId: sync.registryId,
            syncedFindings: sync.syncedFindings,
          };
        } catch (reportErr: unknown) {
          logger.warn('[mcp-audit] Failed to sync audit outputs', {
            error: reportErr instanceof Error ? reportErr.message : String(reportErr),
          });
        }
      }

      return res.json({
        success: true,
        data: { ...data, ...syncMeta },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[mcp-audit] analyze failed', { error: message });

      if (message.includes('exceeds maximum') || message.includes('exceeds limit')) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ARCHIVE', message },
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
          error: {
            code: 'MISSING_API_KEY',
            message:
              '未找到可用的审查模型密钥。请在「设置 → 模型」中为所选模型配置 API Key，或在环境变量中设置 OPENAI_API_KEY。',
          },
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
