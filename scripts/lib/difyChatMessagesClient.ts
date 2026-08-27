/**
 * Dify POST /v1/chat-messages 客户端与多轮会话辅助（CLI 脚本共用，避免重复实现）。
 */

import { normalizeDifyApiBaseUrl } from './normalizeDifyApiBaseUrl';

export async function postDifyChatMessage(
  baseUrl: string,
  apiKey: string,
  body: {
    inputs: Record<string, unknown>;
    query: string;
    response_mode: string;
    conversation_id: string;
    user: string;
  },
): Promise<{ raw: string; json: unknown | null }> {
  const root = normalizeDifyApiBaseUrl(baseUrl);
  const url = `${root}/v1/chat-messages`;
  // biome-ignore lint/style/noRestrictedGlobals: CLI 脚本独立运行
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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

export function extractAnswerFromDifyJson(json: unknown): string {
  if (json && typeof json === 'object' && 'answer' in json) {
    const a = (json as { answer?: unknown }).answer;
    if (typeof a === 'string') {
      return a;
    }
  }
  return '';
}

export function extractConversationIdFromDifyJson(json: unknown): string | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const v = (json as { conversation_id?: unknown }).conversation_id;
  return typeof v === 'string' && v.trim() ? v : null;
}

export type DifyChatTurn = { query: string; inputs: Record<string, unknown> };

/** 与 payloads / refusal YAML 中「单条 query」或「steps[]」形状对齐 */
export type YamlTurnsSource = {
  query?: string;
  inputs?: Record<string, unknown>;
  steps?: { query: string; inputs?: Record<string, unknown> }[];
};

/**
 * 解析为按顺序发送的轮次列表。
 * - 若 `steps` 非空：多轮，每轮 `inputs` 与顶层 `inputs` 合并（轮内覆盖顶层同名 key）。
 * - 否则：单轮，使用顶层 `query`（必填）。
 */
export function getDifyChatTurnsFromYaml(
  source: YamlTurnsSource,
  contextLabel: string,
): DifyChatTurn[] {
  const baseInputs = (source.inputs || {}) as Record<string, unknown>;
  if (source.steps && source.steps.length > 0) {
    for (let i = 0; i < source.steps.length; i++) {
      const q = source.steps[i]?.query?.trim();
      if (!q) {
        throw new Error(`${contextLabel}: steps[${i}] 缺少非空 query`);
      }
    }
    return source.steps.map((s) => ({
      query: s.query,
      inputs: { ...baseInputs, ...(s.inputs || {}) },
    }));
  }
  const q = source.query?.trim();
  if (!q) {
    throw new Error(`${contextLabel}: 缺少 query 或非空 steps`);
  }
  return [{ query: q, inputs: { ...baseInputs } }];
}

/** 用于报告 / attack_commands.content：单轮即 query+inputs，多轮带「第 N 轮」标题 */
export function buildSerializedDifyAttackContent(turns: DifyChatTurn[]): string {
  const block = (query: string, inputs: Record<string, unknown>) => {
    const q = query.trim();
    if (!inputs || Object.keys(inputs).length === 0) {
      return q;
    }
    return `${q}\n\n--- inputs (JSON) ---\n${JSON.stringify(inputs, null, 2)}`;
  };
  if (turns.length === 1) {
    return block(turns[0].query, turns[0].inputs);
  }
  return turns.map((t, i) => `--- 第 ${i + 1} 轮 ---\n${block(t.query, t.inputs)}`).join('\n\n');
}

export type DifyMultiTurnResult = {
  lastRaw: string;
  lastJson: unknown | null;
  lastAnswer: string;
  conversationId: string;
  turnSummaries: { turn: number; conversationIdAfter: string; answerPreview: string }[];
};

/**
 * 在同一会话中顺序发送多轮：首轮 `conversation_id` 为空，后续使用响应中的 id。
 */
export async function runDifyMultiTurnChat(
  baseUrl: string,
  apiKey: string,
  turns: DifyChatTurn[],
  user: string,
  delayBetweenTurnsMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<DifyMultiTurnResult> {
  let conversationId = '';
  let lastRaw = '';
  let lastJson: unknown | null = null;
  let lastAnswer = '';
  const turnSummaries: DifyMultiTurnResult['turnSummaries'] = [];

  for (let i = 0; i < turns.length; i++) {
    const body = {
      inputs: turns[i].inputs,
      query: turns[i].query.trimEnd() + '\n',
      response_mode: 'blocking' as const,
      conversation_id: conversationId,
      user,
    };
    const res = await postDifyChatMessage(baseUrl, apiKey, body);
    lastRaw = res.raw;
    lastJson = res.json;
    lastAnswer = extractAnswerFromDifyJson(res.json);
    const cid = extractConversationIdFromDifyJson(res.json);
    if (cid) {
      conversationId = cid;
    }
    if (i > 0 && !conversationId) {
      throw new Error(
        `多轮会话：第 ${i + 1} 轮前仍未获得 conversation_id（请确认 Dify blocking 响应 JSON 含 conversation_id）`,
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

  return { lastRaw, lastJson, lastAnswer, conversationId, turnSummaries };
}
