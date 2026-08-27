import logger from '../logger';

const INSECURE_JWT_SECRETS = new Set([
  'default-secret',
  'default-refresh-secret',
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secret-refresh-key-change-this-in-production',
]);

function isInsecureSecret(value: string | undefined): boolean {
  if (!value || value.trim().length < 32) {
    return true;
  }
  return INSECURE_JWT_SECRETS.has(value.trim());
}

/**
 * In production, refuse to start without strong JWT secrets.
 * Development may keep defaults for local testing.
 */
export function assertProductionJwtSecrets(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET?.trim();
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
  const missing: string[] = [];

  if (!jwtSecret) {
    missing.push('JWT_SECRET');
  }
  if (!refreshSecret) {
    missing.push('JWT_REFRESH_SECRET');
  }

  if (missing.length > 0) {
    logger.error(
      `Production startup blocked: missing required environment variables: ${missing.join(', ')}`,
    );
    process.exit(1);
  }

  if (isInsecureSecret(jwtSecret) || isInsecureSecret(refreshSecret)) {
    logger.error(
      'Production startup blocked: JWT_SECRET and JWT_REFRESH_SECRET must be set to unique random values (at least 32 characters, not default placeholders).',
    );
    process.exit(1);
  }
}
