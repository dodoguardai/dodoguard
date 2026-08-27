/**
 * Helpers for interactive multi-round single tests (pre-recorded transcripts).
 */

export type MultiRoundChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function agentTypeToLogSource(agentType: string): string {
  const t = String(agentType || '').toLowerCase();
  if (t === 'coze') {
    return 'coze';
  }
  if (t === 'fastgpt') {
    return 'fastgpt';
  }
  if (t === 'n8n') {
    return 'n8n';
  }
  if (t === 'tencent-adp') {
    return 'tencent-adp';
  }
  if (t === 'langchain') {
    return 'langchain';
  }
  if (t === 'api' || t === 'api-stream') {
    return 'api';
  }
  return 'dify';
}

export function formatMultiRoundTranscript(transcript: MultiRoundChatMessage[]): string {
  return transcript
    .map((m) => `${m.role === 'user' ? '【用户】' : '【智能体】'} ${m.content}`)
    .join('\n\n');
}

export function buildRunLogsFromMultiRoundTranscript(params: {
  agentType: string;
  transcript: MultiRoundChatMessage[];
  conversationId?: string;
  now: Date;
}): Record<string, unknown>[] {
  const source = agentTypeToLogSource(params.agentType);
  const logs: Record<string, unknown>[] = [];
  const ts = params.now.getTime();
  const roundCount = countMultiRoundUserTurns(params.transcript);

  logs.push({
    id: `run-${ts}-multi-round-start`,
    timestamp: params.now.toISOString(),
    level: 'info',
    source: 'system',
    message: `Multi-round interactive test (${roundCount} user turns, pre-recorded)`,
    conversationId: params.conversationId,
  });

  let round = 0;
  for (let i = 0; i < params.transcript.length; i++) {
    const msg = params.transcript[i];
    if (msg.role !== 'assistant') {
      continue;
    }
    round += 1;
    let userContent = '';
    for (let j = i - 1; j >= 0; j--) {
      if (params.transcript[j]?.role === 'user') {
        userContent = params.transcript[j]?.content ?? '';
        break;
      }
    }
    logs.push({
      id: `run-${ts}-multi-round-r${round}`,
      timestamp: params.now.toISOString(),
      level: 'info',
      source,
      message: `Multi-round test round ${round} (pre-recorded)`,
      prompt: userContent,
      responsePreview: msg.content,
      conversationRound: round,
      conversationId: params.conversationId,
      // First round anchors LLM judge + attack_result row for the whole conversation.
      ...(round === 1 ? { multiRoundPrimary: true } : {}),
    });
  }

  if (round === 0 && params.transcript.length > 0) {
    logs.push({
      id: `run-${ts}-multi-round-empty`,
      timestamp: params.now.toISOString(),
      level: 'warn',
      source,
      message: 'Multi-round test transcript (pre-recorded, no assistant replies)',
      prompt: formatMultiRoundTranscript(params.transcript.filter((m) => m.role === 'user')),
      responsePreview: '',
      conversationId: params.conversationId,
      multiRoundPrimary: true,
    });
  }

  return logs;
}

export function countMultiRoundUserTurns(transcript: MultiRoundChatMessage[]): number {
  return transcript.filter((m) => m.role === 'user' && m.content.trim()).length;
}

export function isMultiRoundPreRecordedMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  const mrt = (metadata as { multiRoundTest?: { preRecorded?: unknown } }).multiRoundTest;
  return mrt?.preRecorded === true;
}
