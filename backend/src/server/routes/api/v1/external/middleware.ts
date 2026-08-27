/**
 * Bearer token auth for programmatic API keys (zhian.<uuid>.<secret>).
 */

import type express from 'express';
import { verifyExternalApiKey } from '../../../../../services/externalApiKeyService';

export type ExternalApiRequest = express.Request & {
  externalApiKey?: Awaited<ReturnType<typeof verifyExternalApiKey>>;
};

export async function authenticateExternalApiKey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Authorization Bearer API key is required' },
    });
  }

  try {
    const record = await verifyExternalApiKey(token);
    if (!record || !record.createdByUserId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid, expired, or revoked API key',
        },
      });
    }

    (req as ExternalApiRequest).externalApiKey = record;
    (req as any).user = {
      userId: record.createdByUserId,
      id: record.createdByUserId,
      organizationId: record.organizationId,
    };

    next();
  } catch (_e) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Authentication failed' },
    });
  }
}

export function requireExternalScopes(...required: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = (req as ExternalApiRequest).externalApiKey;
    if (!key?.scopes) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Missing scope information' },
      });
    }
    const missing = required.filter((s) => !key.scopes.includes(s));
    if (missing.length > 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: `Required scopes: ${required.join(', ')}`,
          details: { missing },
        },
      });
    }
    next();
  };
}
