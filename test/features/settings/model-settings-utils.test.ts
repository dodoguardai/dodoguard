import {
  buildModelMetadata,
  buildProviderConfigFromForm,
  getModelEndpoint,
} from '../../../frontend/src/features/settings/lib/model-settings-utils';
import { extractModelsFromManagedModels } from '../../../frontend/src/lib/llm-integration-models';
import type { ManagedModel } from '../../../frontend/src/services/api/models';

describe('model settings utils', () => {
  it('builds a clean provider config from form values without echoing redacted secrets', () => {
    const existing = {
      name: 'old-name',
      providerConfig: {
        label: 'old-name',
        config: {
          apiBaseUrl: 'http://old.example/v1',
          baseUrl: 'http://old.example/v1',
          apiKey: '[REDACTED]',
        },
      },
    } as ManagedModel;

    expect(
      buildProviderConfigFromForm(
        {
          name: 'new-name',
          provider: 'sglang',
          endpoint: 'http://127.0.0.1:30000/v1/chat/completions',
        },
        existing,
      ),
    ).toEqual({
      label: 'new-name',
      config: {
        apiBaseUrl: 'http://127.0.0.1:30000/v1',
        baseUrl: 'http://127.0.0.1:30000/v1',
      },
    });
  });

  it('adds /v1 for local OpenAI-compatible model endpoints', () => {
    expect(
      buildProviderConfigFromForm({
        name: 'qwen-local',
        provider: 'sglang',
        endpoint: 'http://127.0.0.1:30000',
      }),
    ).toMatchObject({
      config: {
        apiBaseUrl: 'http://127.0.0.1:30000/v1',
        baseUrl: 'http://127.0.0.1:30000/v1',
      },
    });
  });

  it('keeps the original endpoint in metadata for display and editing', () => {
    expect(
      buildModelMetadata('chat', {
        endpoint: 'http://127.0.0.1:30000/v1/chat/completions',
        modelSource: 'sglang',
      }),
    ).toMatchObject({
      endpoint: 'http://127.0.0.1:30000/v1/chat/completions',
      modelSource: 'sglang',
    });
  });

  it('reads endpoints saved as apiBaseUrl', () => {
    const model = {
      providerConfig: {
        config: {
          apiBaseUrl: 'http://127.0.0.1:30000/v1',
        },
      },
    } as ManagedModel;

    expect(getModelEndpoint(model)).toBe('http://127.0.0.1:30000/v1');
  });

  it('excludes offline managed models from judge model options', () => {
    const base = {
      id: 'm1',
      organizationId: 'org',
      name: 'qwen-local',
      provider: 'sglang',
      modelKey: 'qwen-local',
      status: 'active',
      quotaMonthly: 100000,
      quotaUsed: 0,
      createdAt: '',
      updatedAt: '',
      metadata: { modelType: 'chat' },
    } as ManagedModel;

    expect(
      extractModelsFromManagedModels([
        { ...base, id: 'offline', healthStatus: 'offline' },
        { ...base, id: 'healthy', name: 'qwen-ok', healthStatus: 'healthy' },
      ]),
    ).toEqual([
      {
        value: 'openai:chat:qwen-ok',
        label: 'qwen-ok',
        modelId: 'healthy',
        config: {
          apiBaseUrl: undefined,
        },
      },
    ]);
  });
});
