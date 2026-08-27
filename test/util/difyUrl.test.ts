import {
  buildDifyApiUrl,
  formatDifyHttpErrorPreview,
  normalizeDifyApiBaseUrl,
} from '../../backend/src/util/difyUrl';

describe('difyUrl', () => {
  describe('normalizeDifyApiBaseUrl', () => {
    it('strips trailing slashes', () => {
      expect(normalizeDifyApiBaseUrl('https://api.dify.ai/')).toBe('https://api.dify.ai');
    });

    it('strips /v1 suffix', () => {
      expect(normalizeDifyApiBaseUrl('https://api.dify.ai/v1/')).toBe('https://api.dify.ai');
    });

    it('strips full chat endpoint suffix', () => {
      expect(normalizeDifyApiBaseUrl('https://api.dify.ai/v1/chat-messages')).toBe(
        'https://api.dify.ai',
      );
    });

    it('strips full workflow endpoint suffix', () => {
      expect(normalizeDifyApiBaseUrl('https://self-hosted.example.com/v1/workflows/run/')).toBe(
        'https://self-hosted.example.com',
      );
    });
  });

  describe('buildDifyApiUrl', () => {
    it('builds chat endpoint from normalized base', () => {
      expect(buildDifyApiUrl('https://api.dify.ai/v1/chat-messages', 'chat')).toBe(
        'https://api.dify.ai/v1/chat-messages',
      );
    });

    it('maps localhost to 127.0.0.1 for IPv4 Docker port bindings', () => {
      expect(buildDifyApiUrl('http://localhost', 'chat')).toBe('http://127.0.0.1/v1/chat-messages');
    });

    it('builds workflow endpoint from normalized base', () => {
      expect(buildDifyApiUrl('https://api.dify.ai/v1/', 'workflow')).toBe(
        'https://api.dify.ai/v1/workflows/run',
      );
    });
  });

  describe('formatDifyHttpErrorPreview', () => {
    it('returns actionable message for HTML 404', () => {
      const preview = formatDifyHttpErrorPreview(
        404,
        '<html><body>404 Not Found</body></html>',
        'workflow',
      );
      expect(preview).toContain('HTTP 404');
      expect(preview).toContain('/v1/workflows/run');
      expect(preview).toContain('apiBaseUrl');
    });

    it('parses JSON error bodies', () => {
      const preview = formatDifyHttpErrorPreview(
        400,
        JSON.stringify({ message: 'app mode is chat' }),
        'workflow',
      );
      expect(preview).toBe('HTTP 400: app mode is chat');
    });
  });
});
