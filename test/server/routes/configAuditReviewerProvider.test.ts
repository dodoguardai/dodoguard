import { resolveConfigAuditReviewerProvider } from '../../../backend/src/server/routes/api/v1/config-audit-reviewer-provider';
import { resolveLlmProviderPayloadForRuntime } from '../../../backend/src/lib/resolve-llm-provider-runtime';

jest.mock('../../../backend/src/lib/resolve-llm-provider-runtime', () => ({
  resolveLlmProviderPayloadForRuntime: jest.fn(),
}));

const mockedResolve = jest.mocked(resolveLlmProviderPayloadForRuntime);

describe('resolveConfigAuditReviewerProvider', () => {
  beforeEach(() => {
    mockedResolve.mockReset();
  });

  it('uses server-side provider config for a selected reviewer model', async () => {
    mockedResolve.mockResolvedValue({
      id: 'openai:chat:qwen-max',
      config: {
        apiKey: 'server-key',
        apiBaseUrl: 'https://dashscope.example/v1',
        max_tokens: 4096,
      },
      matchedSelection: true,
    });

    await expect(
      resolveConfigAuditReviewerProvider({
        provider: {
          id: 'openai:chat:qwen-max',
          config: { apiBaseUrl: 'https://frontend-selected.example/v1' },
        },
        organizationId: 'org-1',
      }),
    ).resolves.toEqual({
      id: 'openai:chat:qwen-max',
      config: {
        apiKey: 'server-key',
        apiBaseUrl: 'https://dashscope.example/v1',
        max_tokens: 4096,
      },
    });

    expect(mockedResolve).toHaveBeenCalledWith({
      preferredModelId: 'openai:chat:qwen-max',
      organizationId: 'org-1',
    });
  });

  it('falls back to the request provider when no managed model or integration matches', async () => {
    mockedResolve.mockResolvedValue(null);

    await expect(
      resolveConfigAuditReviewerProvider({
        provider: {
          id: 'custom:chat:model',
          config: { apiKey: 'request-key' },
        },
      }),
    ).resolves.toEqual({
      id: 'custom:chat:model',
      config: { apiKey: 'request-key' },
    });
  });
});
