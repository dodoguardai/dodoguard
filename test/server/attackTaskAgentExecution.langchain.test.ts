import { runLangChainAttacksForTask } from '../../backend/src/services/attackTaskAgentExecution';
import { fetchWithProxy } from '../../backend/src/util/fetch/index';

jest.mock('../../backend/src/util/fetch/index', () => ({
  fetchWithProxy: jest.fn(),
}));

const fetchWithProxyMock = fetchWithProxy as unknown as jest.Mock;

function mockResponse({ ok, status, json }: { ok: boolean; status: number; json: unknown }) {
  return {
    ok,
    status,
    statusText: 'OK',
    text: jest.fn().mockResolvedValue(JSON.stringify(json)),
  };
}

describe('runApiAttacksForTask (langchain format)', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call langchain invoke endpoint with langchain payload', async () => {
    fetchWithProxyMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: { output: 'LANGCHAIN_OK' },
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

    await runLangChainAttacksForTask({
      ctx,
      db: {},
      attackCommandsTable: undefined,
      agentConfig: {
        apiBaseUrl: 'https://langchain.example.com',
      },
      userId: 'task-runner',
      inputs: { tenant: 'demo' },
    });

    expect(fetchWithProxyMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchWithProxyMock.mock.calls[0];
    expect(url).toBe('https://langchain.example.com/invoke');
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        input: 'DodoGuard security test ping',
        config: { configurable: {} },
        kwargs: {},
        metadata: { tenant: 'demo' },
      }),
    );

    const langchainLogs = logs.filter((l) => l.source === 'langchain' && l.responsePreview);
    expect(langchainLogs).toHaveLength(1);
    expect(langchainLogs[0].responsePreview).toBe('LANGCHAIN_OK');
  });
});
