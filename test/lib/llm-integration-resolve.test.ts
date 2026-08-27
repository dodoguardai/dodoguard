import {
  applyLmStudioOpenAiDefaults,
  applyModelAwareNonStreamingDefaults,
  applyQwen3NonStreamingDefaults,
  applySglangOpenAiDefaults,
  extractChatModelSuffix,
  getLlmProviderPayloadForAttackTask,
  isQwen3ModelName,
  looksLikeFullProviderId,
  LM_STUDIO_DEFAULT_MAX_TOKENS,
  resolveLlmIntegrationForSelectedModel,
  resolveLlmIntegrationForSelectedModelFuzzy,
} from '../../backend/src/lib/llm-integration-resolve';
import { OpenAiChatCompletionProvider } from '../../backend/src/providers/openai/chat';
import type { IntegrationConfig } from '../../backend/src/services/systemConfigService';

describe('resolveLlmIntegrationForSelectedModel', () => {
  const ollama: IntegrationConfig = {
    id: 'a',
    type: 'llm',
    name: 'testollama',
    provider: 'ollama',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:11434',
      models: [{ id: 'deepseek-r1:1.5b', name: 'ds' }],
    },
  };

  const aliyun: IntegrationConfig = {
    id: 'b',
    type: 'llm',
    name: '阿里云',
    provider: 'aliyun',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      models: [{ id: 'qwen-turbo', name: 'Qwen' }],
    },
  };

  const lmstudio: IntegrationConfig = {
    id: 'c',
    type: 'llm',
    name: 'LM Studio Local',
    provider: 'lmstudio',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:1234/v1',
      models: [{ id: 'qwen/qwen3-8b', name: 'Qwen3 8B' }],
    },
  };

  const sglang: IntegrationConfig = {
    id: 'd',
    type: 'llm',
    name: 'SGLang Local',
    provider: 'sglang',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:30000/v1',
      models: [{ id: 'Qwen/Qwen2.5-1.5B-Instruct', name: 'Qwen 1.5B' }],
    },
  };

  it('returns Aliyun integration when selected value matches qwen openai:chat id', () => {
    const r = resolveLlmIntegrationForSelectedModel([ollama, aliyun], 'openai:chat:qwen-turbo');
    expect(r).not.toBeNull();
    expect(r?.integration.id).toBe('b');
    expect(r?.providerId).toBe('openai:chat:qwen-turbo');
  });

  it('returns Ollama integration when selected value matches ollama:chat id', () => {
    const r = resolveLlmIntegrationForSelectedModel(
      [ollama, aliyun],
      'ollama:chat:deepseek-r1:1.5b',
    );
    expect(r).not.toBeNull();
    expect(r?.integration.id).toBe('a');
    expect(r?.providerId).toBe('ollama:chat:deepseek-r1:1.5b');
  });

  it('returns LM Studio integration when selected value matches openai:chat id', () => {
    const r = resolveLlmIntegrationForSelectedModel(
      [ollama, aliyun, lmstudio],
      'openai:chat:qwen/qwen3-8b',
    );
    expect(r).not.toBeNull();
    expect(r?.integration.id).toBe('c');
    expect(r?.providerId).toBe('openai:chat:qwen/qwen3-8b');
  });

  it('routes SGLang models through the OpenAI-compatible provider', () => {
    const r = resolveLlmIntegrationForSelectedModel(
      [ollama, aliyun, lmstudio, sglang],
      'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
    );
    expect(r?.integration.id).toBe('d');
    expect(r?.providerId).toBe('openai:chat:Qwen/Qwen2.5-1.5B-Instruct');
  });

  it('returns null when no integration matches', () => {
    const r = resolveLlmIntegrationForSelectedModel([ollama], 'openai:chat:nonexistent');
    expect(r).toBeNull();
  });

  it('skips disabled integrations', () => {
    const disabled = { ...ollama, enabled: false };
    const r = resolveLlmIntegrationForSelectedModel([disabled, aliyun], 'openai:chat:qwen-turbo');
    expect(r?.integration.id).toBe('b');
  });
});

describe('looksLikeFullProviderId', () => {
  it('detects dodoguard-style ids', () => {
    expect(looksLikeFullProviderId('ollama:chat:foo')).toBe(true);
    expect(looksLikeFullProviderId('gpt-4')).toBe(false);
  });
});

describe('getLlmProviderPayloadForAttackTask', () => {
  const ollama: IntegrationConfig = {
    id: 'a',
    type: 'llm',
    name: 'testollama',
    provider: 'ollama',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:11434',
      models: [{ id: 'deepseek-r1:1.5b', name: 'ds' }],
    },
  };

  const aliyun: IntegrationConfig = {
    id: 'b',
    type: 'llm',
    name: '阿里云',
    provider: 'aliyun',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      models: [{ id: 'qwen-turbo', name: 'Qwen' }],
    },
  };

  const lmstudio: IntegrationConfig = {
    id: 'c',
    type: 'llm',
    name: 'LM Studio Local',
    provider: 'lmstudio',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:1234/v1',
      models: [{ id: 'qwen/qwen3-8b', name: 'Qwen3 8B' }],
    },
  };

  const sglang: IntegrationConfig = {
    id: 'd',
    type: 'llm',
    name: 'SGLang Local',
    provider: 'sglang',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:30000/v1',
      models: [{ id: 'Qwen/Qwen2.5-1.5B-Instruct', name: 'Qwen 1.5B' }],
    },
  };

  it('uses Aliyun config when model matches', () => {
    const p = getLlmProviderPayloadForAttackTask([ollama, aliyun], 'openai:chat:qwen-turbo');
    expect(p).not.toBeNull();
    expect(p?.id).toBe('openai:chat:qwen-turbo');
    expect(p?.config.apiBaseUrl).toContain('dashscope');
    expect(p?.matchedSelection).toBe(true);
  });

  it('uses LM Studio config with fallback api key when model matches', () => {
    const p = getLlmProviderPayloadForAttackTask(
      [ollama, aliyun, lmstudio],
      'openai:chat:qwen/qwen3-8b',
    );
    expect(p).not.toBeNull();
    expect(p?.id).toBe('openai:chat:qwen/qwen3-8b');
    expect(p?.config.apiBaseUrl).toBe('http://127.0.0.1:1234/v1');
    expect(p?.config.apiKey).toBe('lm-studio');
    expect(p?.config.apiKeyRequired).toBe(false);
    expect(p?.config.max_tokens).toBe(LM_STUDIO_DEFAULT_MAX_TOKENS);
    expect(p?.config.passthrough).toMatchObject({
      response_mode: 'standard',
      enable_thinking: false,
      enableThinking: false,
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(p?.matchedSelection).toBe(true);
  });

  it('uses SGLang config without requiring a real API key when model matches', () => {
    const p = getLlmProviderPayloadForAttackTask(
      [ollama, aliyun, lmstudio, sglang],
      'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
    );
    expect(p).not.toBeNull();
    expect(p?.id).toBe('openai:chat:Qwen/Qwen2.5-1.5B-Instruct');
    expect(p?.config.apiBaseUrl).toBe('http://127.0.0.1:30000/v1');
    expect(p?.config.apiKey).toBe('sglang');
    expect(p?.config.apiKeyRequired).toBe(false);
    expect(p?.matchedSelection).toBe(true);
  });

  it('returns null when no integrations', () => {
    expect(getLlmProviderPayloadForAttackTask([], 'openai:chat:x')).toBeNull();
  });
});

describe('resolveLlmIntegrationForSelectedModelFuzzy', () => {
  const lmstudio: IntegrationConfig = {
    id: 'c',
    type: 'llm',
    name: 'LM Studio Local',
    provider: 'lmstudio',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://127.0.0.1:1234/v1',
      models: [{ id: 'qwen/qwen3-8b', name: 'Qwen3 8B' }],
    },
  };

  it('matches by bare model suffix when full provider id differs', () => {
    const r = resolveLlmIntegrationForSelectedModelFuzzy([lmstudio], 'qwen/qwen3-8b');
    expect(r).not.toBeNull();
    expect(r?.providerId).toBe('openai:chat:qwen/qwen3-8b');
    expect(r?.matchKind).toBe('model_suffix');
  });

  it('extractChatModelSuffix parses openai:chat ids', () => {
    expect(extractChatModelSuffix('openai:chat:qwen/qwen3-8b')).toBe('qwen/qwen3-8b');
    expect(extractChatModelSuffix('qwen/qwen3-8b')).toBe('qwen/qwen3-8b');
  });
});

describe('local OpenAI-compatible defaults', () => {
  it('marks SGLang as optional-api-key', () => {
    expect(applySglangOpenAiDefaults({ apiBaseUrl: 'http://127.0.0.1:30000/v1' })).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:30000/v1',
      apiKey: 'sglang',
      apiKeyRequired: false,
      omitDefaultMaxTokens: true,
    });
    expect(
      applySglangOpenAiDefaults({ apiBaseUrl: 'http://127.0.0.1:30000/v1' }),
    ).not.toHaveProperty('max_tokens');
  });

  it('applies SGLang defaults by URL for ad-hoc provider loads', () => {
    expect(
      applyModelAwareNonStreamingDefaults(
        { apiBaseUrl: 'http://127.0.0.1:30000/v1' },
        'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
      ),
    ).toMatchObject({
      apiKey: 'sglang',
      apiKeyRequired: false,
      omitDefaultMaxTokens: true,
    });
  });

  it('normalizes SGLang base URLs before ad-hoc provider loads', () => {
    expect(
      applyModelAwareNonStreamingDefaults(
        { apiBaseUrl: 'http://127.0.0.1:30000' },
        'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
      ),
    ).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:30000/v1',
      baseUrl: 'http://127.0.0.1:30000/v1',
      apiKey: 'sglang',
      apiKeyRequired: false,
      omitDefaultMaxTokens: true,
    });
  });

  it('does not cap SGLang user token settings', () => {
    expect(
      applyModelAwareNonStreamingDefaults(
        { apiBaseUrl: 'http://127.0.0.1:30000/v1', max_tokens: 8192 },
        'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
      ),
    ).toMatchObject({
      max_tokens: 8192,
    });
    expect(
      applyModelAwareNonStreamingDefaults(
        {
          apiBaseUrl: 'http://127.0.0.1:30000/v1',
          max_tokens: 2048,
          max_completion_tokens: 16384,
        },
        'openai:chat:Qwen/Qwen2.5-1.5B-Instruct',
      ),
    ).toMatchObject({
      max_tokens: 2048,
      max_completion_tokens: 16384,
    });
  });

  it('omits the generic OpenAI default max_tokens for SGLang when unset', () => {
    const config = applySglangOpenAiDefaults({
      apiBaseUrl: 'http://127.0.0.1:30000/v1',
    });
    const provider = new OpenAiChatCompletionProvider('Qwen/Qwen2.5-1.5B-Instruct', {
      config,
    });

    const { body } = provider.getOpenAiBody('Hello');

    expect(body).not.toHaveProperty('max_tokens');
  });
});

describe('getLlmProviderPayloadForAttackTask strict matching', () => {
  const aliyun: IntegrationConfig = {
    id: 'b',
    type: 'llm',
    name: '阿里云',
    provider: 'aliyun',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      models: [{ id: 'qwen-turbo', name: 'Qwen' }],
    },
  };

  it('returns null when preferred model does not match any integration (no wrong fallback)', () => {
    const p = getLlmProviderPayloadForAttackTask([aliyun], 'openai:chat:qwen/qwen3-8b');
    expect(p).toBeNull();
  });
});

describe('applyLmStudioOpenAiDefaults', () => {
  it('sets max_tokens and thinking-disable passthrough fields', () => {
    const out = applyLmStudioOpenAiDefaults({ apiBaseUrl: 'http://127.0.0.1:1234/v1' });
    expect(out.max_tokens).toBe(4096);
    expect(out.passthrough).toEqual({
      response_mode: 'standard',
      enable_thinking: false,
      enableThinking: false,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('preserves user passthrough overrides', () => {
    const out = applyLmStudioOpenAiDefaults({
      passthrough: {
        response_mode: 'reasoning',
        chat_template_kwargs: { enable_thinking: true },
      },
    });
    expect(out.passthrough).toEqual({
      response_mode: 'reasoning',
      enable_thinking: false,
      enableThinking: false,
      chat_template_kwargs: { enable_thinking: true },
    });
  });
});

describe('isQwen3ModelName', () => {
  it('detects Qwen3 family model ids', () => {
    expect(isQwen3ModelName('qwen/qwen3-8b')).toBe(true);
    expect(isQwen3ModelName('Qwen3-14B')).toBe(true);
    expect(isQwen3ModelName('qwen2.5')).toBe(false);
  });
});

describe('applyQwen3NonStreamingDefaults', () => {
  it('sets enable_thinking false in passthrough', () => {
    const out = applyQwen3NonStreamingDefaults({});
    expect(out.passthrough).toEqual({
      enable_thinking: false,
      enableThinking: false,
      chat_template_kwargs: { enable_thinking: false },
    });
  });
});

describe('applyModelAwareNonStreamingDefaults', () => {
  it('applies Qwen3 enable_thinking for audit-style provider loads', () => {
    const out = applyModelAwareNonStreamingDefaults(
      { apiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      'openai:chat:qwen3-8b',
    );
    expect(out.passthrough).toMatchObject({ enable_thinking: false });
  });
});

describe('getLlmProviderPayloadForAttackTask Qwen3 on custom provider', () => {
  const customQwen3: IntegrationConfig = {
    id: 'd',
    type: 'llm',
    name: 'Custom OpenAI-compatible',
    provider: 'custom',
    enabled: true,
    testStatus: 'success',
    config: {
      apiBaseUrl: 'http://192.168.1.50:8080/v1',
      models: [{ id: 'qwen/qwen3-8b', name: 'Qwen3 8B' }],
    },
  };

  it('applies enable_thinking false when selected model is Qwen3', () => {
    const p = getLlmProviderPayloadForAttackTask([customQwen3], 'custom:chat:qwen/qwen3-8b');
    expect(p).not.toBeNull();
    expect(p?.config.passthrough).toMatchObject({
      enable_thinking: false,
      enableThinking: false,
      chat_template_kwargs: { enable_thinking: false },
    });
  });
});
