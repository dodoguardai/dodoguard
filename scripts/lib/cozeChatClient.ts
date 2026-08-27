/**
 * Coze POST /v3/chat 客户端与多轮会话（CLI 漏洞库扫描用）。
 * 默认 stream: true，解析 SSE；若响应为 application/json 则按整包解析。
 *
 * 超时：环境变量 COZE_CHAT_TIMEOUT_MS（毫秒），默认 300000；范围 15000–900000。
 * 拒答/敏感类 prompt 偶发流式长时间无结束包时可适当调大，或配合 scan --no-stream。
 */

function resolveCozeChatTimeoutMs(): number {
  const raw = Number(process.env.COZE_CHAT_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1) {
    return 300_000;
  }
  return Math.min(Math.max(Math.floor(raw), 15_000), 900_000);
}

export function normalizeCozeApiBaseUrl(baseUrl: string): string {
  let u = (baseUrl || '').trim().replace(/\/$/, '');
  if (u.endsWith('/v3/chat')) {
    u = u.slice(0, -'/v3/chat'.length).replace(/\/$/, '');
  }
  return u;
}

export type CozeChatTurn = { content: string; parameters: Record<string, unknown> };

export type CozeYamlTurnsSource = {
  content?: string;
  parameters?: Record<string, unknown>;
  steps?: { content: string; parameters?: Record<string, unknown> }[];
};

export function getCozeChatTurnsFromYaml(
  source: CozeYamlTurnsSource,
  contextLabel: string,
): CozeChatTurn[] {
  const baseParams = (source.parameters || {}) as Record<string, unknown>;
  if (source.steps && source.steps.length > 0) {
    for (let i = 0; i < source.steps.length; i++) {
      const c = source.steps[i]?.content?.trim();
      if (!c) {
        throw new Error(`${contextLabel}: steps[${i}] 缺少非空 content`);
      }
    }
    return source.steps.map((s) => ({
      content: s.content.trim(),
      parameters: { ...baseParams, ...(s.parameters || {}) },
    }));
  }
  const c = source.content?.trim();
  if (!c) {
    throw new Error(`${contextLabel}: 缺少 content 或非空 steps`);
  }
  return [{ content: c, parameters: { ...baseParams } }];
}

export function buildSerializedCozeAttackContent(turns: CozeChatTurn[]): string {
  const block = (content: string, parameters: Record<string, unknown>) => {
    const t = content.trim();
    if (!parameters || Object.keys(parameters).length === 0) {
      return t;
    }
    return `${t}\n\n--- parameters (JSON) ---\n${JSON.stringify(parameters, null, 2)}`;
  };
  if (turns.length === 1) {
    return block(turns[0].content, turns[0].parameters);
  }
  return turns
    .map((x, i) => `--- 第 ${i + 1} 轮 ---\n${block(x.content, x.parameters)}`)
    .join('\n\n');
}

function deepExtractConversationId(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  const o = obj as Record<string, unknown>;
  const keys = ['conversation_id', 'conversationId'] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  for (const v of Object.values(o)) {
    const found = deepExtractConversationId(v);
    if (found) {
      return found;
    }
  }
  return null;
}

function accumulateAnswerFromObject(obj: unknown, acc: { text: string }): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.content === 'string' && o.content) {
    acc.text += o.content;
  }
  if (o.delta && typeof o.delta === 'object') {
    accumulateAnswerFromObject(o.delta, acc);
  }
  if (o.message && typeof o.message === 'object') {
    accumulateAnswerFromObject(o.message, acc);
  }
  if (Array.isArray(o.content)) {
    for (const part of o.content) {
      accumulateAnswerFromObject(part, acc);
    }
  }
}

function parseJsonPayload(data: string): unknown {
  const t = data.trim();
  if (!t || t === '[DONE]') {
    return null;
  }
  try {
    const first = JSON.parse(t) as unknown;
    if (typeof first === 'string') {
      try {
        return JSON.parse(first) as unknown;
      } catch {
        return first;
      }
    }
    return first;
  } catch {
    return null;
  }
}

function parseCozeSse(raw: string): { answer: string; conversationId: string } {
  const acc = { text: '' };
  let conversationId = '';
  const blocks = raw.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    let event = '';
    const dataParts: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trimStart());
      }
    }
    if (dataParts.length === 0) {
      continue;
    }
    const dataStr = dataParts.join('\n');
    const parsed = parseJsonPayload(dataStr);
    if (parsed === null) {
      continue;
    }
    const cid = deepExtractConversationId(parsed);
    if (cid) {
      conversationId = cid;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      accumulateAnswerFromObject(parsed, acc);
    }
    if (event.includes('error')) {
      const msg =
        typeof parsed === 'object' && parsed !== null && 'msg' in parsed
          ? String((parsed as { msg?: unknown }).msg)
          : dataStr.slice(0, 500);
      throw new Error(`Coze SSE error event: ${msg}`);
    }
  }
  return { answer: acc.text.trim(), conversationId };
}

function parseCozeBlockingJson(raw: string): { answer: string; conversationId: string } {
  let j: unknown;
  try {
    j = JSON.parse(raw) as unknown;
  } catch {
    return { answer: raw.trim(), conversationId: '' };
  }
  const acc = { text: '' };
  accumulateAnswerFromObject(j, acc);
  const cid = deepExtractConversationId(j) || '';
  return { answer: acc.text.trim() || raw.trim(), conversationId: cid };
}

export type CozeMultiTurnResult = {
  lastRaw: string;
  lastAnswer: string;
  conversationId: string;
  turnSummaries: { turn: number; conversationIdAfter: string; answerPreview: string }[];
};

export async function runCozeMultiTurnChat(
  baseUrl: string,
  token: string,
  botId: string,
  userId: string,
  turns: CozeChatTurn[],
  stream: boolean,
  delayBetweenTurnsMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<CozeMultiTurnResult> {
  let conversationId = '';
  let lastRaw = '';
  let lastAnswer = '';
  const turnSummaries: CozeMultiTurnResult['turnSummaries'] = [];
  const root = normalizeCozeApiBaseUrl(baseUrl);
  const url = `${root}/v3/chat`;
  const chatTimeoutMs = resolveCozeChatTimeoutMs();

  for (let i = 0; i < turns.length; i++) {
    const body: Record<string, unknown> = {
      bot_id: botId,
      user_id: userId,
      stream,
      // 与自建/本地 Coze OpenAPI 常见体一致：role + content + content_type（不强制 type:question，避免部分网关校验失败）
      additional_messages: [
        {
          role: 'user',
          content: turns[i].content,
          content_type: 'text',
        },
      ],
      parameters: turns[i].parameters || {},
      auto_save_history: true,
    };
    if (conversationId) {
      body.conversation_id = conversationId;
    }

    // biome-ignore lint/style/noRestrictedGlobals: CLI 脚本独立运行
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(chatTimeoutMs),
    });
    lastRaw = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${lastRaw.slice(0, 2000)}`);
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let parsed: { answer: string; conversationId: string };
    if (ct.includes('application/json')) {
      parsed = parseCozeBlockingJson(lastRaw);
    } else {
      parsed = parseCozeSse(lastRaw);
    }
    lastAnswer = parsed.answer;
    if (parsed.conversationId) {
      conversationId = parsed.conversationId;
    }
    if (i > 0 && !conversationId) {
      throw new Error(
        `Coze 多轮：第 ${i + 1} 轮前仍未获得 conversation_id（请确认 v3/chat 响应含会话 id，或改用 stream/auto_save_history）`,
      );
    }
    turnSummaries.push({
      turn: i + 1,
      conversationIdAfter: conversationId,
      answerPreview: lastAnswer.slice(0, 280),
    });
    if (i < turns.length - 1 && delayBetweenTurnsMs > 0) {
      await sleep(delayBetweenTurnsMs);
    }
  }

  return { lastRaw, lastAnswer, conversationId, turnSummaries };
}
