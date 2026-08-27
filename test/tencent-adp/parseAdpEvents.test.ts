import { parseAdpSseText, resolveAdpPreview } from '../../backend/src/tencent-adp/parseAdpEvents';

describe('parseAdpSseText', () => {
  it('extracts reply text from response.completed SSE event', () => {
    const sse = [
      'event: text.delta',
      'data: {"Type":"text.delta","MessageId":"rpl_1","Text":"你好"}',
      '',
      'event: response.completed',
      'data: {"Type":"response.completed","Response":{"Messages":[{"Type":"reply","Contents":[{"Type":"text","Text":"你好，有什么可以帮您？"}]}]}}',
      '',
      'event: done',
      'data: [DONE]',
      '',
    ].join('\n');

    const state = parseAdpSseText(sse);
    expect(resolveAdpPreview(state)).toBe('你好，有什么可以帮您？');
  });

  it('falls back to accumulated text.delta when no response.completed reply', () => {
    const sse = [
      'event: text.delta',
      'data: {"Type":"text.delta","MessageId":"rpl_1","Text":"partial "}',
      '',
      'event: text.delta',
      'data: {"Type":"text.delta","MessageId":"rpl_1","Text":"reply"}',
      '',
    ].join('\n');

    const state = parseAdpSseText(sse);
    expect(resolveAdpPreview(state)).toBe('partial reply');
  });

  it('captures error events', () => {
    const sse = [
      'event: error',
      'data: {"Type":"error","Error":{"Code":460501,"Message":"无法回答"}}',
      '',
    ].join('\n');

    const state = parseAdpSseText(sse);
    expect(state.errorMessage).toBe('无法回答');
    expect(state.done).toBe(true);
  });
});
