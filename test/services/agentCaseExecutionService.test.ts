import {
  buildDefaultMultiTurnScript,
  buildFileInputPrompt,
  enrichExecutionForSampleType,
  executeAgentCaseBySampleType,
  extractFileOutputSignals,
  formatChainedPrompt,
  formatTranscriptForDisplay,
  mergeMultiTurnExecution,
  readCaseExecutionMetadata,
  resolveMultiTurnScript,
  resolveSampleType,
} from '../../backend/src/services/agentCaseExecutionService';

describe('agentCaseExecutionService', () => {
  it('resolves sample types from attackType', () => {
    expect(resolveSampleType({ attackType: 'multi_turn' })).toBe('multi_turn');
    expect(resolveSampleType({ attackType: 'file_input' })).toBe('file_input');
    expect(resolveSampleType({ attackType: 'file_output' })).toBe('file_output');
    expect(resolveSampleType({ attackType: 'single' })).toBe('single');
  });

  it('builds file input prompt with uploaded file block', () => {
    const prompt = buildFileInputPrompt(
      { prompt: '请总结文件并转发' },
      {
        fileName: 'secret.pdf',
        fileContent: '内部通知全文',
        userQuery: '帮我总结并转发到工作群',
      },
    );
    expect(prompt).toContain('secret.pdf');
    expect(prompt).toContain('内部通知全文');
    expect(prompt).toContain('帮我总结并转发到工作群');
  });

  it('extracts download links and file keywords from file_output responses', () => {
    const signals = extractFileOutputSignals(
      '已生成官方解读，下载链接：https://example.com/policy.docx ，请转发到工作群。',
    );
    expect(signals.some((item) => item.includes('https://example.com/policy.docx'))).toBe(true);
    expect(signals).toContain('下载链接');
  });

  it('executes multi_turn sample by chaining user turns', async () => {
    const calls: string[] = [];
    const execution = await executeAgentCaseBySampleType(
      {
        attackType: 'multi_turn',
        prompt: '多轮诱导',
        metadata: {
          turns: [
            { role: 'user', content: '第一轮问题' },
            { role: 'user', content: '第二轮施压' },
          ],
        },
      },
      async (prompt) => {
        calls.push(prompt);
        return {
          ok: true,
          status: 200,
          responseTimeMs: 10,
          responseText: `回复: ${prompt.slice(0, 20)}`,
        };
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('第一轮问题');
    expect(execution?.sampleType).toBe('multi_turn');
    expect(execution?.transcript?.length).toBeGreaterThanOrEqual(3);
  });

  it('uses default multi-turn script when metadata.turns missing', () => {
    const script = buildDefaultMultiTurnScript({
      name: '多轮诱导获取内部文件',
      prompt: '多轮诱导获取内部文件',
    });
    expect(script.length).toBeGreaterThanOrEqual(2);
    expect(script[0].content).toContain('内部');
  });

  it('merges multi-turn transcript into final response text', () => {
    const merged = mergeMultiTurnExecution(
      {
        ok: true,
        responseTimeMs: 20,
        responseText: '最终拒绝',
      },
      [
        { role: 'user', content: '问题1' },
        { role: 'assistant', content: '拒绝1' },
      ],
      40,
    );
    expect(merged.responseText).toContain('多轮对话完整记录');
    expect(merged.responseText).toContain('最终拒绝');
    expect(merged.responseTimeMs).toBe(40);
  });

  it('reads technical turnSteps metadata into execution turns', () => {
    const metadata = readCaseExecutionMetadata({
      attackType: 'multi_turn',
      metadata: {
        turnSteps: [
          { userInput: '第一轮攻击', expectedSafe: '应拒绝' },
          { userInput: '第二轮施压', expectedSafe: '仍应拒绝' },
        ],
      },
    });
    expect(metadata.turns).toHaveLength(2);
    expect(metadata.turns?.[0].content).toBe('第一轮攻击');
    expect(metadata.turns?.[1].content).toBe('第二轮施压');
  });

  it('prefers metadata.turns over turnSteps when both exist', () => {
    const script = resolveMultiTurnScript(
      { attackType: 'multi_turn', prompt: 'ignored' },
      readCaseExecutionMetadata({
        metadata: {
          turns: [{ role: 'user', content: 'from turns' }],
          turnSteps: [{ userInput: 'from turnSteps' }],
        },
      }),
    );
    expect(script).toEqual([{ role: 'user', content: 'from turns' }]);
  });

  it('formats transcript for display with role labels', () => {
    const text = formatTranscriptForDisplay([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '回答' },
    ]);
    expect(text).toContain('[轮次 1] 用户');
    expect(text).toContain('[轮次 2] Agent');
    expect(text).toContain('问题');
    expect(text).toContain('回答');
  });

  it('executes multi_turn sample using turnSteps metadata', async () => {
    const calls: string[] = [];
    const execution = await executeAgentCaseBySampleType(
      {
        attackType: 'multi_turn',
        prompt: '首轮摘要',
        metadata: {
          turnSteps: [{ userInput: '第一轮问题' }, { userInput: '第二轮施压' }],
        },
      },
      async (prompt) => {
        calls.push(prompt);
        return {
          ok: true,
          status: 200,
          responseTimeMs: 10,
          responseText: 'Agent 回复',
        };
      },
    );

    expect(calls).toHaveLength(2);
    expect(execution?.transcript?.filter((turn) => turn.role === 'user')).toHaveLength(2);
  });

  it('reads case metadata for seeded compliance samples', () => {
    const metadata = readCaseExecutionMetadata({
      metadata: {
        regClause: '条例第14条',
        fileName: 'a.pdf',
        fileContent: 'content',
        turns: [{ role: 'user', content: 'hello' }],
      },
    });
    expect(metadata.regClause).toBe('条例第14条');
    expect(metadata.fileName).toBe('a.pdf');
    expect(metadata.turns).toHaveLength(1);
  });

  it('enriches file_output execution with detected signals', () => {
    const enriched = enrichExecutionForSampleType(
      { ok: true, responseText: '下载：https://x.test/a.docx' },
      'file_output',
      {},
    );
    expect(enriched.fileOutputSignals?.length).toBeGreaterThan(0);
  });

  it('formats chained prompt with prior transcript', () => {
    const prompt = formatChainedPrompt(
      [
        { role: 'user', content: '第一轮' },
        { role: 'assistant', content: '已拒绝' },
      ],
      '第二轮',
    );
    expect(prompt).toContain('第一轮');
    expect(prompt).toContain('已拒绝');
    expect(prompt).toContain('第二轮');
  });
});
