/**
 * Authentication API Routes
 */

import express from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db, getDbType } from '../../../../database';
import { eq } from 'drizzle-orm';
import logger from '../../../../logger';
import {
  PasswordResetError,
  requestPasswordReset,
  resetPasswordWithToken,
  validateResetToken,
} from '../../../../services/passwordResetService';

// Import tables based on database type
function getUsersTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../../../../database/tables-mysql');
    return mysqlTables.usersTable;
  } else {
    const pgTables = require('../../../../database/tables-enterprise');
    return pgTables.usersTable;
  }
}

const router = express.Router();

// Login schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Refresh token schema
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(7, 'Password must be at least 7 characters long'),
});

const validateResetTokenSchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/v1/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const usersTable = getUsersTable();
    if (!usersTable) {
      logger.error('usersTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // Find user
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Check password - handle both camelCase and snake_case field names
    const passwordHash = (user as any).passwordHash || (user as any).password_hash;
    if (!passwordHash) {
      logger.error('User password hash not found', { userId: user.id, email: user.email });
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'User password hash not found',
        },
      });
    }

    const isValidPassword = await bcrypt.compare(password, passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Check user status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is not active',
        },
      });
    }

    // Update last login - handle both camelCase and snake_case field names
    try {
      const dbType = getDbType();
      if (dbType === 'mysql') {
        // MySQL uses snake_case in database but camelCase in Drizzle schema
        await db
          .update(usersTable)
          .set({ lastLoginAt: new Date() } as any)
          .where(eq(usersTable.id, user.id));
      } else {
        // PostgreSQL uses camelCase
        await db
          .update(usersTable)
          .set({ lastLoginAt: new Date() } as any)
          .where(eq(usersTable.id, user.id));
      }
    } catch (updateError: any) {
      // Log but don't fail login if last login update fails
      logger.warn('Failed to update last login time:', updateError);
    }

    // Generate tokens - handle both camelCase and snake_case field names
    const organizationId = (user as any).organizationId || (user as any).organization_id;
    const userRole = (user as any).role;
    const userName = (user as any).name;
    const userAvatar = (user as any).avatar;

    const accessToken = jwt.sign(
      {
        userId: user.id,
        organizationId: organizationId,
        email: user.email,
        role: userRole,
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '1h' },
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
      { expiresIn: '7d' },
    );

    res.json({
      success: true,
      data: {
        token: accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: userName,
          role: userRole,
          avatar: userAvatar,
          organizationId: organizationId,
        },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      },
    });
  } catch (error: any) {
    logger.error('Login error:', error);
    logger.error('Error details:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Login failed',
      },
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * User logout
 */
router.post('/logout', async (_req, res) => {
  try {
    // In a real implementation, you might want to blacklist the token
    // For now, just return success
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Logout failed',
      },
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    ) as { userId: string };

    const usersTable = getUsersTable();
    if (!usersTable) {
      logger.error('usersTable is undefined');
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database table not initialized',
        },
      });
    }

    // Find user
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid refresh token',
        },
      });
    }

    // Generate new access token - handle both camelCase and snake_case field names
    const organizationId = (user as any).organizationId || (user as any).organization_id;
    const userRole = (user as any).role;

    const accessToken = jwt.sign(
      {
        userId: user.id,
        organizationId: organizationId,
        email: user.email,
        role: userRole,
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '1h' },
    );

    res.json({
      success: true,
      data: {
        token: accessToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid refresh token',
      },
    });
  }
});

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await requestPasswordReset(email);

    res.json({
      success: true,
      data: {
        message: result.emailSent
          ? 'Password reset email has been sent. Please check your inbox.'
          : 'Password reset link generated.',
        resetToken: result.resetToken,
        resetUrl: result.resetUrl,
        emailSent: result.emailSent,
      },
    });
  } catch (error: any) {
    logger.error('Forgot password error:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    if (error instanceof PasswordResetError) {
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      if (error.code === 'EMAIL_NOT_CONFIGURED' || error.code === 'EMAIL_SEND_FAILED') {
        return res.status(503).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to process password reset request',
      },
    });
  }
});

/**
 * GET /api/v1/auth/reset-password/validate
 * Validate a password reset token
 */
router.get('/reset-password/validate', async (req, res) => {
  try {
    const { token } = validateResetTokenSchema.parse(req.query);
    const payload = validateResetToken(token);

    res.json({
      success: true,
      data: {
        email: payload.email,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    if (error instanceof PasswordResetError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error('Validate reset token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to validate reset token',
      },
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password using a valid token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await resetPasswordWithToken(token, password);

    res.json({
      success: true,
      data: {
        message: 'Password reset successfully',
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.errors,
        },
      });
    }

    if (error instanceof PasswordResetError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to reset password',
      },
    });
  }
});

export default router;
