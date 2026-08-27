/**
 * n8n Webhook 客户端（CLI 用）。
 *
 * 默认按你提供的接口形态发送：
 *   POST /webhook/local-ollama-chat
 *   { "prompt": "..." }
 */

export type N8nChatTurn = { query: string; inputs: Record<string, unknown> };

function normalizeN8nWebhookUrl(url: string): string {
  return String(url || '').trim().replace(/\/$/, '');
}

type N8nWebhookResponse = { raw: string; json: unknown | null };

async function postN8nWebhook(
  webhookUrl: string,
  payload: {
    prompt: string;
    inputs?: Record<string, unknown>;
    user?: string;
    conversation_id?: string;
    conversationId?: string;
  },
): Promise<N8nWebhookResponse> {
  const url = normalizeN8nWebhookUrl(webhookUrl);
  // biome-ignore lint/style/noRestrictedGlobals: CLI 脚本独立运行
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 2000)}`);
  }
  try {
    return { raw, json: JSON.parse(raw) as unknown };
  } catch {
    return { raw, json: null };
  }
}

export function extractN8nAnswerFromJson(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const root = json as Record<string, unknown>;
  const candidateKeys = ['answer', 'output', 'response', 'text', 'message', 'content'];
  for (const key of candidateKeys) {
    const value = root[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return '';
}

function extractN8nPreview(json: unknown): string {
  const answer = extractN8nAnswerFromJson(json);
  if (answer.trim().length > 0) return answer;
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return '';
  }
}

export type N8nMultiTurnResult = {
  lastRaw: string;
  lastJson: unknown | null;
  lastAnswer: string;
  conversationId: string;
  turnSummaries: { turn: number; conversationIdAfter: string; answerPreview: string }[];
};

/**
 * 多轮规则：
 * - 每轮使用 prompt 字段
 * - 附加 inputs / user / conversation_id 兼容字段，便于对齐 Dify 版逻辑
 */
export async function runN8nMultiTurnChat(
  webhookUrl: string,
  turns: N8nChatTurn[],
  delayBetweenTurnsMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<N8nMultiTurnResult> {
  const conversationId = '';
  let lastRaw = '';
  let lastJson: unknown | null = null;
  let lastAnswer = '';
  const turnSummaries: N8nMultiTurnResult['turnSummaries'] = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const res = await postN8nWebhook(webhookUrl, {
      prompt: t.query.trim(),
      ...(Object.keys(t.inputs).length > 0 ? { inputs: t.inputs } : {}),
      user: 'n8n-blackbox-scan',
      conversation_id: conversationId,
      conversationId,
    });
    lastRaw = res.raw;
    lastJson = res.json;
    lastAnswer = extractN8nAnswerFromJson(res.json);

    turnSummaries.push({
      turn: i + 1,
      conversationIdAfter: conversationId,
      answerPreview: extractN8nPreview(res.json).slice(0, 280),
    });

    if (i < turns.length - 1 && delayBetweenTurnsMs > 0) {
      await sleep(delayBetweenTurnsMs);
    }
  }

  return { lastRaw, lastJson, lastAnswer, conversationId, turnSummaries };
}

