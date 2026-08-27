jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import nodemailer from 'nodemailer';
import {
  isEmailConfigured,
  resetEmailTransporterForTests,
  sendPasswordResetEmail,
} from '../../backend/src/services/emailService';

describe('emailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetEmailTransporterForTests();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('detects when SMTP is configured', () => {
    process.env.EMAIL_ENABLED = 'true';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASSWORD = 'pass';

    expect(isEmailConfigured()).toBe(true);
  });

  it('sends password reset email through SMTP', async () => {
    process.env.EMAIL_ENABLED = 'true';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@example.com';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASSWORD = 'pass';

    const sendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    await sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/reset-password?token=abc',
      userName: 'Test User',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your DodoGuard password',
      }),
    );
  });
});
