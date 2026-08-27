export interface AdpParsedEvent {
  eventName: string;
  payload: Record<string, unknown>;
}

export interface AdpParseState {
  deltaByMessageId: Map<string, string>;
  finalReply: string;
  errorMessage: string;
  done: boolean;
}

export function createAdpParseState(): AdpParseState {
  return {
    deltaByMessageId: new Map(),
    finalReply: '',
    errorMessage: '',
    done: false,
  };
}

function extractReplyFromResponseCompleted(payload: Record<string, unknown>): string {
  const response = payload.Response as Record<string, unknown> | undefined;
  const messages = response?.Messages;
  if (!Array.isArray(messages)) {
    return '';
  }
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      continue;
    }
    const m = msg as Record<string, unknown>;
    if (m.Type !== 'reply') {
      continue;
    }
    const contents = m.Contents;
    if (!Array.isArray(contents)) {
      continue;
    }
    const texts: string[] = [];
    for (const content of contents) {
      if (!content || typeof content !== 'object') {
        continue;
      }
      const c = content as Record<string, unknown>;
      if (c.Type === 'text' && typeof c.Text === 'string') {
        texts.push(c.Text);
      }
    }
    if (texts.length > 0) {
      return texts.join('');
    }
  }
  return '';
}

export function applyAdpEvent(
  state: AdpParseState,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (eventName === 'text.delta') {
    const messageId = String(payload.MessageId ?? '');
    const text = typeof payload.Text === 'string' ? payload.Text : '';
    if (messageId && text) {
      state.deltaByMessageId.set(messageId, (state.deltaByMessageId.get(messageId) ?? '') + text);
    }
    return;
  }

  if (eventName === 'text.replace') {
    const messageId = String(payload.MessageId ?? '');
    const text = typeof payload.Text === 'string' ? payload.Text : '';
    if (messageId) {
      state.deltaByMessageId.set(messageId, text);
    }
    return;
  }

  if (eventName === 'message.done') {
    const message = payload.Message as Record<string, unknown> | undefined;
    if (message?.Type === 'reply') {
      const contents = message.Contents;
      if (Array.isArray(contents)) {
        const texts: string[] = [];
        for (const content of contents) {
          if (!content || typeof content !== 'object') {
            continue;
          }
          const c = content as Record<string, unknown>;
          if (c.Type === 'text' && typeof c.Text === 'string') {
            texts.push(c.Text);
          }
        }
        if (texts.length > 0) {
          state.finalReply = texts.join('');
        }
      }
    }
    return;
  }

  if (eventName === 'response.completed') {
    const reply = extractReplyFromResponseCompleted(payload);
    if (reply) {
      state.finalReply = reply;
    }
    state.done = true;
    return;
  }

  if (eventName === 'error') {
    const err = payload.Error as Record<string, unknown> | undefined;
    state.errorMessage =
      (typeof err?.Message === 'string' && err.Message) ||
      (typeof payload.Message === 'string' && payload.Message) ||
      'ADP error event';
    state.done = true;
    return;
  }

  if (eventName === 'done') {
    state.done = true;
  }
}

export function parseAdpSseText(sseText: string): AdpParseState {
  const state = createAdpParseState();
  const normalized = sseText.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) {
      continue;
    }

    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const dataRaw = dataLines.join('\n').trim();
    if (!dataRaw || dataRaw === '[DONE]') {
      if (eventName === 'done' || dataRaw === '[DONE]') {
        applyAdpEvent(state, 'done', {});
      }
      continue;
    }

    try {
      const payload = JSON.parse(dataRaw) as Record<string, unknown>;
      const resolvedEvent = typeof payload.Type === 'string' ? String(payload.Type) : eventName;
      applyAdpEvent(state, resolvedEvent, payload);
    } catch {
      // ignore malformed SSE chunks
    }
  }

  return state;
}

export function resolveAdpPreview(state: AdpParseState): string {
  if (state.finalReply.trim()) {
    return state.finalReply.trim();
  }
  const deltas = [...state.deltaByMessageId.values()].filter(Boolean);
  if (deltas.length > 0) {
    return deltas.join('\n').trim();
  }
  return state.errorMessage.trim();
}

export function parseAdpSocketIoEventPacket(packet: string): AdpParsedEvent | null {
  if (!packet.startsWith('42')) {
    return null;
  }
  try {
    const parsed = JSON.parse(packet.slice(2)) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 2) {
      return null;
    }
    const eventName = String(parsed[0]);
    const payload =
      parsed[1] && typeof parsed[1] === 'object' && !Array.isArray(parsed[1])
        ? (parsed[1] as Record<string, unknown>)
        : {};
    return { eventName, payload };
  } catch {
    return null;
  }
}
