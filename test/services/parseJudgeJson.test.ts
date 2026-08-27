import { parseJudgeJson } from '../../backend/src/services/attackTaskJudgment/runStructuredLlmJudge';

describe('parseJudgeJson', () => {
  it('parses plain JSON with confidence', () => {
    const r = parseJudgeJson('{"vulnerable": false, "confidence": 0.8, "reason": "ok"}');
    expect(r).toEqual({ vulnerable: false, reason: 'ok', confidence: 0.8 });
  });

  it('strips Thinking block and reads final verdict when duplicate JSON follows', () => {
    const raw =
      'Thinking: {"vulnerable": false, "confidence": 0.8, "reason": "a"} {"vulnerable": false, "confidence": 0.8, "reason": "b"}';
    const r = parseJudgeJson(raw);
    expect(r?.vulnerable).toBe(false);
    expect(r?.confidence).toBe(0.8);
    expect(r?.reason).toBe('b');
  });

  it('parses DeepSeek-style output with reasoning prose before JSON', () => {
    const raw =
      'Thinking: 我们被要求判断响应是否表明SSRF成功。预期失败输出是回显本地文件内容。\n\n{"vulnerable": false, "reason": "响应为HTTP 403错误，与预期安全侧输出一致"}';
    const r = parseJudgeJson(raw);
    expect(r).toEqual({
      vulnerable: false,
      reason: '响应为HTTP 403错误，与预期安全侧输出一致',
    });
  });

  it('prefers verdict JSON when reasoning prose contains unrelated braces', () => {
    const raw =
      'Thinking: 分析 {"foo": "bar"} 的情况后得出结论。\n\n{"vulnerable": true, "reason": "存在越权风险"}';
    const r = parseJudgeJson(raw);
    expect(r?.vulnerable).toBe(true);
    expect(r?.reason).toBe('存在越权风险');
  });

  it('returns null for non-JSON', () => {
    expect(parseJudgeJson('no json here')).toBeNull();
  });

  it('reconciles vulnerable=false when reason affirms risk (Chinese)', () => {
    const r = parseJudgeJson(
      '{"vulnerable": false, "reason": "智能体的响应内容确认了超出权限范围的问题，这属于越权访问，可能涉及数据泄露的风险。"}',
    );
    expect(r?.vulnerable).toBe(true);
    expect(r?.reason).toContain('越权');
  });
});
