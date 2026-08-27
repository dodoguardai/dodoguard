import { eq } from 'drizzle-orm';
import type express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../database';
import logger from '../../logger';
import { getUsersTable } from '../utils/getUsersTable';
import { isDbConnectionError } from '../utils/isDbConnectionError';

type JwtPayload = {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
};

type AuthUserCacheEntry = {
  status: string;
  expiresAt: number;
};

const authUserCache = new Map<string, AuthUserCacheEntry>();

function readEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readEnvBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'yup', 'yeppers'].includes(raw.toLowerCase());
}

const AUTH_USER_CACHE_TTL_MS = readEnvInt('AUTH_USER_CACHE_TTL_MS', 120_000);
const AUTH_CACHE_GRACE_MS = readEnvInt('AUTH_CACHE_GRACE_MS', 300_000);

function getAuthUserCache(userId: string, allowGrace = false): AuthUserCacheEntry | null {
  const entry = authUserCache.get(userId);
  if (!entry) {
    return null;
  }
  const now = Date.now();
  if (entry.expiresAt > now) {
    return entry;
  }
  if (allowGrace && entry.expiresAt + AUTH_CACHE_GRACE_MS > now) {
    return entry;
  }
  authUserCache.delete(userId);
  return null;
}

function setAuthUserCache(userId: string, status: string) {
  authUserCache.set(userId, {
    status,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });
}

function attachAuthUser(req: express.Request, decoded: JwtPayload) {
  (req as express.Request & { user: JwtPayload & { id: string } }).user = {
    id: decoded.userId,
    userId: decoded.userId,
    organizationId: decoded.organizationId,
    email: decoded.email,
    role: decoded.role,
  };
}

export async function authenticateToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.warn('Authentication failed: missing access token');
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
        },
      });
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as JwtPayload;
    } catch (jwtError: unknown) {
      const err = jwtError as { name?: string; code?: string };
      logger.warn('Authentication failed: invalid access token', {
        errorName: err.name,
        errorCode: err.code,
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token',
        },
      });
    }

    const cached = getAuthUserCache(decoded.userId);
    if (cached?.status === 'active') {
      attachAuthUser(req, decoded);
      next();
      return;
    }

    try {
      const usersTable = getUsersTable();
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, decoded.userId))
        .limit(1);

      if (!user || user.status !== 'active') {
        authUserCache.delete(decoded.userId);
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
        });
      }

      setAuthUserCache(decoded.userId, user.status);
      attachAuthUser(req, decoded);
      next();
    } catch (dbError) {
      if (!isDbConnectionError(dbError)) {
        throw dbError;
      }

      const stale = getAuthUserCache(decoded.userId, true);
      if (stale?.status === 'active') {
        logger.warn('Authentication DB timeout, using cached active user', {
          userId: decoded.userId,
        });
        attachAuthUser(req, decoded);
        next();
        return;
      }

      if (readEnvBool('AUTH_TRUST_JWT_ON_DB_TIMEOUT', true)) {
        logger.warn('Authentication DB timeout, trusting verified JWT', {
          userId: decoded.userId,
        });
        attachAuthUser(req, decoded);
        next();
        return;
      }

      logger.error('Authentication DB unavailable:', dbError);
      return res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database temporarily unavailable, please retry',
        },
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    if (isDbConnectionError(error)) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database temporarily unavailable, please retry',
        },
      });
    }
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token',
      },
    });
  }
}
