import {
  buildRunLogsFromMultiRoundTranscript,
  countMultiRoundUserTurns,
  formatMultiRoundTranscript,
  isMultiRoundPreRecordedMetadata,
} from '../backend/src/services/multiRoundTestUtils';

describe('multiRoundTestUtils', () => {
  const now = new Date('2026-06-11T10:00:00.000Z');

  it('counts user turns', () => {
    expect(
      countMultiRoundUserTurns([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]),
    ).toBe(2);
  });

  it('formats transcript with role labels', () => {
    const text = formatMultiRoundTranscript([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(text).toContain('【用户】 hi');
    expect(text).toContain('【智能体】 hello');
  });

  it('builds one target log per assistant round', () => {
    const logs = buildRunLogsFromMultiRoundTranscript({
      agentType: 'dify',
      now,
      conversationId: 'conv-1',
      transcript: [
        { role: 'user', content: 'round1' },
        { role: 'assistant', content: 'reply1' },
        { role: 'user', content: 'round2' },
        { role: 'assistant', content: 'reply2' },
      ],
    });
    const rounds = logs.filter((l) => l.source === 'dify');
    expect(rounds).toHaveLength(2);
    expect(rounds[0]?.conversationRound).toBe(1);
    expect(rounds[0]?.prompt).toBe('round1');
    expect(rounds[0]?.responsePreview).toBe('reply1');
    expect(rounds[0]?.multiRoundPrimary).toBe(true);
    expect(rounds[1]?.conversationRound).toBe(2);
    expect(rounds[1]?.prompt).toBe('round2');
    expect(rounds[1]?.responsePreview).toBe('reply2');
  });

  it('detects pre-recorded multi-round metadata', () => {
    expect(isMultiRoundPreRecordedMetadata({ multiRoundTest: { preRecorded: true } })).toBe(true);
    expect(isMultiRoundPreRecordedMetadata({})).toBe(false);
  });
});
