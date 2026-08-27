import {
  createManagedModelBodySchema,
  updateManagedModelBodySchema,
} from '../../../backend/src/server/routes/api/v1/models';

describe('models API body schemas', () => {
  it('accepts create payload with providerConfig', () => {
    const parsed = createManagedModelBodySchema.safeParse({
      name: 'Prod GPT',
      provider: 'openai',
      modelKey: 'gpt-4.1',
      providerConfig: {
        apiKeyEnvVar: 'OPENAI_API_KEY',
        config: { temperature: 0.2, maxOutputTokens: 1024 },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects create without modelKey', () => {
    const parsed = createManagedModelBodySchema.safeParse({
      name: 'x',
      provider: 'openai',
    });
    expect(parsed.success).toBe(false);
  });

  it('allows patch with nullable providerConfig', () => {
    const parsed = updateManagedModelBodySchema.safeParse({ providerConfig: null });
    expect(parsed.success).toBe(true);
  });
});
