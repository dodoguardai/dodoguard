import {
  extractAuditShapedJsonObject,
  extractBalancedJsonObject,
  extractFirstParseableJsonObject,
  normalizeDifyAuditLlmJson,
  parseDifyAuditModelJsonOutput,
  stripMarkdownJsonFence,
  unwrapJsonStringLayers,
  unwrapKnownAuditWrappers,
} from '../../backend/src/services/difyConfigAuditParseModelJson';

describe('difyConfigAuditParseModelJson', () => {
  const minimal = {
    summary: 'ok',
    overallRisk: 'low',
    findings: [],
    recommendations: [],
  };

  it('parses plain JSON string', () => {
    expect(parseDifyAuditModelJsonOutput(JSON.stringify(minimal))).toEqual(minimal);
  });

  it('returns object as-is', () => {
    expect(parseDifyAuditModelJsonOutput({ ...minimal })).toEqual(minimal);
  });

  it('strips markdown json fence', () => {
    const wrapped = '```json\n' + JSON.stringify(minimal) + '\n```';
    expect(parseDifyAuditModelJsonOutput(wrapped)).toEqual(minimal);
  });

  it('parses JSON after preamble text', () => {
    const text = 'Here you go:\n' + JSON.stringify(minimal) + '\nThanks.';
    expect(parseDifyAuditModelJsonOutput(text)).toEqual(minimal);
  });

  it('parses fenced JSON after preamble', () => {
    const text = 'Analysis complete.\n```json\n' + JSON.stringify(minimal) + '\n```';
    expect(parseDifyAuditModelJsonOutput(text)).toEqual(minimal);
  });

  it('extractBalancedJsonObject handles strings with braces', () => {
    const inner = '{"x": "a { b } c"}';
    const full = `prefix ${inner} suffix`;
    expect(extractBalancedJsonObject(full)).toBe(inner);
  });

  it('stripMarkdownJsonFence extracts inner content', () => {
    expect(stripMarkdownJsonFence('  ```json\n{"a":1}\n```  ')).toBe('{"a":1}');
  });

  it('throws on empty', () => {
    expect(() => parseDifyAuditModelJsonOutput('')).toThrow(/Empty model output/);
  });

  it('throws when no JSON object', () => {
    expect(() => parseDifyAuditModelJsonOutput('just prose')).toThrow(/non-JSON/);
  });

  it('parses OpenAI-style content parts array', () => {
    const parts = [{ type: 'text', text: JSON.stringify(minimal) }];
    expect(parseDifyAuditModelJsonOutput(parts as unknown)).toEqual(minimal);
  });

  it('parses JSON after Thinking: preamble (DeepSeek / DashScope)', () => {
    const preamble =
      'Thinking: long reasoning text without braces then newline\n\n' + JSON.stringify(minimal);
    expect(parseDifyAuditModelJsonOutput(preamble)).toEqual(minimal);
  });

  it('extractFirstParseableJsonObject skips invalid brace at start', () => {
    const badThenGood = 'intro { not json } ... ' + JSON.stringify(minimal);
    expect(extractFirstParseableJsonObject(badThenGood)).toBe(JSON.stringify(minimal));
  });

  it('unwrapJsonStringLayers decodes double-encoded JSON string root', () => {
    const inner = JSON.stringify(minimal);
    const doubleEncoded = JSON.stringify(inner);
    expect(unwrapJsonStringLayers(JSON.parse(doubleEncoded))).toEqual(minimal);
    expect(unwrapJsonStringLayers(doubleEncoded)).toEqual(minimal);
  });

  it('normalizeDifyAuditLlmJson unwraps many JSON string layers', () => {
    let s: string = JSON.stringify(minimal);
    for (let i = 0; i < 6; i++) {
      s = JSON.stringify(s);
    }
    expect(normalizeDifyAuditLlmJson(s)).toEqual(minimal);
  });

  it('normalizeDifyAuditLlmJson lifts data / result wrappers', () => {
    const wrapped = { data: minimal };
    expect(normalizeDifyAuditLlmJson(wrapped)).toEqual(minimal);
    expect(normalizeDifyAuditLlmJson({ result: minimal })).toEqual(minimal);
  });

  it('parseDifyAuditModelJsonOutput hoists JSON string from content / choices.message.content', () => {
    const json = JSON.stringify(minimal);
    expect(parseDifyAuditModelJsonOutput({ content: json })).toEqual(minimal);
    expect(
      parseDifyAuditModelJsonOutput({
        choices: [{ message: { content: json } }],
      }),
    ).toEqual(minimal);
  });

  it('unwrapKnownAuditWrappers parses string-valued data field', () => {
    expect(unwrapKnownAuditWrappers({ data: JSON.stringify(minimal) })).toEqual(minimal);
  });

  it('extractAuditShapedJsonObject prefers JSON object at end after prose', () => {
    const prose =
      '[stage_name]: blah blah 中文说明 no json here ' + JSON.stringify(minimal) + ' tail';
    const blob = extractAuditShapedJsonObject(prose);
    expect(blob).toBe(JSON.stringify(minimal));
    expect(parseDifyAuditModelJsonOutput(prose)).toEqual(minimal);
  });
});
