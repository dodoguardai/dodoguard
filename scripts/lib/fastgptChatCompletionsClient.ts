/**
 * FastGPT OpenAI 兼容 Chat Completions 客户端（CLI 用）。
 *
 * 目标：在同一 chatId 下顺序发送多轮 user 消息，并复用服务端会话状态。
 */

import { randomUUID } from 'node:crypto';

import { normalizeFastgptApiBaseUrl } from './normalizeFastgptApiBaseUrl';

export type FastgptChatTurn = { query: string; inputs: Record<string, unknown> };

type FastgptChatResponse = { raw: string; json: unknown | null };

async function postFastgptChatCompletions(
  baseUrl: string,
  apiKey: string,
  payload: {
    messages: Array<{ role: 'user'; content: string }>;
    chatId?: string;
    variables?: Record<string, unknown>;
  },
): Promise<FastgptChatResponse> {
  const root = normalizeFastgptApiBaseUrl(baseUrl);
  const url = `${root}/api/v1/chat/completions`;

  // biome-ignore lint/style/noRestrictedGlobals: CLI 脚本独立运行
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stream: false,
      detail: false,
      messages: payload.messages,
      ...(payload.chatId ? { chatId: payload.chatId } : {}),
      ...(payload.variables && Object.keys(payload.variables).length > 0 ? { variables: payload.variables } : {}),
    }),
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

export function extractFastgptAnswerFromJson(json: unknown): string {
  if (!json || typeof json !== 'object') {
    return '';
  }
  const root = json as { choices?: Array<{ message?: { content?: unknown } }> };
  const c = root.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : '';
}

function extractFastgptPreviewFromJson(json: unknown): string {
  const content = extractFastgptAnswerFromJson(json);
  if (content.trim()) return content;
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return '';
  }
}

export type FastgptMultiTurnResult = {
  lastRaw: string;
  lastJson: unknown | null;
  lastAnswer: string;
  chatId: string;
  turnSummaries: { turn: number; chatIdAfter: string; answerPreview: string }[];
};

/**
 * 在同一会话下顺序发送多轮 user：
 * - CLI 侧生成 chatId，并每轮复用（与 FastGPT 后端会话维度对齐）
 */
export async function runFastgptMultiTurnChat(
  baseUrl: string,
  apiKey: string,
  turns: FastgptChatTurn[],
  delayBetweenTurnsMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<FastgptMultiTurnResult> {
  const chatId = randomUUID();
  let lastRaw = '';
  let lastJson: unknown | null = null;
  let lastAnswer = '';
  const turnSummaries: FastgptMultiTurnResult['turnSummaries'] = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const res = await postFastgptChatCompletions(baseUrl, apiKey, {
      messages: [{ role: 'user', content: t.query.trimEnd() + '\n' }],
      chatId,
      variables: t.inputs,
    });

    lastRaw = res.raw;
    lastJson = res.json;
    lastAnswer = extractFastgptAnswerFromJson(res.json);

    const preview = extractFastgptPreviewFromJson(res.json);
    turnSummaries.push({
      turn: i + 1,
      chatIdAfter: chatId,
      answerPreview: preview.slice(0, 280),
    });

    if (i < turns.length - 1 && delayBetweenTurnsMs > 0) {
      await sleep(delayBetweenTurnsMs);
    }
  }

  return { lastRaw, lastJson, lastAnswer, chatId, turnSummaries };
}

