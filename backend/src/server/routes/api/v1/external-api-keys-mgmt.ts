/**
 * JWT-authenticated management of programmatic API keys (create / list / revoke / rotate).
 */

import express from 'express';
import { z } from 'zod';
import {
  ALL_EXTERNAL_API_SCOPES,
  createExternalApiKey,
  DEFAULT_EXTERNAL_SCOPES,
  isMissingExternalApiKeysTableError,
  listExternalApiKeys,
  purgeRevokedExternalApiKey,
  revokeExternalApiKey,
} from '../../../../services/externalApiKeyService';
import logger from '../../../../logger';

const router = express.Router();

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  /** ISO-8601 date string; ignored when neverExpires is true */
  expiresAt: z.string().optional().nullable(),
  /** When true, key never expires */
  neverExpires: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
});

router.get('/scopes', async (_req, res) => {
  res.json({
    success: true,
    data: {
      scopes: ALL_EXTERNAL_API_SCOPES,
      defaults: DEFAULT_EXTERNAL_SCOPES,
      groups: [
        { id: 'assets', scopes: ['assets:read', 'assets:write'] },
        { id: 'assessments', scopes: ['assessments:read', 'assessments:write'] },
        { id: 'remediations', scopes: ['remediations:read', 'remediations:write'] },
        { id: 'reports', scopes: ['reports:read'] },
        { id: 'workbench', scopes: ['workbench:read'] },
        {
          id: 'attackTasks',
          scopes: ['tasks:read', 'tasks:write', 'agents:read', 'vulnerabilities:read'],
        },
      ],
    },
  });
});

function stripSecrets(row: Record<string, unknown>) {
  const { secretHash: _s, ...rest } = row;
  return rest;
}

router.post('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId || req.user?.id;
    if (!organizationId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'Organization and user context required' },
      });
    }

    const body = createBodySchema.parse(req.body);
    let expiresAt: Date | null = null;
    if (body.neverExpires === true) {
      expiresAt = null;
    } else if (body.expiresAt && String(body.expiresAt).trim() !== '') {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'expiresAt must be a valid date string' },
        });
      }
      expiresAt = d;
    } else {
      expiresAt = null;
    }

    const { row, plaintextKey } = await createExternalApiKey({
      organizationId,
      createdByUserId: userId,
      name: body.name,
      expiresAt,
      scopes: body.scopes,
    });

    res.status(201).json({
      success: true,
      data: {
        ...stripSecrets(row as Record<string, unknown>),
        apiKey: plaintextKey,
        warning:
          'Store this API key securely; it will not be shown again. Use Authorization: Bearer <apiKey>.',
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors },
      });
    }
    if (error instanceof Error && (error as Error & { code?: string }).code === 'INVALID_SCOPE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SCOPE',
          message: error.message,
          details: { invalid: (error as Error & { invalid?: string[] }).invalid },
        },
      });
    }
    if (isMissingExternalApiKeysTableError(error)) {
      logger.warn('external_api_keys table missing on create — run db migrations');
      return res.status(422).json({
        success: false,
        error: {
          code: 'EXTERNAL_API_DB_NOT_READY',
          message:
            'external_api_keys table is missing. Run database migrations: npm run db:migrate',
        },
      });
    }
    logger.error('Create external API key failed:', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create API key' },
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }
    const rows = await listExternalApiKeys(organizationId);
    res.json({
      success: true,
      data: rows.map((r) => stripSecrets(r as unknown as Record<string, unknown>)),
    });
  } catch (error: unknown) {
    if (isMissingExternalApiKeysTableError(error)) {
      logger.warn(
        'external_api_keys table missing — apply migrations (npm run db:migrate). Returning empty list.',
      );
      return res.json({
        success: true,
        data: [],
        meta: { externalApiKeysTableMissing: true },
      });
    }
    logger.error('List external API keys failed:', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list API keys' },
    });
  }
});

router.delete('/:id/permanent', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }
    const outcome = await purgeRevokedExternalApiKey(organizationId, req.params.id);
    if (outcome === 'not_found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
      });
    }
    if (outcome === 'not_revoked') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'KEY_NOT_REVOKED',
          message: 'Only revoked keys can be removed from the list. Revoke the key first.',
        },
      });
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error: unknown) {
    if (isMissingExternalApiKeysTableError(error)) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'EXTERNAL_API_DB_NOT_READY',
          message:
            'external_api_keys table is missing. Run database migrations: npm run db:migrate',
        },
      });
    }
    logger.error('Purge revoked external API key failed:', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete API key' },
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ORG_ID', message: 'Organization ID is required' },
      });
    }
    const ok = await revokeExternalApiKey(organizationId, req.params.id);
    if (!ok) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found' },
      });
    }
    res.json({ success: true, data: { id: req.params.id, status: 'revoked' } });
  } catch (error: unknown) {
    if (isMissingExternalApiKeysTableError(error)) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'EXTERNAL_API_DB_NOT_READY',
          message:
            'external_api_keys table is missing. Run database migrations: npm run db:migrate',
        },
      });
    }
    logger.error('Revoke external API key failed:', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to revoke API key' },
    });
  }
});

router.post('/:id/rotate', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId || req.user?.id;
    if (!organizationId || !userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CONTEXT', message: 'Organization and user context required' },
      });
    }

    const rows = await listExternalApiKeys(organizationId);
    const existing = rows.find((r) => r.id === req.params.id);
    if (!existing || existing.status !== 'active') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Active API key not found' },
      });
    }

    await revokeExternalApiKey(organizationId, existing.id);

    const expiresAt = existing.expiresAt ? new Date(existing.expiresAt as Date) : null;
    const scopes = Array.isArray(existing.scopes) ? (existing.scopes as string[]) : undefined;

    const { row, plaintextKey } = await createExternalApiKey({
      organizationId,
      createdByUserId: userId,
      name: `${existing.name} (rotated)`,
      expiresAt,
      scopes,
    });

    res.status(201).json({
      success: true,
      data: {
        revokedKeyId: existing.id,
        ...stripSecrets(row as Record<string, unknown>),
        apiKey: plaintextKey,
        warning:
          'Store this API key securely; it will not be shown again. The previous key has been revoked.',
      },
    });
  } catch (error: unknown) {
    if (isMissingExternalApiKeysTableError(error)) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'EXTERNAL_API_DB_NOT_READY',
          message:
            'external_api_keys table is missing. Run database migrations: npm run db:migrate',
        },
      });
    }
    logger.error('Rotate external API key failed:', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to rotate API key' },
    });
  }
});

export default router;
