export function extractAnswerPayload(data: Record<string, unknown>): Record<string, unknown> {
  const answer = typeof data.answer === 'string' ? data.answer : '';
  return {
    kind: 'answer',
    answer_template: answer,
    refs: [] as string[],
    output_kinds: ['text'] as string[],
  };
}
