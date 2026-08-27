import { runFastGptAttacksForTask } from '../../backend/src/services/attackTaskAgentExecution';
import { fetchWithTimeout } from '../../backend/src/util/fetch/index';

jest.mock('../../backend/src/util/fetch/index', () => {
  const actual = jest.requireActual<typeof import('../../backend/src/util/fetch/index')>(
    '../../backend/src/util/fetch/index',
  );
  return {
    ...actual,
    fetchWithTimeout: jest.fn(),
  };
});

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

describe('runFastGptAttacksForTask', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should run simple attack mode (POST /api/v1/chat/completions)', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: {
          choices: [{ message: { role: 'assistant', content: 'FASTGPT_OK' } }],
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

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        conversationId: '',
      },
      apiKey: 'fastgpt-secret',
      apiBaseUrl: 'https://fastgpt.example.com',
      userId: 'task-runner',
      inputs: { uid: 'u1', name: 'tester' },
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchWithTimeoutMock.mock.calls[0];
    expect(url).toBe('https://fastgpt.example.com/api/v1/chat/completions');
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        stream: false,
        detail: false,
        messages: [{ role: 'user', content: 'DodoGuard security test ping' }],
        variables: { uid: 'u1', name: 'tester' },
      }),
    );
    expect(options.headers.Authorization).toBe('Bearer fastgpt-secret');

    const fastgptLogs = logs.filter((l) => l.source === 'fastgpt' && l.responsePreview);
    expect(fastgptLogs).toHaveLength(1);
    expect(fastgptLogs[0].responsePreview).toBe('FASTGPT_OK');
  });

  it('should extract assistant text from OpenAI-style response body (id, usage, choices)', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: {
          id: 'test',
          model: '',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 1 },
          choices: [
            {
              message: { role: 'assistant', content: '您好呀！我是王主任的小助理' },
              finish_reason: 'stop',
              index: 0,
            },
          ],
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

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: { conversationId: '' },
      apiKey: 'fastgpt-secret',
      apiBaseUrl: 'https://fastgpt.example.com',
      userId: 'task-runner',
      inputs: {},
    });

    const fastgptLogs = logs.filter((l) => l.source === 'fastgpt' && l.responsePreview);
    expect(fastgptLogs).toHaveLength(1);
    expect(fastgptLogs[0].responsePreview).toBe('您好呀！我是王主任的小助理');
  });

  it('should extract text when message.content is a multimodal parts array', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: [
                  { type: 'text', text: 'partA' },
                  { type: 'text', text: 'partB' },
                ],
              },
            },
          ],
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

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {},
      apiKey: 'k',
      apiBaseUrl: 'https://x.com',
      userId: 'u',
      inputs: {},
    });

    const fastgptLogs = logs.filter((l) => l.source === 'fastgpt' && l.responsePreview);
    expect(fastgptLogs[0].responsePreview).toBe('partApartB');
  });

  it('should include chatId when conversationId is set', async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: { choices: [{ message: { content: 'OK' } }] },
      }),
    );

    const ctx = {
      now: new Date('2026-01-01T00:00:00.000Z'),
      attackMode: 'simple',
      compositeAttackConfig: undefined,
      taskVulnerabilities: [],
      pushLog: (_entry: any) => {},
    } as any;

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: { conversationId: 'chat-abc' },
      apiKey: 'k',
      apiBaseUrl: 'https://x.com',
      userId: 'u',
      inputs: {},
    });

    const body = JSON.parse(fetchWithTimeoutMock.mock.calls[0][1].body);
    expect(body.chatId).toBe('chat-abc');
  });

  it('should run conversation attack mode for multiple rounds', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { choices: [{ message: { content: 'R1' } }] },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { choices: [{ message: { content: 'R2' } }] },
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

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: { conversationId: 'fixed-chat' },
      apiKey: 'k',
      apiBaseUrl: 'https://x.com',
      userId: 'u',
      inputs: {},
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchWithTimeoutMock.mock.calls[0][1].body).chatId).toBe('fixed-chat');
    expect(JSON.parse(fetchWithTimeoutMock.mock.calls[1][1].body).chatId).toBe('fixed-chat');
    const secondPrompt = JSON.parse(fetchWithTimeoutMock.mock.calls[1][1].body).messages[0].content;
    expect(secondPrompt).toContain('[Follow-up round 2/2]');

    const rounds = logs.filter(
      (l) => l.source === 'fastgpt' && typeof l.conversationRound === 'number',
    );
    expect(rounds).toHaveLength(2);
  });

  it('should run composite attack mode with successCondition', async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { choices: [{ message: { content: 'no' } }] },
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          status: 200,
          json: { choices: [{ message: { content: 'SUCCESS_LINE' } }] },
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

    await runFastGptAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: { conversationId: '' },
      apiKey: 'k',
      apiBaseUrl: 'https://x.com',
      userId: 'u',
      inputs: {},
    });

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2);
    const stageDone = logs.find((l) => l.source === 'system' && l.compositeStageId === 's1');
    expect(stageDone?.message).toContain('succeeded');
  });
});
