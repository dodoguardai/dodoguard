export function isDbConnectionError(error: unknown): boolean {
  const visit = (err: unknown, depth = 0): boolean => {
    if (!err || typeof err !== 'object' || depth > 4) {
      return false;
    }
    const record = err as { code?: string; errno?: number; message?: string; cause?: unknown };
    const message = String(record.message || '');
    if (
      record.code === 'ETIMEDOUT' ||
      record.code === 'ECONNREFUSED' ||
      record.code === 'ECONNRESET' ||
      record.code === 'PROTOCOL_CONNECTION_LOST' ||
      record.code === 'EHOSTUNREACH' ||
      record.errno === -60
    ) {
      return true;
    }
    if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|connection lost/i.test(message)) {
      return true;
    }
    return visit(record.cause, depth + 1);
  };
  return visit(error);
}
