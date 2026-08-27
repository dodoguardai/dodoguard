/**
 * SMTP email delivery service
 */

import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import logger from '../logger';

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigurationError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

let transporter: Transporter | null = null;

function isEmailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === 'true';
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS || 'noreply@dodoguard.com';
}

function getFromName(): string {
  return process.env.EMAIL_FROM_NAME || process.env.APP_NAME || 'DodoGuard';
}

function getSmtpPort(): number {
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  return Number.isFinite(port) ? port : 587;
}

function isSmtpSecure(): boolean {
  if (process.env.SMTP_SECURE === 'true') {
    return true;
  }
  if (process.env.SMTP_SECURE === 'false') {
    return false;
  }
  return getSmtpPort() === 465;
}

function getEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isEmailConfigured(): boolean {
  if (!isEmailEnabled()) {
    return false;
  }

  return Boolean(
    getEnvValue('SMTP_HOST') && getEnvValue('SMTP_USER') && getEnvValue('SMTP_PASSWORD'),
  );
}

function getTransporter(): Transporter {
  if (!isEmailConfigured()) {
    throw new EmailConfigurationError(
      'Email is enabled but SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.',
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: getEnvValue('SMTP_HOST'),
      port: getSmtpPort(),
      secure: isSmtpSecure(),
      auth: {
        user: getEnvValue('SMTP_USER'),
        pass: getEnvValue('SMTP_PASSWORD'),
      },
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail(options: {
  to: string;
  resetUrl: string;
  userName?: string;
}): Promise<void> {
  const { to, resetUrl, userName } = options;
  const displayName = userName?.trim() || to;
  const fromAddress = getFromAddress();
  const fromName = getFromName();

  const subject = 'Reset your DodoGuard password';
  const text = [
    `Hello ${displayName},`,
    '',
    'We received a request to reset your DodoGuard password.',
    'Use the link below to choose a new password. This link expires in 1 hour.',
    '',
    resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <p>Hello ${displayName},</p>
    <p>We received a request to reset your DodoGuard password.</p>
    <p>
      <a href="${resetUrl}">Reset your password</a>
    </p>
    <p>This link expires in 1 hour.</p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  `.trim();

  try {
    const mailer = getTransporter();
    await mailer.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text,
      html,
    });

    logger.info('[Email] Password reset email sent', { to });
  } catch (error: any) {
    logger.error('[Email] Failed to send password reset email', {
      to,
      error: error?.message || String(error),
    });
    throw new EmailDeliveryError(error?.message || 'Failed to send password reset email');
  }
}

export async function sendGenericEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const fromAddress = getFromAddress();
  const fromName = getFromName();

  try {
    const mailer = getTransporter();
    await mailer.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      ...(options.html ? { html: options.html } : {}),
    });
    logger.info('[Email] Generic email sent', { to: options.to, subject: options.subject });
  } catch (error: any) {
    logger.error('[Email] Failed to send generic email', {
      to: options.to,
      subject: options.subject,
      error: error?.message || String(error),
    });
    throw new EmailDeliveryError(error?.message || 'Failed to send email');
  }
}

export function resetEmailTransporterForTests(): void {
  transporter = null;
}
