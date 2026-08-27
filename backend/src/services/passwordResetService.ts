/**
 * Password reset service
 * Uses signed JWT tokens (no separate token table required).
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, getDbType } from '../database';
import { isEmailConfigured, sendPasswordResetEmail } from './emailService';
import logger from '../logger';

const RESET_TOKEN_EXPIRY = '1h';

interface ResetTokenPayload {
  purpose: 'password_reset';
  userId: string;
  email: string;
}

function getUsersTable() {
  const dbType = getDbType();
  if (dbType === 'mysql') {
    const mysqlTables = require('../database/tables-mysql');
    return mysqlTables.usersTable;
  }

  const pgTables = require('../database/tables-enterprise');
  return pgTables.usersTable;
}

function getResetSecret(): string {
  return (
    process.env.JWT_RESET_SECRET || `${process.env.JWT_SECRET || 'default-secret'}-password-reset`
  );
}

function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL || 'http://localhost:3000';
  return url.replace(/\/$/, '');
}

function shouldExposeResetToken(): boolean {
  const explicit = process.env.DODOGUARD_EXPOSE_PASSWORD_RESET_URL;
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }
  return process.env.NODE_ENV !== 'production';
}

export class PasswordResetError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_TOKEN'
      | 'USER_NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'EMAIL_NOT_CONFIGURED'
      | 'EMAIL_SEND_FAILED',
  ) {
    super(message);
    this.name = 'PasswordResetError';
  }
}

export type PasswordResetRequestResult = {
  emailSent: boolean;
  resetToken?: string;
  resetUrl?: string;
};

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const usersTable = getUsersTable();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

  if (!user) {
    throw new PasswordResetError('No account found with this email address', 'USER_NOT_FOUND');
  }

  if (user.status !== 'active') {
    throw new PasswordResetError('This account is not active', 'USER_NOT_FOUND');
  }

  const token = jwt.sign(
    {
      purpose: 'password_reset',
      userId: user.id,
      email: user.email,
    } satisfies ResetTokenPayload,
    getResetSecret(),
    { expiresIn: RESET_TOKEN_EXPIRY },
  );

  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const userName = (user as any).name as string | undefined;

  if (isEmailConfigured()) {
    try {
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        userName,
      });
      return { emailSent: true };
    } catch (error) {
      logger.error('[Password Reset] Email delivery failed', {
        email: user.email,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new PasswordResetError(
        'Failed to send password reset email. Please try again later.',
        'EMAIL_SEND_FAILED',
      );
    }
  }

  if (shouldExposeResetToken()) {
    logger.warn(
      '[Password Reset] SMTP is not configured. Returning development reset link instead of sending email.',
      { email: user.email, resetUrl },
    );
    return { emailSent: false, resetToken: token, resetUrl };
  }

  if (process.env.EMAIL_ENABLED === 'true') {
    logger.warn(
      '[Password Reset] EMAIL_ENABLED=true but SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.',
      { email: user.email },
    );
  }

  throw new PasswordResetError(
    'Email service is not configured. Unable to send password reset email.',
    'EMAIL_NOT_CONFIGURED',
  );
}

export function validateResetToken(token: string): ResetTokenPayload {
  try {
    const decoded = jwt.verify(token, getResetSecret()) as ResetTokenPayload;
    if (decoded.purpose !== 'password_reset' || !decoded.userId || !decoded.email) {
      throw new PasswordResetError('Invalid or expired reset token', 'INVALID_TOKEN');
    }
    return decoded;
  } catch (error) {
    if (error instanceof PasswordResetError) {
      throw error;
    }
    throw new PasswordResetError('Invalid or expired reset token', 'INVALID_TOKEN');
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 7) {
    throw new PasswordResetError('Password must be at least 7 characters long', 'VALIDATION_ERROR');
  }

  const payload = validateResetToken(token);
  const usersTable = getUsersTable();
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({
      passwordHash: hashedPassword,
      updatedAt: new Date(),
    } as any)
    .where(eq(usersTable.id, payload.userId));

  const [updatedUser] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .limit(1);

  if (!updatedUser) {
    throw new PasswordResetError('User not found', 'USER_NOT_FOUND');
  }

  logger.info('[Password Reset] Password updated successfully', {
    userId: payload.userId,
    email: payload.email,
  });
}
