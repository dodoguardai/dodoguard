import {
  analyzeDifyConfigYaml,
  assertDifyAppExport,
  extractSecurityRelevantSubset,
  parseDifyExportYaml,
} from '../../backend/src/services/difyConfigAuditService';
import { loadApiProviders } from '../../backend/src/providers/index';

jest.mock('../../backend/src/providers/index', () => ({
  loadApiProviders: jest.fn(),
}));

describe('difyConfigAuditService', () => {
  beforeEach(() => {
    jest.mocked(loadApiProviders).mockReset();
  });

  it('parses valid minimal Dify-like YAML', () => {
    const yaml = `kind: app
version: "0.1"
app:
  name: TestApp
  mode: workflow
workflow:
  features: {}
  graph:
    nodes: []
    edges: []
`;
    const root = parseDifyExportYaml(yaml);
    expect(root).toBeDefined();
    assertDifyAppExport(root);
    const { subset, truncated } = extractSecurityRelevantSubset(root as Record<string, unknown>);
    expect(subset.app).toEqual({ name: 'TestApp', mode: 'workflow' });
    expect(truncated).toBe(false);
  });

  it('rejects YAML without workflow', () => {
    const yaml = `kind: app
app:
  name: X
`;
    const root = parseDifyExportYaml(yaml);
    expect(() => assertDifyAppExport(root)).toThrow(/Missing workflow/);
  });

  it('rejects invalid YAML', () => {
    expect(() => parseDifyExportYaml('[')).toThrow(/Invalid YAML/);
  });

  it('retries with a compact payload only after a model context-length error', async () => {
    const nodesYaml = Array.from(
      { length: 100 },
      (_, index) => `      - id: node-${index}-${'workflow-detail-'.repeat(8)}
        type: llm
        data:
          title: Large LLM Node ${index}
          desc: security relevant workflow detail`,
    ).join('\n');
    const yaml = `kind: app
version: "0.1"
app:
  name: LongApp
  mode: workflow
workflow:
  features: {}
  graph:
    nodes:
${nodesYaml}
    edges: []
`;
    const responses = [
      {
        error:
          'API error: 400 Bad Request {"message":"The input is longer than the model context length"}',
      },
      {
        output: JSON.stringify({
          summary: 'No major risks found.',
          overallRisk: 'low',
          findings: [],
          recommendations: [],
          warnings: [],
        }),
      },
    ];
    const callApi = jest.fn(function (this: { initializationPromise?: Promise<void> | null }) {
      expect(this.initializationPromise).toBeNull();
      return Promise.resolve(responses.shift());
    });

    jest
      .mocked(loadApiProviders)
      .mockResolvedValue([{ id: 'mock-provider', initializationPromise: null, callApi } as any]);

    const result = await analyzeDifyConfigYaml({
      yamlText: yaml,
      provider: {
        id: 'openai:chat:qwen-local',
        config: { apiBaseUrl: 'http://127.0.0.1:30000/v1' },
      },
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    const firstPrompt = callApi.mock.calls[0][0] as string;
    const secondPrompt = callApi.mock.calls[1][0] as string;
    expect(firstPrompt.length).toBeGreaterThan(secondPrompt.length);
    expect(firstPrompt).not.toContain('truncated after model context-length error');
    expect(secondPrompt).toContain('truncated after model context-length error');
    expect(result.truncated).toBe(true);
  });

  it('retries with a smaller completion budget when total requested tokens exceed context', async () => {
    const yaml = `kind: app
version: "0.1"
app:
  name: SmallApp
  mode: workflow
workflow:
  features: {}
  graph:
    nodes:
      - id: node-1
        type: llm
        data:
          title: Small LLM Node
    edges: []
`;
    const responses = [
      {
        error:
          'API error: 400 Bad Request {"message":"Requested token count exceeds the model\'s maximum context length of 4096 tokens. You requested a total of 6435 tokens: 2339 tokens from the input messages and 4096 tokens for the completion."}',
      },
      {
        output: JSON.stringify({
          summary: 'No major risks found.',
          overallRisk: 'low',
          findings: [],
          recommendations: [],
          warnings: [],
        }),
      },
    ];
    const callApi = jest.fn(function (this: { initializationPromise?: Promise<void> | null }) {
      expect(this.initializationPromise).toBeNull();
      return Promise.resolve(responses.shift());
    });

    jest
      .mocked(loadApiProviders)
      .mockResolvedValue([{ id: 'mock-provider', initializationPromise: null, callApi } as any]);

    const result = await analyzeDifyConfigYaml({
      yamlText: yaml,
      provider: {
        id: 'openai:chat:qwen-local',
        config: { apiBaseUrl: 'http://127.0.0.1:30000/v1' },
      },
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(loadApiProviders).toHaveBeenCalledTimes(2);
    expect(jest.mocked(loadApiProviders).mock.calls[1][0]).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          max_tokens: 1024,
          max_completion_tokens: 1024,
        }),
      }),
    ]);
    const secondPrompt = callApi.mock.calls[1][0] as string;
    expect(secondPrompt).not.toContain('truncated after model context-length error');
    expect(result.truncated).toBe(false);
  });
});
