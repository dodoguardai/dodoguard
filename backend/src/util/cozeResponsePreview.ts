/**
 * Coze Open API chat response → human-readable preview (shared by execution + reports).
 *
 * v2 `/open_api/v2/chat` often returns `{ messages: [...], conversation_id, code, msg }` at the **root**
 * (not under `data`). Prefer `type: "answer"` over `verbose` / `follow_up`.
 */

function cozeExtractFromMessagesArray(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }
  const items = messages.filter((m) => m && typeof m === 'object') as Record<string, unknown>[];
  const contentOf = (o: Record<string, unknown>): string => {
    const c =
      typeof o.content === 'string'
        ? o.content.trim()
        : typeof o.text === 'string'
          ? o.text.trim()
          : '';
    return c;
  };
  const isAssistant = (o: Record<string, unknown>) => {
    const role = String(o.role ?? '').toLowerCase();
    return role === 'assistant' || role === '';
  };

  for (const o of items) {
    if (!isAssistant(o)) {
      continue;
    }
    if (String(o.type ?? '').toLowerCase() === 'answer') {
      const c = contentOf(o);
      if (c) {
        return c;
      }
    }
  }
  for (const o of items) {
    if (!isAssistant(o)) {
      continue;
    }
    const typ = String(o.type ?? '').toLowerCase();
    if (typ === 'verbose') {
      continue;
    }
    const c = contentOf(o);
    if (c) {
      return c;
    }
  }
  for (const o of items) {
    if (!isAssistant(o)) {
      continue;
    }
    const c = contentOf(o);
    if (c) {
      return c;
    }
  }
  return undefined;
}

function cozeExtractDataAssistantText(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }
  const d = data as Record<string, unknown>;
  for (const k of ['content', 'answer', 'output', 'text'] as const) {
    const v = d[k];
    if (typeof v === 'string' && v.trim() !== '') {
      return v.trim();
    }
  }
  const dm = d.msg;
  if (typeof dm === 'string' && dm.trim() !== '' && dm.trim().toLowerCase() !== 'success') {
    return dm.trim();
  }
  const messages = d.messages;
  const fromNested = cozeExtractFromMessagesArray(messages);
  if (fromNested) {
    return fromNested;
  }
  return undefined;
}

function cozeSummarizeDataPayload(data: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof data.status === 'string' && data.status.trim() !== '') {
    parts.push(`[Coze] status=${data.status.trim()}`);
  }
  if (typeof data.conversation_id === 'string' && data.conversation_id.trim() !== '') {
    parts.push(`conversation_id=${data.conversation_id.trim()}`);
  }
  if (typeof data.id === 'string' && data.id.trim() !== '') {
    parts.push(`message_id=${data.id.trim()}`);
  }
  const le = data.last_error;
  if (le && typeof le === 'object' && !Array.isArray(le)) {
    const o = le as Record<string, unknown>;
    const code = o.code;
    const em = typeof o.msg === 'string' ? o.msg.trim() : '';
    const codeNum = typeof code === 'number' ? code : Number(code);
    if (Number.isFinite(codeNum) && codeNum !== 0) {
      parts.push(`last_error: ${codeNum}${em ? ` ${em}` : ''}`);
    } else if (em) {
      parts.push(`last_error: ${em}`);
    }
  }
  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return JSON.stringify(data, null, 2);
}

function isTrivialCozeMsg(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'success' || t === '"success"' || t === 'ok';
}

export function parseCozePreview(rawText: string): string {
  const preview = rawText;
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed == null || typeof parsed !== 'object') {
      if (typeof parsed === 'string' && isTrivialCozeMsg(parsed)) {
        return '—';
      }
      return preview;
    }
    if (Array.isArray(parsed)) {
      return preview;
    }

    const root = parsed as Record<string, unknown>;

    /** DB / 网关可能把整段 v2 响应放在 `preview` 里（对象或 JSON 字符串） */
    const pv = root.preview;
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      const fromPvObj = cozeExtractDataAssistantText(pv);
      if (fromPvObj) {
        return fromPvObj;
      }
    }
    if (typeof pv === 'string' && pv.trim().startsWith('{')) {
      const inner = parseCozePreview(pv.trim());
      if (inner.trim() && !isTrivialCozeMsg(inner)) {
        return inner;
      }
    }

    const data = root.data;
    const fromData = cozeExtractDataAssistantText(data);
    if (fromData) {
      return fromData;
    }

    const fromRootMessages = cozeExtractFromMessagesArray(root.messages);
    if (fromRootMessages) {
      return fromRootMessages;
    }

    const codeRaw = root.code;
    const codeNum = typeof codeRaw === 'number' ? codeRaw : Number(codeRaw);
    const topMsg =
      typeof root.msg === 'string'
        ? root.msg.trim()
        : typeof root.message === 'string'
          ? String(root.message).trim()
          : '';

    if (topMsg && Number.isFinite(codeNum) && codeNum !== 0) {
      return topMsg;
    }

    if (data && typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return cozeSummarizeDataPayload(data as Record<string, unknown>);
    }

    const conv = root.conversation_id;
    if (
      typeof conv === 'string' &&
      conv.trim() !== '' &&
      Number.isFinite(codeNum) &&
      codeNum === 0
    ) {
      return `[Coze] code=0 · conversation_id=${conv.trim()}（响应无可用 messages 正文，详见原始 JSON）`;
    }

    if (topMsg && topMsg.toLowerCase() !== 'success') {
      return topMsg;
    }

    return JSON.stringify(root, null, 2);
  } catch {
    if (isTrivialCozeMsg(preview)) {
      return '—';
    }
    return preview;
  }
}
