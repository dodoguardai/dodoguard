const DIFY_STREAM_ANSWER_EVENTS = new Set(['message', 'agent_message']);
const PREFERRED_WORKFLOW_OUTPUT_KEYS = ['text', 'result', 'answer', 'output', 'response'] as const;

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractAnswerFromParsed(parsed: Record<string, unknown>): string {
  const event = typeof parsed.event === 'string' ? parsed.event : undefined;
  if (typeof parsed.answer === 'string') {
    if (!event || DIFY_STREAM_ANSWER_EVENTS.has(event) || event === 'message_end') {
      return parsed.answer;
    }
  }
  if (typeof parsed.message === 'string' && parsed.code) {
    return `Dify API 错误 (${String(parsed.code)}): ${parsed.message}`;
  }
  if (parsed.output !== undefined) {
    return typeof parsed.output === 'string' ? parsed.output : JSON.stringify(parsed.output, null, 2);
  }
  const data = parsed.data;
  if (data && typeof data === 'object') {
    const dataObj = data as Record<string, unknown>;
    const outputs = dataObj.outputs;
    if (outputs && typeof outputs === 'object') {
      for (const key of PREFERRED_WORKFLOW_OUTPUT_KEYS) {
        const value = (outputs as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }
  }
  return '';
}

function parseDifySseText(sseText: string): string {
  const trimmed = sseText.trim();
  if (trimmed.startsWith('{') && !trimmed.includes('\ndata:')) {
    const parsed = tryParseJson(trimmed);
    return parsed ? extractAnswerFromParsed(parsed) : '';
  }

  let output = '';
  let workflowNodeOutputFallback = '';
  for (const line of sseText.split('\n')) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith('data:')) {
      continue;
    }
    const data = trimmedLine.slice(5).trim();
    if (!data || data === '[DONE]') {
      continue;
    }
    const parsed = tryParseJson(data);
    if (!parsed) {
      continue;
    }
    const event = typeof parsed.event === 'string' ? parsed.event : undefined;
    if (typeof parsed.answer === 'string' && (!event || DIFY_STREAM_ANSWER_EVENTS.has(event))) {
      output += parsed.answer;
    } else if (event === 'text_chunk' && typeof parsed.text === 'string') {
      output += parsed.text;
    } else if (event === 'message_end' && typeof parsed.answer === 'string' && parsed.answer) {
      if (!output.trim()) {
        output = parsed.answer;
      }
    } else if (event === 'workflow_finished' && !output.trim()) {
      output = extractAnswerFromParsed(parsed);
    } else if (event === 'node_finished') {
      const answer = extractAnswerFromParsed(parsed);
      if (answer.trim()) {
        workflowNodeOutputFallback = answer;
      }
    }
  }
  return output || workflowNodeOutputFallback;
}

export function formatDifyResponseForDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return raw;
  }
  if (!trimmed.startsWith('{') && !trimmed.includes('data:')) {
    return raw;
  }

  const streamed = parseDifySseText(trimmed);
  if (streamed.trim()) {
    return streamed.trim();
  }

  const parsed = tryParseJson(trimmed);
  if (parsed) {
    const answer = extractAnswerFromParsed(parsed);
    if (answer.trim()) {
      return answer.trim();
    }
  }

  return raw;
}
