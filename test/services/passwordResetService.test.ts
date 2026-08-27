import jwt from 'jsonwebtoken';
import {
  PasswordResetError,
  validateResetToken,
} from '../../backend/src/services/passwordResetService';

describe('passwordResetService', () => {
  const resetSecret = `${process.env.JWT_SECRET || 'default-secret'}-password-reset`;

  it('validates a password reset token', () => {
    const token = jwt.sign(
      {
        purpose: 'password_reset',
        userId: 'user-123',
        email: 'user@example.com',
      },
      resetSecret,
      { expiresIn: '1h' },
    );

    const payload = validateResetToken(token);
    expect(payload.userId).toBe('user-123');
    expect(payload.email).toBe('user@example.com');
  });

  it('rejects tokens with the wrong purpose', () => {
    const token = jwt.sign(
      {
        purpose: 'login',
        userId: 'user-123',
        email: 'user@example.com',
      },
      resetSecret,
      { expiresIn: '1h' },
    );

    expect(() => validateResetToken(token)).toThrow(PasswordResetError);
  });

  it('rejects expired tokens', () => {
    const token = jwt.sign(
      {
        purpose: 'password_reset',
        userId: 'user-123',
        email: 'user@example.com',
      },
      resetSecret,
      { expiresIn: '-1s' },
    );

    expect(() => validateResetToken(token)).toThrow(PasswordResetError);
  });
});
