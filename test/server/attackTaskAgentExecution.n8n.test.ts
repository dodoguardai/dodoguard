import { runN8nAttacksForTask } from '../../backend/src/services/attackTaskAgentExecution';
import { fetchWithProxy, fetchWithTimeout } from '../../backend/src/util/fetch/index';

jest.mock('../../backend/src/util/fetch/index', () => ({
  fetchWithProxy: jest.fn(),
  fetchWithTimeout: jest.fn(),
}));

const fetchWithProxyMock = fetchWithProxy as unknown as jest.Mock;
const fetchWithTimeoutMock = fetchWithTimeout as unknown as jest.Mock;

function mockResponse({
  ok,
  status,
  statusText,
  json,
}: {
  ok: boolean;
  status: number;
  statusText?: string;
  json: unknown;
}) {
  return {
    ok,
    status,
    statusText: statusText ?? 'OK',
    text: jest.fn().mockResolvedValue(JSON.stringify(json)),
  };
}

describe('runN8nAttacksForTask', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should run simple attack mode (one call per command)', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: {
          model: 'deepseek-r1:1.5b',
          created_at: '2026-04-09T09:25:54.684192Z',
          response: 'SIMPLE_OK',
          done: true,
          done_reason: 'stop',
        },
      }),
    );

    const logs: any[] = [];
    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'simple',
      compositeAttackConfig: undefined,
      taskVulnerabilities: [],
      pushLog: (entry: any) => logs.push(entry),
    } as any;

    await runN8nAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        webhookPath: '/webhook/dodoguard-agent',
        n8nApiKeyHeaderName: 'X-N8N-API-KEY',
        conversationId: '',
      },
      apiKey: 'secret-123',
      apiBaseUrl: 'https://n8n.example.com',
      userId: 'task-runner',
      inputs: { foo: 'bar' },
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        prompt: 'DodoGuard security test ping',
        inputs: { foo: 'bar' },
        user: 'task-runner',
      }),
    );
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toBe(
      'https://n8n.example.com/webhook/dodoguard-agent',
    );

    const n8nLogs = logs.filter((l) => l.source === 'n8n' && l.responsePreview);
    expect(n8nLogs).toHaveLength(1);
    expect(n8nLogs[0].responsePreview).toBe('SIMPLE_OK');
    expect(logs.some((l) => l.source === 'dify' || l.source === 'fastgpt')).toBe(false);
  });

  it('should run conversation attack mode (maxRounds calls)', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { reply: 'ROUND_1', conversation_id: 'convA' },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: [{ response: 'ROUND_2', conversation_id: 'convB' }],
        }),
      );

    const logs: any[] = [];
    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'conversation',
      compositeAttackConfig: {
        conversation: { maxRounds: 2, stopCondition: '' },
      },
      taskVulnerabilities: [],
      pushLog: (entry: any) => logs.push(entry),
    } as any;

    await runN8nAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        webhookPath: '/webhook/dodoguard-agent',
        n8nApiKeyHeaderName: 'X-N8N-API-KEY',
        conversationId: 'initConv',
      },
      apiKey: undefined,
      apiBaseUrl: 'https://n8n.example.com',
      userId: 'task-runner',
      inputs: {},
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(fetchWithTimeoutMock.mock.calls[0][1].body);
    expect(firstBody.conversation_id).toBe('initConv');
    expect(firstBody.prompt).toBe('DodoGuard security test ping');

    const secondBody = JSON.parse(fetchWithTimeoutMock.mock.calls[1][1].body);
    // conversationId should be updated from response round 1
    expect(secondBody.conversation_id).toBe('convA');
    expect(secondBody.prompt).toContain('[Follow-up round 2/2]');

    const n8nLogs = logs.filter(
      (l) => l.source === 'n8n' && typeof l.conversationRound === 'number',
    );
    expect(n8nLogs).toHaveLength(2);
    expect(n8nLogs.map((l) => l.responsePreview)).toEqual(['ROUND_1', 'ROUND_2']);
    expect(logs.some((l) => l.source === 'dify' || l.source === 'fastgpt')).toBe(false);
  });

  it('should run composite attack mode (respect maxAttempts + successCondition)', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { response: 'NOT_OK' },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { response: 'SUCCESS' },
        }),
      );

    const logs: any[] = [];
    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'composite',
      compositeAttackConfig: {
        stages: [
          {
            stageId: 's1',
            name: 'Stage 1',
            vulnerabilityIds: [],
            prerequisites: [],
            successCondition: 'response.text.includes("SUCCESS")',
            failureCondition: '',
            maxAttempts: 2,
          },
        ],
      },
      taskVulnerabilities: [],
      pushLog: (entry: any) => logs.push(entry),
    } as any;

    await runN8nAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        webhookPath: '/webhook/dodoguard-agent',
        n8nApiKeyHeaderName: 'X-N8N-API-KEY',
        conversationId: '',
      },
      apiKey: undefined,
      apiBaseUrl: 'https://n8n.example.com',
      userId: 'task-runner',
      inputs: {},
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2);

    const stageDone = logs.find((l) => l.source === 'system' && l.compositeStageId === 's1');
    expect(stageDone).toBeTruthy();
    expect(stageDone.message).toContain('succeeded');
    expect(logs.some((l) => l.source === 'dify' || l.source === 'fastgpt')).toBe(false);
  });

  it('should support flat request body mode and raw api key header', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: { response: 'FLAT_OK' },
      }),
    );

    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'simple',
      compositeAttackConfig: undefined,
      taskVulnerabilities: [],
      pushLog: (_entry: any) => {},
    } as any;

    await runN8nAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        webhookPath: '/webhook/idiom-solitaire',
        n8nApiKeyHeaderName: 'Authorization',
        n8nApiKeyPrefix: '',
        n8nRequestBodyMode: 'flat',
        n8nQueryFieldName: 'idiom',
      },
      apiKey: 'my-secret',
      apiBaseUrl: 'https://n8n.example.com',
      userId: 'task-runner',
      inputs: { locale: 'zh-CN' },
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchWithTimeoutMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        idiom: 'DodoGuard security test ping',
        locale: 'zh-CN',
      }),
    );
    expect(options.headers.Authorization).toBe('my-secret');
    expect(fetchWithProxyMock).not.toHaveBeenCalled();
  });

  it('should allow webhookUrl-only config without apiBaseUrl', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: { response: 'WEBHOOK_URL_OK' },
      }),
    );

    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'simple',
      compositeAttackConfig: undefined,
      taskVulnerabilities: [],
      pushLog: (_entry: any) => {},
    } as any;

    await runN8nAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        webhookUrl: 'https://n8n.example.com/webhook/absolute-endpoint',
      },
      apiKey: undefined,
      apiBaseUrl: '',
      userId: 'task-runner',
      inputs: {},
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock.mock.calls[0][0]).toBe(
      'https://n8n.example.com/webhook/absolute-endpoint',
    );
  });
});
