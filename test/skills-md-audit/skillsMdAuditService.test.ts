import { prepareMarkdownPayload } from '../../backend/src/services/skillsMdAuditService';

describe('skillsMdAuditService prepareMarkdownPayload', () => {
  it('returns full text when under LLM limit', () => {
    const text = '# Hello\n\nSmall skill';
    const { payloadText, truncated } = prepareMarkdownPayload(text);
    expect(truncated).toBe(false);
    expect(payloadText).toContain('Hello');
  });

  it('truncates when content exceeds LLM payload limit', () => {
    const long = 'a'.repeat(100_001);
    const { payloadText, truncated } = prepareMarkdownPayload(long);
    expect(truncated).toBe(true);
    expect(payloadText.length).toBe(100_000);
  });

  it('throws when markdown exceeds max file size', () => {
    const huge = 'x'.repeat(5 * 1024 * 1024 + 1);
    expect(() => prepareMarkdownPayload(huge)).toThrow(/exceeds maximum/);
  });
});
