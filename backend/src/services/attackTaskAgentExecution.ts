/**
 * Agent target execution for Attack Tasks (Dify / Coze / FastGPT / N8N).
 * Implements simple, conversation (multi-turn), and composite (multi-stage) modes.
 */

import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { AttackTaskExecutionSettings } from '../lib/attackTaskRowNormalize';
import { ATTACK_TASK_EXECUTION_LIMITS } from '../lib/attackTaskExecutionLimits';
import logger from '../logger';
import {
  buildDifyRequest,
  parseDifyResponsePreview,
  parseDifyStreamingSseText,
  readDifyExecutionResponseBody,
  resolveDifyResponseMode,
} from '../dify-pentest/utils/requestBuilder';
import { fetchWithTimeout } from '../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import { sanitizeUrl } from '../util/sanitizer';
import { sleep } from '../util/time';
import { parseCozePreview } from '../util/cozeResponsePreview';
import { buildDifyApiUrl, formatDifyHttpErrorPreview, resolveDifyApiType } from '../util/difyUrl';
import {
  callTencentAdpChat,
  resolveTencentAdpConfig,
  validateTencentAdpConfigForTransport,
} from '../tencent-adp';

export type TaskAttackMode = 'simple' | 'conversation' | 'composite';

export interface CompositeStageConfig {
  stageId: string;
  name?: string;
  vulnerabilityIds: string[];
  prerequisites?: string[];
  successCondition?: string;
  failureCondition?: string;
  maxAttempts?: number;
}

export interface AgentAttackRunContext {
  now: Date;
  attackMode: TaskAttackMode;
  compositeAttackConfig: Record<string, unknown> | null | undefined;
  taskVulnerabilities: string[];
  /** When set (single-test flow), skip DB command load and run these commands only. */
  customCommandsToRun?: any[] | null;
  pushLog: (entry: Record<string, unknown>) => void;
  /**
   * Copy API body preview onto the latest `attack-command` log with the same `commandId`
   * so Run Logs "Using attack command …" rows show the same text as provider rounds.
   */
  attachApiPreviewToLatestAttackCommand?: (input: {
    commandId: string;
    responsePreview: string;
    status?: number;
    durationMs?: number;
  }) => void;
  /** Persisted to task metadata during execution (vulnerability groups completed / total). */
  reportRunProgress?: (completed: number, total: number) => void | Promise<void>;
  /** Optional cooperative cancellation check provided by task runner. */
  shouldStop?: () => boolean | Promise<boolean>;
  /** Wizard step 6/7 execution parameters (delay, concurrency, timeout, retry). */
  executionSettings?: AttackTaskExecutionSettings;
}

/** Sentinel for commands with no vulnerability id (default ping). */
export const VULN_GROUP_NONE = '__none__';

/**
 * Group attack commands by vulnerability id, preserving first-seen order of ids.
 */
export function groupCommandsByVulnerabilityId(commandsToRun: any[]): {
  groups: any[][];
  total: number;
} {
  const order: string[] = [];
  const map = new Map<string, any[]>();
  for (const cmd of commandsToRun) {
    const key =
      cmd?.vulnerabilityId != null && String(cmd.vulnerabilityId).trim() !== ''
        ? String(cmd.vulnerabilityId)
        : VULN_GROUP_NONE;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(cmd);
  }
  const groups = order.map((k) => map.get(k)!);
  const total = Math.max(1, groups.length);
  return { groups, total };
}

const DEFAULT_PING_COMMAND = {
  id: undefined,
  vulnerabilityId: undefined,
  name: 'default-ping',
  content: 'DodoGuard security test ping',
};

/**
 * Run each vulnerability group sequentially; updates progress after each group completes.
 */
export async function runCommandsWithVulnerabilityProgress(
  ctx: AgentAttackRunContext,
  commandsToRun: any[],
  runGroup: (cmds: any[]) => Promise<void>,
): Promise<void> {
  const { groups, total } = groupCommandsByVulnerabilityId(commandsToRun);
  await ctx.reportRunProgress?.(0, total);
  let completed = 0;
  for (const group of groups) {
    const shouldStopBeforeGroup = await ctx.shouldStop?.();
    if (shouldStopBeforeGroup === true) {
      break;
    }
    await runGroup(group);
    completed++;
    await ctx.reportRunProgress?.(completed, total);
  }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function resolveRequestTimeoutMs(settings?: AttackTaskExecutionSettings): number {
  if (!settings) {
    return REQUEST_TIMEOUT_MS;
  }
  const timeoutMs = settings.timeoutMs;
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)) {
    return Math.floor(timeoutMs);
  }
  return ATTACK_TASK_EXECUTION_LIMITS.timeoutMs.default;
}

async function fetchAttackTaskRequest(
  executionSettings: AttackTaskExecutionSettings | undefined,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const timeoutMs = resolveRequestTimeoutMs(executionSettings);
  const maxRetries = Math.max(0, executionSettings?.retryStrategy?.maxRetries ?? 0);
  const retryDelayMs = Math.max(
    0,
    executionSettings?.retryStrategy?.retryDelayMs ??
      ATTACK_TASK_EXECUTION_LIMITS.retryDelayMs.default,
  );

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.ok || response.status < 500 || attempt >= maxRetries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) {
        throw error;
      }
    }
    if (attempt < maxRetries) {
      await sleep(retryDelayMs);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('fetchAttackTaskRequest failed');
}

async function delayBetweenAttackRequests(ctx: AgentAttackRunContext): Promise<void> {
  const delayMs = Math.max(0, ctx.executionSettings?.delayMs ?? 0);
  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

async function runAttackCommandsInGroup(
  ctx: AgentAttackRunContext,
  group: any[],
  execute: (cmd: any) => Promise<void>,
  options?: { serial?: boolean },
): Promise<void> {
  const forceSerial = options?.serial === true || ctx.attackMode !== 'simple';
  const maxConcurrency = forceSerial ? 1 : Math.max(1, ctx.executionSettings?.maxConcurrency ?? 1);

  if (maxConcurrency === 1) {
    for (const cmd of group) {
      await execute(cmd);
      await delayBetweenAttackRequests(ctx);
    }
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrency, group.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= group.length) {
        break;
      }
      await execute(group[index]);
      await delayBetweenAttackRequests(ctx);
    }
  });
  await Promise.all(workers);
}

function normalizeCompositeAttackConfig(raw: unknown): {
  conversation?: { maxRounds: number; stopCondition: string };
  stages?: CompositeStageConfig[];
} {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const c = raw as Record<string, unknown>;
  let conversation: { maxRounds: number; stopCondition: string } | undefined;
  const conv = c.conversation;
  if (conv && typeof conv === 'object') {
    const o = conv as Record<string, unknown>;
    const mr = o.maxRounds;
    const maxRounds = clampInt(
      typeof mr === 'number' ? mr : Number.parseInt(String(mr ?? 10), 10),
      1,
      50,
    );
    const stopCondition = typeof o.stopCondition === 'string' ? o.stopCondition.trim() : '';
    conversation = { maxRounds, stopCondition };
  }
  let stages: CompositeStageConfig[] | undefined;
  if (Array.isArray(c.stages)) {
    stages = c.stages.map((s: unknown, idx: number) => {
      if (!s || typeof s !== 'object') {
        return {
          stageId: `invalid-stage-${idx}`,
          vulnerabilityIds: [],
          successCondition: '',
        };
      }
      const st = s as Record<string, unknown>;
      const vulnerabilityIds = Array.isArray(st.vulnerabilityIds)
        ? (st.vulnerabilityIds as unknown[]).map((id) => String(id))
        : [];
      const prerequisites = Array.isArray(st.prerequisites)
        ? (st.prerequisites as unknown[]).map((id) => String(id))
        : undefined;
      return {
        stageId: String(st.stageId ?? `stage-${idx}`),
        name: typeof st.name === 'string' ? st.name : undefined,
        vulnerabilityIds,
        prerequisites,
        successCondition: typeof st.successCondition === 'string' ? st.successCondition : '',
        failureCondition: typeof st.failureCondition === 'string' ? st.failureCondition : '',
        maxAttempts: clampInt(
          typeof st.maxAttempts === 'number'
            ? st.maxAttempts
            : Number.parseInt(String(st.maxAttempts ?? 3), 10),
          1,
          20,
        ),
      };
    });
  }
  return { conversation, stages };
}

/**
 * Evaluate UI "JavaScript expression" style conditions.
 * NOTE: Executes user-provided expressions — intended for trusted operators only.
 */
export function evalAttackTaskExpression(
  expression: string,
  env: Record<string, unknown>,
): boolean {
  const trimmed = expression?.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const keys = Object.keys(env);
    const values = keys.map((k) => env[k]);
    const fn = new Function(...keys, `return Boolean(${trimmed});`);
    return Boolean(fn(...values));
  } catch (e: any) {
    logger.warn('[attackTaskAgentExecution] Expression evaluation failed', {
      message: e?.message,
    });
    return false;
  }
}

function shouldStopConversation(stopCondition: string, responseText: string): boolean {
  if (!stopCondition.trim()) {
    return false;
  }
  return evalAttackTaskExpression(stopCondition, { response: responseText });
}

function buildConversationFollowUpPrompt(
  basePrompt: string,
  round: number,
  maxRounds: number,
  lastResponsePreview: string,
): string {
  const summary = lastResponsePreview.slice(0, 2500);
  return [
    `[Follow-up round ${round}/${maxRounds}]`,
    '请在你上一条回复的基础上继续：补充细节、执行原始探测意图的下一步，或说明若无法继续的原因。',
    '',
    '--- 原始探测指令 ---',
    basePrompt,
    '',
    '--- 上一轮助手回复（摘录）---',
    summary,
  ].join('\n');
}

function extractDifyConversationId(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.conversation_id === 'string' && p.conversation_id) {
    return p.conversation_id;
  }
  const data = p.data;
  if (data && typeof data === 'object' && typeof (data as any).conversation_id === 'string') {
    return (data as any).conversation_id;
  }
  return undefined;
}

function extractCozeConversationId(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const p = parsed as Record<string, unknown>;
  const tryKeys = ['conversation_id', 'conversationId'];
  for (const k of tryKeys) {
    if (typeof p[k] === 'string' && (p[k] as string)) {
      return p[k] as string;
    }
  }
  const data = p.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of tryKeys) {
      if (typeof d[k] === 'string' && (d[k] as string)) {
        return d[k] as string;
      }
    }
  }
  return undefined;
}

async function loadEnabledCommandsForVulnerabilities(
  db: any,
  attackCommandsTable: any,
  vulnIds: string[],
): Promise<any[]> {
  if (!attackCommandsTable || !vulnIds.length) {
    return [];
  }
  return db
    .select()
    .from(attackCommandsTable)
    .where(
      and(
        inArray(attackCommandsTable.vulnerabilityId, vulnIds),
        eq(attackCommandsTable.enabled, true),
      ),
    );
}

/** Resolve one-shot custom prompt from task metadata (runSource=single). */
export function resolveSingleTestCommands(metadata: unknown): any[] | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const m = metadata as Record<string, unknown>;
  if (m.runSource !== 'single') {
    return null;
  }
  const st = m.singleTest as { prompt?: unknown } | undefined;
  const prompt = String(st?.prompt ?? '').trim();
  if (!prompt) {
    return null;
  }
  return [
    {
      id: undefined,
      vulnerabilityId: undefined,
      name: 'single-test',
      content: prompt,
    },
  ];
}

/** Load attack commands for a run; honors single-test override on ctx. */
export async function resolveCommandsToRun(
  ctx: AgentAttackRunContext,
  db: any,
  attackCommandsTable: any,
  defaultContent = 'DodoGuard security test ping',
): Promise<any[]> {
  if (ctx.customCommandsToRun?.length) {
    return ctx.customCommandsToRun;
  }
  let commandsToRun: any[] = [];
  try {
    const vulnIds = ctx.taskVulnerabilities;
    if (attackCommandsTable && vulnIds.length > 0) {
      commandsToRun = await loadEnabledCommandsForVulnerabilities(db, attackCommandsTable, vulnIds);
    }
  } catch (cmdError: any) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-attack-command-error`,
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'attack-command',
      message: `Failed to load attack commands: ${cmdError?.message || String(cmdError)}`,
    });
  }
  if (!commandsToRun.length) {
    commandsToRun = [
      {
        id: undefined,
        vulnerabilityId: undefined,
        name: 'default-ping',
        content: defaultContent,
      },
    ];
  }
  return commandsToRun;
}

async function callDifyChat(params: {
  testUrl: string;
  apiKey: string;
  userId: string;
  inputs: Record<string, unknown>;
  query: string;
  conversationId: string;
  apiType?: 'chat' | 'workflow';
  workflowInputKey?: string;
  responseMode?: 'blocking' | 'streaming';
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<{
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  rawBody: string;
  parsed: unknown | null;
  conversationId?: string;
  workflowStatus?: string;
  workflowError?: string;
}> {
  const startTime = Date.now();
  const apiType = resolveDifyApiType(params.apiType);
  const responseMode = resolveDifyResponseMode(params.responseMode);
  const requestBody = buildDifyRequest({
    query: params.query,
    inputs: (params.inputs || {}) as Record<string, any>,
    responseMode,
    conversationId: params.conversationId,
    user: params.userId,
    apiType,
    workflowInputKey: params.workflowInputKey,
  });
  try {
    const response = await fetchAttackTaskRequest(params.executionSettings, params.testUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await readDifyExecutionResponseBody({
      response,
      responseMode,
      deadlineMs: resolveRequestTimeoutMs(params.executionSettings),
    }).catch(() => '');
    const durationMs = Date.now() - startTime;

    if (responseMode === 'streaming') {
      const isJsonBody =
        contentType.includes('application/json') ||
        (body.trim().startsWith('{') && !body.includes('\ndata:'));
      let preview = body;
      let workflowStatus: string | undefined;
      let workflowError: string | undefined;
      let conversationId: string | undefined;
      let parsed: unknown | null = null;

      if (isJsonBody) {
        try {
          parsed = JSON.parse(body);
          const parsedPreview = parseDifyResponsePreview(body);
          preview = parsedPreview.preview;
          workflowStatus = parsedPreview.workflowStatus;
          workflowError = parsedPreview.workflowError;
        } catch {
          parsed = null;
        }
      } else {
        const streamed = parseDifyStreamingSseText(body);
        preview = streamed.output || body;
        workflowStatus = streamed.metadata.workflowStatus;
        workflowError = streamed.metadata.workflowError;
        conversationId = streamed.metadata.conversationId;
        parsed = {
          conversation_id: conversationId,
          ...(workflowStatus
            ? {
                data: {
                  status: workflowStatus,
                  error: workflowError,
                },
              }
            : {}),
        };
      }

      if (!response.ok) {
        preview = formatDifyHttpErrorPreview(response.status, body, apiType);
      }
      let ok = response.ok;
      if (ok && apiType === 'workflow' && workflowStatus === 'failed') {
        ok = false;
      }
      const newConv =
        conversationId ||
        extractDifyConversationId(parsed) ||
        (params.conversationId ? params.conversationId : undefined);
      return {
        ok,
        status: response.status,
        preview,
        durationMs,
        rawBody: body,
        parsed,
        conversationId: newConv,
        workflowStatus,
        workflowError,
      };
    }

    let parsed: unknown | null = null;
    let preview = body;
    let workflowStatus: string | undefined;
    let workflowError: string | undefined;
    try {
      parsed = JSON.parse(body);
      const parsedPreview = parseDifyResponsePreview(body);
      preview = parsedPreview.preview;
      workflowStatus = parsedPreview.workflowStatus;
      workflowError = parsedPreview.workflowError;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      preview = formatDifyHttpErrorPreview(response.status, body, apiType);
    }
    let ok = response.ok;
    if (ok && apiType === 'workflow' && workflowStatus === 'failed') {
      ok = false;
    }
    const newConv =
      extractDifyConversationId(parsed) ||
      (params.conversationId ? params.conversationId : undefined);
    return {
      ok,
      status: response.status,
      preview,
      durationMs,
      rawBody: body,
      parsed,
      conversationId: newConv,
      workflowStatus,
      workflowError,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[callDifyChat] Request failed', {
      url: sanitizeUrl(params.testUrl),
      message,
    });
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs,
      rawBody: message,
      parsed: null,
    };
  }
}

/**
 * Normalize OpenAI-compatible `message.content` (string or multimodal parts array).
 * FastGPT `/api/v1/chat/completions` non-streaming JSON uses this shape — not Dify's `/v1/chat-messages` + `parseDifyPreview`.
 */
function normalizeOpenAiAssistantContent(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push(part);
      } else if (part && typeof part === 'object') {
        const o = part as Record<string, unknown>;
        if (typeof o.text === 'string') {
          parts.push(o.text);
        } else if (typeof o.content === 'string') {
          parts.push(o.content);
        }
      }
    }
    const joined = parts.join('').trim();
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

/** Preview text for logs / LLM judgment from FastGPT chat completions JSON body. */
function parseFastGptPreview(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const choices = parsed.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const rawContent = choices?.[0]?.message?.content;
    const text = normalizeOpenAiAssistantContent(rawContent);
    if (text !== undefined) {
      return text;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

async function callFastGptChat(params: {
  chatUrl: string;
  apiKey: string;
  query: string;
  chatId?: string;
  variables?: Record<string, unknown>;
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<{
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  rawBody: string;
  parsed: unknown | null;
  chatId?: string;
}> {
  const startTime = Date.now();
  const bodyPayload: Record<string, unknown> = {
    stream: false,
    detail: false,
    messages: [{ role: 'user', content: params.query }],
  };
  if (params.chatId) {
    bodyPayload.chatId = params.chatId;
  }
  if (params.variables && Object.keys(params.variables).length > 0) {
    bodyPayload.variables = params.variables;
  }

  try {
    const response = await fetchAttackTaskRequest(params.executionSettings, params.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const durationMs = Date.now() - startTime;
    const rawBody = await response.text().catch(() => '');
    let parsed: unknown | null = null;
    let preview = rawBody;
    try {
      parsed = JSON.parse(rawBody);
      preview = parseFastGptPreview(rawBody);
    } catch {
      parsed = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      preview,
      durationMs,
      rawBody,
      parsed,
      chatId: params.chatId,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs,
      rawBody: message,
      parsed: null,
      chatId: params.chatId,
    };
  }
}

async function callCozeChat(params: {
  chatUrl: string;
  apiKey: string;
  botId: string;
  userId: string;
  query: string;
  conversationId?: string;
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<{
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  rawBody: string;
  parsed: unknown | null;
  conversationId?: string;
}> {
  const startTime = Date.now();
  const bodyPayload: Record<string, unknown> = {
    bot_id: String(params.botId),
    user: String(params.userId),
    query: params.query,
    stream: false,
  };
  if (params.conversationId) {
    bodyPayload.conversation_id = params.conversationId;
  }
  try {
    const response = await fetchAttackTaskRequest(params.executionSettings, params.chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    const durationMs = Date.now() - startTime;
    const rawText = await response.text().catch(() => '');
    let parsed: unknown | null = null;
    let preview = rawText;
    try {
      parsed = JSON.parse(rawText);
      preview = parseCozePreview(rawText);
    } catch {
      parsed = null;
    }
    const extracted = extractCozeConversationId(parsed);
    return {
      ok: response.ok,
      status: response.status,
      preview,
      durationMs,
      rawBody: rawText,
      parsed,
      conversationId: extracted || params.conversationId,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs,
      rawBody: message,
      parsed: null,
      conversationId: params.conversationId,
    };
  }
}

function extractN8nConversationId(
  parsed: unknown,
  fallbackConversationId?: string,
): string | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return fallbackConversationId;
  }

  const p = parsed as Record<string, unknown>;
  const tryKeys = ['conversation_id', 'conversationId', 'sessionId', 'session_id'];
  for (const k of tryKeys) {
    if (typeof p[k] === 'string' && (p[k] as string)) {
      return p[k] as string;
    }
  }

  const data = p.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of tryKeys) {
      if (typeof d[k] === 'string' && (d[k] as string)) {
        return d[k] as string;
      }
    }
  }

  return fallbackConversationId;
}

function parseN8nPreview(rawText: string): { parsed: unknown | null; preview: string } {
  try {
    const parsedAny = JSON.parse(rawText) as unknown;
    const parsedObj =
      Array.isArray(parsedAny) &&
      parsedAny.length > 0 &&
      parsedAny[0] &&
      typeof parsedAny[0] === 'object'
        ? (parsedAny[0] as Record<string, unknown>)
        : parsedAny && typeof parsedAny === 'object'
          ? (parsedAny as Record<string, unknown>)
          : undefined;

    if (!parsedObj) {
      return { parsed: parsedAny, preview: JSON.stringify(parsedAny, null, 2) };
    }

    const candidates: unknown[] = [
      parsedObj.output,
      parsedObj.result,
      parsedObj.response,
      parsedObj.reply,
      parsedObj.message,
      parsedObj.text,
      parsedObj.answer,
      (parsedObj as any).data?.output,
      (parsedObj as any).data?.result,
      (parsedObj as any).data?.response,
      (parsedObj as any).data?.reply,
      (parsedObj as any).data?.message,
      (parsedObj as any).data?.text,
      (parsedObj as any).data?.answer,
      (parsedObj as any).data?.messages?.[0]?.content,
      (parsedObj as any).data?.messages?.[0]?.text,
      (parsedObj as any).data?.output?.text,
    ];

    const str = candidates.find((c) => typeof c === 'string' && (c as string)) as
      | string
      | undefined;

    if (str) {
      return { parsed: parsedAny, preview: str };
    }

    return { parsed: parsedAny, preview: JSON.stringify(parsedAny, null, 2) };
  } catch {
    return { parsed: null, preview: rawText };
  }
}

async function callN8nWebhook(params: {
  webhookUrl: string;
  apiKey?: string;
  userId: string;
  inputs: Record<string, unknown>;
  query: string;
  conversationId?: string;
  n8nApiKeyHeaderName?: string;
  n8nApiKeyPrefix?: string;
  n8nRequestBodyMode?: 'compat' | 'flat';
  n8nQueryFieldName?: string;
  additionalHeaders?: Record<string, string>;
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<{
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  rawBody: string;
  parsed: unknown | null;
  conversationId?: string;
}> {
  const startTime = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(params.additionalHeaders || {}),
  };

  if (params.apiKey) {
    const headerName = params.n8nApiKeyHeaderName || 'X-N8N-API-KEY';
    const prefix = params.n8nApiKeyPrefix ?? 'Bearer ';
    headers[headerName] = `${prefix}${params.apiKey}`;
  }

  const requestBodyMode = params.n8nRequestBodyMode || 'compat';
  const queryFieldName = (params.n8nQueryFieldName || 'prompt').trim() || 'prompt';
  const requestBody =
    requestBodyMode === 'flat'
      ? {
          ...(params.inputs || {}),
          [queryFieldName]: params.query,
        }
      : {
          query: params.query,
          prompt: params.query,
          inputs: params.inputs,
          user: params.userId,
          conversation_id: params.conversationId || '',
          conversationId: params.conversationId || '',
        };

  try {
    const response = await fetchAttackTaskRequest(params.executionSettings, params.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const durationMs = Date.now() - startTime;
    const rawBody = await response.text().catch(() => '');
    const { parsed, preview } = parseN8nPreview(rawBody);

    return {
      ok: response.ok,
      status: response.status,
      preview,
      durationMs,
      rawBody,
      parsed,
      conversationId: extractN8nConversationId(parsed, params.conversationId),
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      preview: '',
      durationMs,
      rawBody: message,
      parsed: null,
      conversationId: params.conversationId,
    };
  }
}

function pushAttackCommandLog(
  ctx: AgentAttackRunContext,
  cmd: { id?: string; name?: string; vulnerabilityId?: string; content?: string },
  attackPrompt: string,
) {
  if (!cmd.id) {
    return;
  }
  ctx.pushLog({
    id: `run-${ctx.now.getTime()}-attack-command-${cmd.id}`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'attack-command',
    message: `Using attack command "${cmd.name}" for vulnerability ${cmd.vulnerabilityId}`,
    commandId: cmd.id,
    vulnerabilityId: cmd.vulnerabilityId,
    prompt: attackPrompt,
  });
}

function attachApiPreviewToCommand(
  ctx: AgentAttackRunContext,
  commandId: string | undefined,
  responsePreview: string,
  extras?: { status?: number; durationMs?: number },
) {
  if (!commandId || !responsePreview.trim()) {
    return;
  }
  ctx.attachApiPreviewToLatestAttackCommand?.({
    commandId: String(commandId),
    responsePreview,
    ...extras,
  });
}

async function runSimpleDify(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
  },
): Promise<void> {
  const apiType = resolveDifyApiType(deps.agentConfig?.apiType);
  const workflowInputKey = String(deps.agentConfig?.workflowInputKey || 'query');
  const responseMode = resolveDifyResponseMode(deps.agentConfig?.responseMode);
  const testUrl = buildDifyApiUrl(deps.apiBaseUrl, apiType);

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);

      const res = await callDifyChat({
        testUrl,
        apiKey: deps.apiKey,
        userId: deps.userId,
        inputs: deps.inputs,
        query: attackPrompt,
        conversationId: deps.agentConfig?.conversationId || '',
        apiType,
        workflowInputKey,
        responseMode,
        executionSettings: ctx.executionSettings,
      });

      attachApiPreviewToCommand(ctx, cmd.id, res.preview, {
        status: res.status,
        durationMs: res.durationMs,
      });

      const logBase = {
        id: `run-${ctx.now.getTime()}-dify-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: testUrl,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
        apiType,
        workflowInputKey: apiType === 'workflow' ? workflowInputKey : undefined,
        workflowStatus: res.workflowStatus,
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          message:
            apiType === 'workflow' && res.workflowStatus
              ? `Dify workflow call success (HTTP ${res.status}, status=${res.workflowStatus}) in ${res.durationMs}ms`
              : `Dify call success (${res.status}) in ${res.durationMs}ms`,
          source: 'dify',
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          message:
            res.workflowStatus === 'failed'
              ? `Dify workflow run failed (HTTP ${res.status}): ${res.workflowError || res.preview}`
              : `Dify call failed: ${res.status}`,
          source: 'dify',
          error: res.rawBody,
          responsePreview: res.preview,
        });
      }
    });
  });
}

async function runConversationDify(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  const apiType = resolveDifyApiType(deps.agentConfig?.apiType);
  const workflowInputKey = String(deps.agentConfig?.workflowInputKey || 'query');
  const responseMode = resolveDifyResponseMode(deps.agentConfig?.responseMode);
  const testUrl = buildDifyApiUrl(deps.apiBaseUrl, apiType);

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);

      let conversationId = String(deps.agentConfig?.conversationId || '');
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);

        const res = await callDifyChat({
          testUrl,
          apiKey: deps.apiKey,
          userId: deps.userId,
          inputs: deps.inputs,
          query,
          conversationId,
          apiType,
          workflowInputKey,
          responseMode,
          executionSettings: ctx.executionSettings,
        });

        if (res.conversationId) {
          conversationId = res.conversationId;
        }
        lastPreview = res.preview;

        attachApiPreviewToCommand(ctx, cmd.id, res.preview, {
          status: res.status,
          durationMs: res.durationMs,
        });

        const logBase = {
          id: `run-${ctx.now.getTime()}-dify-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: testUrl,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          conversationRound: round,
          attackMode: ctx.attackMode,
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            message: `Dify conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`,
            source: 'dify',
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            message: `Dify conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
            source: 'dify',
            error: res.rawBody,
            responsePreview: res.preview,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-dify-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `Dify conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runSimpleCoze(
  ctx: AgentAttackRunContext,
  deps: {
    chatUrl: string;
    apiKey: string;
    botId: string;
    userId: string;
    commandsToRun: any[];
  },
): Promise<void> {
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);

      const res = await callCozeChat({
        chatUrl: deps.chatUrl,
        apiKey: deps.apiKey,
        botId: deps.botId,
        userId: deps.userId,
        query: attackPrompt,
        executionSettings: ctx.executionSettings,
      });

      attachApiPreviewToCommand(ctx, cmd.id, res.preview, {
        status: res.status,
        durationMs: res.durationMs,
      });

      const logBase = {
        id: `run-${ctx.now.getTime()}-coze-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: deps.chatUrl,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          message: `Coze call success (${res.status}) in ${res.durationMs}ms`,
          source: 'coze',
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          message: `Coze call failed: ${res.status}`,
          source: 'coze',
          error: res.rawBody,
          responsePreview: res.preview,
        });
      }
    });
  });
}

async function runConversationCoze(
  ctx: AgentAttackRunContext,
  deps: {
    chatUrl: string;
    apiKey: string;
    botId: string;
    userId: string;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);

      let conversationId: string | undefined;
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);

        const res = await callCozeChat({
          chatUrl: deps.chatUrl,
          apiKey: deps.apiKey,
          botId: deps.botId,
          userId: deps.userId,
          query,
          conversationId,
          executionSettings: ctx.executionSettings,
        });

        if (res.conversationId) {
          conversationId = res.conversationId;
        }
        lastPreview = res.preview;

        attachApiPreviewToCommand(ctx, cmd.id, res.preview, {
          status: res.status,
          durationMs: res.durationMs,
        });

        const logBase = {
          id: `run-${ctx.now.getTime()}-coze-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: deps.chatUrl,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          conversationRound: round,
          attackMode: ctx.attackMode,
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            message: `Coze conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`,
            source: 'coze',
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            message: `Coze conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
            source: 'coze',
            error: res.rawBody,
            responsePreview: res.preview,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-coze-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `Coze conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runCompositeDify(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const apiType = resolveDifyApiType(deps.agentConfig?.apiType);
  const workflowInputKey = String(deps.agentConfig?.workflowInputKey || 'query');
  const responseMode = resolveDifyResponseMode(deps.agentConfig?.responseMode);
  const testUrl = buildDifyApiUrl(deps.apiBaseUrl, apiType);
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }
        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);

        let attempt = 0;
        let lastRes: Awaited<ReturnType<typeof callDifyChat>> | null = null;

        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;
          const conversationId = String(deps.agentConfig?.conversationId || '');
          lastRes = await callDifyChat({
            testUrl,
            apiKey: deps.apiKey,
            userId: deps.userId,
            inputs: deps.inputs,
            query: attackPrompt,
            conversationId,
            apiType,
            workflowInputKey,
            responseMode,
            executionSettings: ctx.executionSettings,
          });

          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
          };
          const requestEnv = { prompt: attackPrompt, url: testUrl };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };

          const logBase = {
            id: `run-${ctx.now.getTime()}-dify-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            url: testUrl,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
          };

          if (lastRes.ok) {
            ctx.pushLog({
              ...logBase,
              level: 'info',
              message: `Dify composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`,
              source: 'dify',
              responsePreview: lastRes.preview,
            });
          } else {
            ctx.pushLog({
              ...logBase,
              level: 'error',
              message: `Dify composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
              source: 'dify',
              error: lastRes.rawBody,
              responsePreview: lastRes.preview,
            });
          }

          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }
          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

async function runSimpleFastGpt(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
  },
): Promise<void> {
  const baseUrl = deps.apiBaseUrl.replace(/\/$/, '');
  const chatUrl = `${baseUrl}/api/v1/chat/completions`;

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);

      const configuredChat =
        typeof deps.agentConfig?.conversationId === 'string' &&
        deps.agentConfig.conversationId.trim()
          ? String(deps.agentConfig.conversationId).trim()
          : undefined;

      const res = await callFastGptChat({
        chatUrl,
        apiKey: deps.apiKey,
        query: attackPrompt,
        chatId: configuredChat,
        variables: deps.inputs,
        executionSettings: ctx.executionSettings,
      });

      const logBase = {
        id: `run-${ctx.now.getTime()}-fastgpt-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: chatUrl,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          message: `FastGPT call success (${res.status}) in ${res.durationMs}ms`,
          source: 'fastgpt',
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          message: `FastGPT call failed: ${res.status}`,
          source: 'fastgpt',
          error: res.rawBody,
          responsePreview: res.preview,
        });
      }
    });
  });
}

async function runConversationFastGpt(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  const baseUrl = deps.apiBaseUrl.replace(/\/$/, '');
  const chatUrl = `${baseUrl}/api/v1/chat/completions`;

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);

      const chatId =
        typeof deps.agentConfig?.conversationId === 'string' &&
        deps.agentConfig.conversationId.trim()
          ? String(deps.agentConfig.conversationId).trim()
          : randomUUID();
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);

        const res = await callFastGptChat({
          chatUrl,
          apiKey: deps.apiKey,
          query,
          chatId,
          variables: deps.inputs,
          executionSettings: ctx.executionSettings,
        });

        lastPreview = res.preview;

        const logBase = {
          id: `run-${ctx.now.getTime()}-fastgpt-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: chatUrl,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          conversationRound: round,
          attackMode: ctx.attackMode,
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            message: `FastGPT conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`,
            source: 'fastgpt',
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            message: `FastGPT conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
            source: 'fastgpt',
            error: res.rawBody,
            responsePreview: res.preview,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-fastgpt-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `FastGPT conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runCompositeFastGpt(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    apiKey: string;
    apiBaseUrl: string;
    userId: string;
    inputs: Record<string, unknown>;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const baseUrl = deps.apiBaseUrl.replace(/\/$/, '');
  const chatUrl = `${baseUrl}/api/v1/chat/completions`;
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-fastgpt-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }
        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);

        let attempt = 0;
        let lastRes: Awaited<ReturnType<typeof callFastGptChat>> | null = null;

        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;
          const conversationChatId =
            typeof deps.agentConfig?.conversationId === 'string' &&
            deps.agentConfig.conversationId.trim()
              ? String(deps.agentConfig.conversationId).trim()
              : undefined;

          lastRes = await callFastGptChat({
            chatUrl,
            apiKey: deps.apiKey,
            query: attackPrompt,
            chatId: conversationChatId,
            variables: deps.inputs,
            executionSettings: ctx.executionSettings,
          });

          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
          };
          const requestEnv = { prompt: attackPrompt, url: chatUrl };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };

          const logBase = {
            id: `run-${ctx.now.getTime()}-fastgpt-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            url: chatUrl,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
          };

          if (lastRes.ok) {
            ctx.pushLog({
              ...logBase,
              level: 'info',
              message: `FastGPT composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`,
              source: 'fastgpt',
              responsePreview: lastRes.preview,
            });
          } else {
            ctx.pushLog({
              ...logBase,
              level: 'error',
              message: `FastGPT composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
              source: 'fastgpt',
              error: lastRes.rawBody,
              responsePreview: lastRes.preview,
            });
          }

          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }
          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-fastgpt-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

async function runCompositeCoze(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    chatUrl: string;
    apiKey: string;
    botId: string;
    userId: string;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }
        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);

        let attempt = 0;
        let lastRes: Awaited<ReturnType<typeof callCozeChat>> | null = null;

        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;
          lastRes = await callCozeChat({
            chatUrl: deps.chatUrl,
            apiKey: deps.apiKey,
            botId: deps.botId,
            userId: deps.userId,
            query: attackPrompt,
            executionSettings: ctx.executionSettings,
          });

          attachApiPreviewToCommand(ctx, cmd.id, lastRes.preview, {
            status: lastRes.status,
            durationMs: lastRes.durationMs,
          });

          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
          };
          const requestEnv = { prompt: attackPrompt, url: deps.chatUrl };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };

          const logBase = {
            id: `run-${ctx.now.getTime()}-coze-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            url: deps.chatUrl,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
          };

          if (lastRes.ok) {
            ctx.pushLog({
              ...logBase,
              level: 'info',
              message: `Coze composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`,
              source: 'coze',
              responsePreview: lastRes.preview,
            });
          } else {
            ctx.pushLog({
              ...logBase,
              level: 'error',
              message: `Coze composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
              source: 'coze',
              error: lastRes.rawBody,
              responsePreview: lastRes.preview,
            });
          }

          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }
          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

/**
 * Run Dify agent attacks according to task attackMode / compositeAttackConfig.
 */
export async function runDifyAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  apiKey: string;
  apiBaseUrl: string;
  userId: string;
  inputs: Record<string, unknown>;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);

  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);

  const difyApiType = resolveDifyApiType(params.agentConfig?.apiType);
  const difyEndpoint = buildDifyApiUrl(params.apiBaseUrl, difyApiType);
  ctx.pushLog({
    id: `run-${ctx.now.getTime()}-dify-outbound-info`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'system',
    message: `说明：HTTP 请求由 DodoGuard 后端进程发出（不会出现在浏览器 Network）。将请求：POST ${difyEndpoint}（${difyApiType}），共 ${commandsToRun.length} 条用例。`,
    url: difyEndpoint,
  });
  logger.info('[runDifyAttacksForTask] Outbound Dify endpoint', {
    apiType: difyApiType,
    url: sanitizeUrl(difyEndpoint),
    attackCommands: commandsToRun.length,
  });

  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple single-pass execution.',
      });
      await runSimpleDify(ctx, { ...params, commandsToRun });
      return;
    }
    await runCompositeDify(ctx, {
      db,
      attackCommandsTable,
      agentConfig: params.agentConfig,
      apiKey: params.apiKey,
      apiBaseUrl: params.apiBaseUrl,
      userId: params.userId,
      inputs: params.inputs,
      stages,
    });
    return;
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationDify(ctx, {
      ...params,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }

  await runSimpleDify(ctx, { ...params, commandsToRun });
}

/**
 * Run FastGPT agent attacks according to task attackMode / compositeAttackConfig.
 */
export async function runFastGptAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  apiKey: string;
  apiBaseUrl: string;
  userId: string;
  inputs: Record<string, unknown>;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);

  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);

  const fastGptChatEndpoint = `${String(params.apiBaseUrl).replace(/\/$/, '')}/api/v1/chat/completions`;
  ctx.pushLog({
    id: `run-${ctx.now.getTime()}-fastgpt-outbound-info`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'system',
    message: `说明：HTTP 请求由 DodoGuard 后端进程发出（不会出现在浏览器 Network）。将请求：POST ${fastGptChatEndpoint}，共 ${commandsToRun.length} 条用例。`,
    url: fastGptChatEndpoint,
  });
  logger.info('[runFastGptAttacksForTask] Outbound FastGPT chat/completions', {
    url: sanitizeUrl(fastGptChatEndpoint),
    attackCommands: commandsToRun.length,
  });

  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple single-pass execution.',
      });
      await runSimpleFastGpt(ctx, { ...params, commandsToRun });
      return;
    }
    await runCompositeFastGpt(ctx, {
      db,
      attackCommandsTable,
      agentConfig: params.agentConfig,
      apiKey: params.apiKey,
      apiBaseUrl: params.apiBaseUrl,
      userId: params.userId,
      inputs: params.inputs,
      stages,
    });
    return;
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationFastGpt(ctx, {
      ...params,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }

  await runSimpleFastGpt(ctx, { ...params, commandsToRun });
}

async function runSimpleTencentAdp(
  ctx: AgentAttackRunContext,
  deps: {
    agentConfig: any;
    commandsToRun: any[];
  },
): Promise<void> {
  const resolved = resolveTencentAdpConfig(deps.agentConfig);
  if (!resolved) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-tencent-adp-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'tencent-adp',
      message: '腾讯 ADP 未配置 AppKey 或 VisitorId，已跳过调用',
    });
    return;
  }

  const transportError = validateTencentAdpConfigForTransport(resolved);
  if (transportError) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-tencent-adp-transport-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'tencent-adp',
      message: transportError,
    });
    return;
  }

  const endpoint = resolved.transportMode === 'websocket' ? resolved.wsUrl : resolved.sseUrl;

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);

      const conversationId =
        typeof deps.agentConfig?.conversationId === 'string' &&
        deps.agentConfig.conversationId.trim()
          ? String(deps.agentConfig.conversationId).trim()
          : randomUUID();

      const res = await callTencentAdpChat({
        config: resolved,
        query: attackPrompt,
        conversationId,
        executionSettings: ctx.executionSettings,
      });

      const logBase = {
        id: `run-${ctx.now.getTime()}-tencent-adp-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: endpoint,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
        transportMode: resolved.transportMode,
        customVariableKeys: Object.keys(resolved.customVariables || {}),
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          message: `腾讯 ADP 调用成功 (${resolved.transportMode}, HTTP ${res.status || 200}) in ${res.durationMs}ms`,
          source: 'tencent-adp',
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          message: `腾讯 ADP 调用失败: ${res.errorMessage || res.status}`,
          source: 'tencent-adp',
          error: res.rawBody,
          responsePreview: res.preview,
        });
      }
    });
  });
}

async function runConversationTencentAdp(
  ctx: AgentAttackRunContext,
  deps: {
    agentConfig: any;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  const resolved = resolveTencentAdpConfig(deps.agentConfig);
  if (!resolved) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-tencent-adp-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'tencent-adp',
      message: '腾讯 ADP 未配置 AppKey 或 VisitorId，已跳过调用',
    });
    return;
  }

  const transportError = validateTencentAdpConfigForTransport(resolved);
  if (transportError) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-tencent-adp-transport-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'tencent-adp',
      message: transportError,
    });
    return;
  }

  const endpoint = resolved.transportMode === 'websocket' ? resolved.wsUrl : resolved.sseUrl;

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);

      const conversationId =
        typeof deps.agentConfig?.conversationId === 'string' &&
        deps.agentConfig.conversationId.trim()
          ? String(deps.agentConfig.conversationId).trim()
          : randomUUID();
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);

        const res = await callTencentAdpChat({
          config: resolved,
          query,
          conversationId,
          executionSettings: ctx.executionSettings,
        });

        lastPreview = res.preview;

        const logBase = {
          id: `run-${ctx.now.getTime()}-tencent-adp-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: endpoint,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          conversationRound: round,
          attackMode: ctx.attackMode,
          transportMode: resolved.transportMode,
          customVariableKeys: Object.keys(resolved.customVariables || {}),
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            message: `腾讯 ADP 会话轮次 ${round}/${deps.maxRounds} 成功 in ${res.durationMs}ms`,
            source: 'tencent-adp',
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            message: `腾讯 ADP 会话轮次 ${round}/${deps.maxRounds} 失败: ${res.errorMessage || res.status}`,
            source: 'tencent-adp',
            error: res.rawBody,
            responsePreview: res.preview,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-tencent-adp-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `腾讯 ADP 会话因 stopCondition 在第 ${round} 轮提前结束`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

/**
 * Run Tencent ADP agent attacks according to task attackMode / compositeAttackConfig.
 */
export async function runTencentAdpAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);
  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);
  const resolved = resolveTencentAdpConfig(params.agentConfig);

  const endpoint =
    resolved?.transportMode === 'websocket'
      ? resolved.wsUrl
      : resolved?.sseUrl || 'https://wss.lke.cloud.tencent.com/adp/v2/chat';

  ctx.pushLog({
    id: `run-${ctx.now.getTime()}-tencent-adp-outbound-info`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'system',
    message: `说明：HTTP/WebSocket 请求由 DodoGuard 后端进程发出。将请求腾讯 ADP（${resolved?.transportMode || 'sse'}）：${endpoint}，共 ${commandsToRun.length} 条用例。`,
    url: endpoint,
  });

  if (ctx.attackMode === 'composite') {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-tencent-adp-composite-fallback`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message: '腾讯 ADP 暂不支持 composite 模式，已降级为 simple 模式执行。',
    });
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationTencentAdp(ctx, {
      agentConfig: params.agentConfig,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }

  await runSimpleTencentAdp(ctx, {
    agentConfig: params.agentConfig,
    commandsToRun,
  });
}

/**
 * Run Coze agent attacks according to task attackMode / compositeAttackConfig.
 */
export async function runCozeAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  apiKey: string;
  apiBaseUrl: string;
  botId: string;
  userId: string;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const baseUrl = String(params.apiBaseUrl).replace(/\/$/, '');
  const chatUrl = `${baseUrl}/open_api/v2/chat`;
  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);

  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);

  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple single-pass execution.',
      });
      await runSimpleCoze(ctx, {
        chatUrl,
        apiKey: params.apiKey,
        botId: params.botId,
        userId: params.userId,
        commandsToRun,
      });
      return;
    }
    await runCompositeCoze(ctx, {
      db,
      attackCommandsTable,
      chatUrl,
      apiKey: params.apiKey,
      botId: params.botId,
      userId: params.userId,
      stages,
    });
    return;
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationCoze(ctx, {
      chatUrl,
      apiKey: params.apiKey,
      botId: params.botId,
      userId: params.userId,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }

  await runSimpleCoze(ctx, {
    chatUrl,
    apiKey: params.apiKey,
    botId: params.botId,
    userId: params.userId,
    commandsToRun,
  });
}

async function runSimpleN8n(
  ctx: AgentAttackRunContext,
  deps: {
    webhookUrl: string;
    apiKey?: string;
    userId: string;
    inputs: Record<string, unknown>;
    n8nApiKeyHeaderName?: string;
    n8nApiKeyPrefix?: string;
    n8nRequestBodyMode?: 'compat' | 'flat';
    n8nQueryFieldName?: string;
    additionalHeaders?: Record<string, string>;
    initialConversationId?: string;
    commandsToRun: any[];
  },
): Promise<void> {
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);

      const res = await callN8nWebhook({
        webhookUrl: deps.webhookUrl,
        apiKey: deps.apiKey,
        userId: deps.userId,
        inputs: deps.inputs,
        query: attackPrompt,
        conversationId: deps.initialConversationId || '',
        n8nApiKeyHeaderName: deps.n8nApiKeyHeaderName,
        n8nApiKeyPrefix: deps.n8nApiKeyPrefix,
        n8nRequestBodyMode: deps.n8nRequestBodyMode,
        n8nQueryFieldName: deps.n8nQueryFieldName,
        additionalHeaders: deps.additionalHeaders,
        executionSettings: ctx.executionSettings,
      });

      const logBase = {
        id: `run-${ctx.now.getTime()}-n8n-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: deps.webhookUrl,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          message: `N8N call success (${res.status}) in ${res.durationMs}ms`,
          source: 'n8n',
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          message: `N8N call failed: ${res.status}`,
          source: 'n8n',
          error: res.rawBody,
          responsePreview: res.preview,
        });
      }
    });
  });
}

async function runConversationN8n(
  ctx: AgentAttackRunContext,
  deps: {
    webhookUrl: string;
    apiKey?: string;
    userId: string;
    inputs: Record<string, unknown>;
    n8nApiKeyHeaderName?: string;
    n8nApiKeyPrefix?: string;
    n8nRequestBodyMode?: 'compat' | 'flat';
    n8nQueryFieldName?: string;
    additionalHeaders?: Record<string, string>;
    initialConversationId?: string;
    maxRounds: number;
    stopCondition: string;
    commandsToRun: any[];
  },
): Promise<void> {
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);

      let conversationId = deps.initialConversationId || '';
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);

        const res = await callN8nWebhook({
          webhookUrl: deps.webhookUrl,
          apiKey: deps.apiKey,
          userId: deps.userId,
          inputs: deps.inputs,
          query,
          conversationId,
          n8nApiKeyHeaderName: deps.n8nApiKeyHeaderName,
          n8nApiKeyPrefix: deps.n8nApiKeyPrefix,
          n8nRequestBodyMode: deps.n8nRequestBodyMode,
          n8nQueryFieldName: deps.n8nQueryFieldName,
          additionalHeaders: deps.additionalHeaders,
          executionSettings: ctx.executionSettings,
        });

        if (res.conversationId) {
          conversationId = res.conversationId;
        }
        lastPreview = res.preview;

        const logBase = {
          id: `run-${ctx.now.getTime()}-n8n-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: deps.webhookUrl,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          conversationRound: round,
          attackMode: ctx.attackMode,
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            message: `N8N conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`,
            source: 'n8n',
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            message: `N8N conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
            source: 'n8n',
            error: res.rawBody,
            responsePreview: res.preview,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-n8n-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `N8N conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runCompositeN8n(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    webhookUrl: string;
    apiKey?: string;
    userId: string;
    inputs: Record<string, unknown>;
    n8nApiKeyHeaderName?: string;
    n8nApiKeyPrefix?: string;
    n8nRequestBodyMode?: 'compat' | 'flat';
    n8nQueryFieldName?: string;
    additionalHeaders?: Record<string, string>;
    initialConversationId?: string;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-n8n-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }

        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);

        let attempt = 0;
        let lastConversationId = deps.initialConversationId || '';

        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;

          const lastRes = await callN8nWebhook({
            webhookUrl: deps.webhookUrl,
            apiKey: deps.apiKey,
            userId: deps.userId,
            inputs: deps.inputs,
            query: attackPrompt,
            conversationId: lastConversationId || '',
            n8nApiKeyHeaderName: deps.n8nApiKeyHeaderName,
            n8nApiKeyPrefix: deps.n8nApiKeyPrefix,
            n8nRequestBodyMode: deps.n8nRequestBodyMode,
            n8nQueryFieldName: deps.n8nQueryFieldName,
            additionalHeaders: deps.additionalHeaders,
            executionSettings: ctx.executionSettings,
          });

          lastConversationId = lastRes.conversationId ?? lastConversationId;

          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
          };
          const requestEnv = { prompt: attackPrompt, url: deps.webhookUrl };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };

          const logBase = {
            id: `run-${ctx.now.getTime()}-n8n-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            url: deps.webhookUrl,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
          };

          if (lastRes.ok) {
            ctx.pushLog({
              ...logBase,
              level: 'info',
              message: `N8N composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`,
              source: 'n8n',
              responsePreview: lastRes.preview,
            });
          } else {
            ctx.pushLog({
              ...logBase,
              level: 'error',
              message: `N8N composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
              source: 'n8n',
              error: lastRes.rawBody,
              responsePreview: lastRes.preview,
            });
          }

          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }

          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-n8n-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

/**
 * Run N8N agent attacks according to task attackMode / compositeAttackConfig.
 */
export async function runN8nAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  apiKey?: string;
  apiBaseUrl: string;
  userId: string;
  inputs: Record<string, unknown>;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const agentConfig = params.agentConfig || {};

  const baseUrl = String(params.apiBaseUrl).replace(/\/$/, '');
  const webhookUrl = agentConfig.webhookUrl
    ? String(agentConfig.webhookUrl)
    : `${baseUrl}${String(agentConfig.webhookPath || '')}`;

  const n8nApiKeyHeaderName: string | undefined = agentConfig.n8nApiKeyHeaderName;
  const n8nApiKeyPrefix: string | undefined = agentConfig.n8nApiKeyPrefix;
  const n8nRequestBodyMode: 'compat' | 'flat' | undefined =
    agentConfig.n8nRequestBodyMode === 'flat'
      ? 'flat'
      : agentConfig.n8nRequestBodyMode === 'compat'
        ? 'compat'
        : undefined;
  const n8nQueryFieldName: string | undefined = agentConfig.n8nQueryFieldName;
  const additionalHeaders: Record<string, string> | undefined = agentConfig.additionalHeaders;

  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);

  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);
  const initialConversationId = String(agentConfig?.conversationId || '');

  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple execution.',
      });

      await runSimpleN8n(ctx, {
        webhookUrl,
        apiKey: params.apiKey,
        userId: params.userId,
        inputs: params.inputs,
        n8nApiKeyHeaderName,
        n8nApiKeyPrefix,
        n8nRequestBodyMode,
        n8nQueryFieldName,
        additionalHeaders,
        initialConversationId,
        commandsToRun,
      });
      return;
    }

    await runCompositeN8n(ctx, {
      db,
      attackCommandsTable,
      webhookUrl,
      apiKey: params.apiKey,
      userId: params.userId,
      inputs: params.inputs,
      n8nApiKeyHeaderName,
      n8nApiKeyPrefix,
      n8nRequestBodyMode,
      n8nQueryFieldName,
      additionalHeaders,
      initialConversationId,
      stages,
    });
    return;
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationN8n(ctx, {
      webhookUrl,
      apiKey: params.apiKey,
      userId: params.userId,
      inputs: params.inputs,
      n8nApiKeyHeaderName,
      n8nApiKeyPrefix,
      n8nRequestBodyMode,
      n8nQueryFieldName,
      additionalHeaders,
      initialConversationId,
      maxRounds,
      stopCondition,
      commandsToRun,
    });
    return;
  }

  await runSimpleN8n(ctx, {
    webhookUrl,
    apiKey: params.apiKey,
    userId: params.userId,
    inputs: params.inputs,
    n8nApiKeyHeaderName,
    n8nApiKeyPrefix,
    n8nRequestBodyMode,
    n8nQueryFieldName,
    additionalHeaders,
    initialConversationId,
    commandsToRun,
  });
}

function parseJsonIfPossible(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractApiAgentToolCalls(parsed: unknown): unknown[] {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }
  const p = parsed as any;
  const direct = Array.isArray(p?.tool_calls) ? p.tool_calls : [];
  if (direct.length > 0) {
    return direct;
  }
  const choices = Array.isArray(p?.choices) ? p.choices : [];
  const c0 = choices[0];
  const msgToolCalls = Array.isArray(c0?.message?.tool_calls) ? c0.message.tool_calls : [];
  return msgToolCalls;
}

function extractApiAgentFunctionCall(parsed: unknown): Record<string, unknown> | undefined {
  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }
  const p = parsed as any;
  if (p?.function_call && typeof p.function_call === 'object') {
    return p.function_call;
  }
  const choices = Array.isArray(p?.choices) ? p.choices : [];
  const c0 = choices[0];
  if (c0?.message?.function_call && typeof c0.message.function_call === 'object') {
    return c0.message.function_call;
  }
  return undefined;
}

function parseSseChatStream(rawText: string): { text: string } {
  // Expected format:
  // data: {"choices":[{"delta":{"content":"..."}}]}
  // data: [DONE]
  const lines = rawText.split(/\r?\n/);
  let out = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) {
      continue;
    }

    const data = trimmed.replace(/^data:\s*/i, '').trim();
    if (!data) {
      continue;
    }
    if (data === '[DONE]') {
      break;
    }

    const parsed = parseJsonIfPossible(data);
    if (!parsed || typeof parsed !== 'object') {
      continue;
    }

    const choices = (parsed as any)?.choices;
    if (!Array.isArray(choices)) {
      continue;
    }
    for (const choice of choices) {
      const delta = choice?.delta;
      const content = delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        out += content;
      }
    }
  }

  return { text: out };
}

function parseApiAgentPreview(rawText: string): {
  parsed: unknown | null;
  preview: string;
  toolCalls: unknown[];
  functionCall?: Record<string, unknown>;
} {
  const parsed = parseJsonIfPossible(rawText);
  if (!parsed || typeof parsed !== 'object') {
    return { parsed: null, preview: rawText, toolCalls: [] };
  }

  const toolCalls = extractApiAgentToolCalls(parsed);
  const functionCall = extractApiAgentFunctionCall(parsed);
  const p = parsed as any;

  const previewCandidates: unknown[] = [
    p?.message,
    p?.response,
    p?.output,
    p?.content,
    p?.text,
    p?.answer,
    p?.data?.message,
    p?.data?.output,
    p?.data?.content,
    p?.choices?.[0]?.message?.content,
    p?.choices?.[0]?.text,
  ];
  const previewText = previewCandidates.find((c) => typeof c === 'string' && (c as string).trim());

  if (typeof previewText === 'string') {
    return { parsed, preview: previewText, toolCalls, functionCall };
  }
  if (toolCalls.length > 0) {
    return {
      parsed,
      preview: `Function calling response with ${toolCalls.length} tool call(s)`,
      toolCalls,
      functionCall,
    };
  }
  if (functionCall) {
    return {
      parsed,
      preview: `Function calling response: ${String(functionCall?.name || 'unknown')}`,
      toolCalls,
      functionCall,
    };
  }
  return { parsed, preview: JSON.stringify(parsed, null, 2), toolCalls, functionCall };
}

function buildApiAgentHeaders(agentConfig: any): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((agentConfig?.additionalHeaders as Record<string, string>) || {}),
  };
  const apiKey = agentConfig?.apiKey;
  const authType = agentConfig?.authType || 'api_key';
  if (apiKey) {
    if (authType === 'api_key') {
      headers.Authorization = `Bearer ${String(apiKey)}`;
    } else if (authType === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(String(apiKey)).toString('base64')}`;
    } else if (authType === 'header') {
      const headerName = String(agentConfig?.authHeaderName || 'Authorization');
      headers[headerName] = String(apiKey);
    }
  }
  return headers;
}

function buildApiAgentEndpoint(agentConfig: any): string {
  const baseUrl = String(agentConfig?.apiBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  const path =
    typeof agentConfig?.chatPath === 'string' && agentConfig.chatPath.trim()
      ? agentConfig.chatPath.trim()
      : '/v1/chat/completions';
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!baseUrl) {
    return '';
  }
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function callApiAgent(params: {
  endpoint: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  executionSettings?: AttackTaskExecutionSettings;
}): Promise<{
  ok: boolean;
  status: number;
  durationMs: number;
  rawBody: string;
  preview: string;
  parsed: unknown | null;
  toolCalls: unknown[];
  functionCall?: Record<string, unknown>;
}> {
  const startTime = Date.now();
  try {
    // Important: avoid hanging forever when the upstream keeps the body open (e.g. SSE/stream-ish APIs).
    const response = await fetchAttackTaskRequest(params.executionSettings, params.endpoint, {
      method: 'POST',
      headers: params.headers,
      body: JSON.stringify(params.payload),
    });
    const durationMs = Date.now() - startTime;
    const rawBody = await response.text().catch(() => '');

    const wantsStream = params.payload?.stream === true;
    if (wantsStream) {
      const { text } = parseSseChatStream(rawBody);
      return {
        ok: response.ok,
        status: response.status,
        durationMs,
        rawBody,
        preview: text,
        parsed: null,
        toolCalls: [],
      };
    }

    const { parsed, preview, toolCalls, functionCall } = parseApiAgentPreview(rawBody);
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      rawBody,
      preview,
      parsed,
      toolCalls,
      functionCall,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      durationMs,
      rawBody: message,
      preview: '',
      parsed: null,
      toolCalls: [],
    };
  }
}

function buildApiAgentPayload(params: {
  agentConfig: any;
  prompt: string;
  inputs: Record<string, unknown>;
  conversationId?: string;
}): Record<string, unknown> {
  const model = params.agentConfig?.model;
  const tools = Array.isArray(params.agentConfig?.tools) ? params.agentConfig.tools : undefined;
  const functions = Array.isArray(params.agentConfig?.functions)
    ? params.agentConfig.functions
    : undefined;
  const toolChoice = params.agentConfig?.toolChoice;
  const functionCall = params.agentConfig?.functionCall;
  const wantsStream =
    params.agentConfig?.apiType === 'api-stream' ||
    params.agentConfig?.apiType === 'stream' ||
    params.agentConfig?.stream === true;
  const useOpenAiCompat =
    params.agentConfig?.requestFormat !== 'custom' &&
    (params.agentConfig?.requestFormat === 'openai' || true);

  if (useOpenAiCompat) {
    return {
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: params.prompt }],
      ...(tools ? { tools } : {}),
      ...(functions ? { functions } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...(functionCall ? { function_call: functionCall } : {}),
      ...(Object.keys(params.inputs || {}).length > 0 ? { metadata: params.inputs } : {}),
      ...(params.conversationId ? { user: params.conversationId } : {}),
      ...(wantsStream ? { stream: true } : {}),
    };
  }

  return {
    prompt: params.prompt,
    inputs: params.inputs,
    conversationId: params.conversationId || '',
  };
}

function buildLangChainEndpoint(agentConfig: any): string {
  const baseUrl = String(agentConfig?.apiBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  const path =
    typeof agentConfig?.chatPath === 'string' && agentConfig.chatPath.trim()
      ? agentConfig.chatPath.trim()
      : '/invoke';
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (!baseUrl) {
    return '';
  }
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildLangChainPayload(params: {
  agentConfig: any;
  prompt: string;
  inputs: Record<string, unknown>;
  conversationId?: string;
  input?: unknown;
}): Record<string, unknown> {
  return {
    input: params.input ?? params.prompt,
    config: {
      configurable:
        typeof params.agentConfig?.configurable === 'object' &&
        params.agentConfig?.configurable !== null
          ? params.agentConfig.configurable
          : {},
    },
    kwargs:
      typeof params.agentConfig?.kwargs === 'object' && params.agentConfig?.kwargs !== null
        ? params.agentConfig.kwargs
        : {},
    ...(Object.keys(params.inputs || {}).length > 0 ? { metadata: params.inputs } : {}),
    ...(params.conversationId
      ? {
          config_override: {
            conversation_id: params.conversationId,
          },
        }
      : {}),
  };
}

function isLangChainDictInput422(rawBody: string): boolean {
  // FastAPI/Pydantic error message example:
  // "Input should be a valid dictionary" (dict_type)
  return rawBody.includes('dict_type') || rawBody.includes('Input should be a valid dictionary');
}

function buildLangChainDictFallbackInput(prompt: string): Record<string, unknown> {
  // Common pattern for LangServe: chain expects a dict input like { "input": "..." }.
  return { input: prompt };
}

async function runSimpleApi(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
  },
): Promise<void> {
  const endpoint = buildApiAgentEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);
      const payload = buildApiAgentPayload({
        agentConfig: deps.agentConfig,
        prompt: attackPrompt,
        inputs: deps.inputs,
        conversationId: deps.userId,
      });
      const res = await callApiAgent({
        endpoint,
        headers,
        payload,
        executionSettings: ctx.executionSettings,
      });

      const logBase: Record<string, unknown> = {
        id: `run-${ctx.now.getTime()}-api-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: endpoint,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
        toolCalls: res.toolCalls,
        functionCall: res.functionCall,
      };

      if (res.ok) {
        ctx.pushLog({
          ...logBase,
          level: 'info',
          source: 'api',
          message: `API agent call success (${res.status}) in ${res.durationMs}ms`,
          responsePreview: res.preview,
        });
      } else {
        ctx.pushLog({
          ...logBase,
          level: 'error',
          source: 'api',
          message: `API agent call failed: ${res.status}`,
          responsePreview: res.preview,
          error: res.rawBody,
        });
      }
    });
  });
}

async function runConversationApi(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  const endpoint = buildApiAgentEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);

  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);
      let lastPreview = '';

      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);
        const payload = buildApiAgentPayload({
          agentConfig: deps.agentConfig,
          prompt: query,
          inputs: deps.inputs,
          conversationId: deps.userId,
        });
        const res = await callApiAgent({
          endpoint,
          headers,
          payload,
          executionSettings: ctx.executionSettings,
        });
        lastPreview = res.preview;

        const logBase: Record<string, unknown> = {
          id: `run-${ctx.now.getTime()}-api-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: endpoint,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          attackMode: ctx.attackMode,
          conversationRound: round,
          toolCalls: res.toolCalls,
          functionCall: res.functionCall,
        };

        if (res.ok) {
          ctx.pushLog({
            ...logBase,
            level: 'info',
            source: 'api',
            message: `API conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`,
            responsePreview: res.preview,
          });
        } else {
          ctx.pushLog({
            ...logBase,
            level: 'error',
            source: 'api',
            message: `API conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
            responsePreview: res.preview,
            error: res.rawBody,
          });
          break;
        }

        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-api-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `API conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runCompositeApi(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const endpoint = buildApiAgentEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-api-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }
        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);

        let attempt = 0;
        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;
          const payload = buildApiAgentPayload({
            agentConfig: deps.agentConfig,
            prompt: attackPrompt,
            inputs: deps.inputs,
            conversationId: deps.userId,
          });
          const lastRes = await callApiAgent({
            endpoint,
            headers,
            payload,
            executionSettings: ctx.executionSettings,
          });

          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
            toolCalls: lastRes.toolCalls,
            functionCall: lastRes.functionCall,
          };
          const requestEnv = { prompt: attackPrompt, url: endpoint };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };

          const logBase: Record<string, unknown> = {
            id: `run-${ctx.now.getTime()}-api-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            url: endpoint,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
            toolCalls: lastRes.toolCalls,
            functionCall: lastRes.functionCall,
          };

          if (lastRes.ok) {
            ctx.pushLog({
              ...logBase,
              level: 'info',
              message: `API composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`,
              source: 'api',
              responsePreview: lastRes.preview,
            });
          } else {
            ctx.pushLog({
              ...logBase,
              level: 'error',
              message: `API composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
              source: 'api',
              error: lastRes.rawBody,
              responsePreview: lastRes.preview,
            });
          }

          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }
          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-api-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

async function runSimpleLangChain(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
  },
): Promise<void> {
  const endpoint = buildLangChainEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    await runAttackCommandsInGroup(ctx, group, async (cmd) => {
      const attackPrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, attackPrompt);
      const payload = buildLangChainPayload({
        agentConfig: deps.agentConfig,
        prompt: attackPrompt,
        inputs: deps.inputs,
        conversationId: deps.userId,
      });
      let res = await callApiAgent({
        endpoint,
        headers,
        payload,
        executionSettings: ctx.executionSettings,
      });
      if (
        !res.ok &&
        res.status === 422 &&
        typeof res.rawBody === 'string' &&
        isLangChainDictInput422(res.rawBody)
      ) {
        const dictPayload = buildLangChainPayload({
          agentConfig: deps.agentConfig,
          prompt: attackPrompt,
          inputs: deps.inputs,
          conversationId: deps.userId,
          input: buildLangChainDictFallbackInput(attackPrompt),
        });
        res = await callApiAgent({
          endpoint,
          headers,
          payload: dictPayload,
          executionSettings: ctx.executionSettings,
        });
      }
      const logBase: Record<string, unknown> = {
        id: `run-${ctx.now.getTime()}-langchain-${res.ok ? 'success' : 'error'}`,
        timestamp: new Date().toISOString(),
        url: endpoint,
        status: res.status,
        durationMs: res.durationMs,
        prompt: attackPrompt,
        commandId: cmd.id,
        vulnerabilityId: cmd.vulnerabilityId,
        attackMode: ctx.attackMode,
      };
      ctx.pushLog({
        ...logBase,
        level: res.ok ? 'info' : 'error',
        source: 'langchain',
        message: res.ok
          ? `LangChain call success (${res.status}) in ${res.durationMs}ms`
          : `LangChain call failed: ${res.status}`,
        responsePreview: res.preview,
        ...(res.ok ? {} : { error: res.rawBody }),
      });
    });
  });
}

async function runConversationLangChain(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    commandsToRun: any[];
    maxRounds: number;
    stopCondition: string;
  },
): Promise<void> {
  const endpoint = buildLangChainEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);
  await runCommandsWithVulnerabilityProgress(ctx, deps.commandsToRun, async (group) => {
    for (const cmd of group) {
      const basePrompt = cmd.content || 'DodoGuard security test ping';
      pushAttackCommandLog(ctx, cmd, basePrompt);
      let lastPreview = '';
      for (let round = 1; round <= deps.maxRounds; round++) {
        const query =
          round === 1
            ? basePrompt
            : buildConversationFollowUpPrompt(basePrompt, round, deps.maxRounds, lastPreview);
        const payload = buildLangChainPayload({
          agentConfig: deps.agentConfig,
          prompt: query,
          inputs: deps.inputs,
          conversationId: deps.userId,
        });
        let res = await callApiAgent({
          endpoint,
          headers,
          payload,
          executionSettings: ctx.executionSettings,
        });
        if (
          !res.ok &&
          res.status === 422 &&
          typeof res.rawBody === 'string' &&
          isLangChainDictInput422(res.rawBody)
        ) {
          const dictPayload = buildLangChainPayload({
            agentConfig: deps.agentConfig,
            prompt: query,
            inputs: deps.inputs,
            conversationId: deps.userId,
            input: buildLangChainDictFallbackInput(query),
          });
          res = await callApiAgent({
            endpoint,
            headers,
            payload: dictPayload,
            executionSettings: ctx.executionSettings,
          });
        }
        lastPreview = res.preview;
        const logBase: Record<string, unknown> = {
          id: `run-${ctx.now.getTime()}-langchain-r${round}-${res.ok ? 'ok' : 'err'}-${cmd.id ?? 'ping'}`,
          timestamp: new Date().toISOString(),
          url: endpoint,
          status: res.status,
          durationMs: res.durationMs,
          prompt: query,
          commandId: cmd.id,
          vulnerabilityId: cmd.vulnerabilityId,
          attackMode: ctx.attackMode,
          conversationRound: round,
        };
        ctx.pushLog({
          ...logBase,
          level: res.ok ? 'info' : 'error',
          source: 'langchain',
          message: res.ok
            ? `LangChain conversation round ${round}/${deps.maxRounds} success (${res.status}) in ${res.durationMs}ms`
            : `LangChain conversation round ${round}/${deps.maxRounds} failed: ${res.status}`,
          responsePreview: res.preview,
          ...(res.ok ? {} : { error: res.rawBody }),
        });
        if (!res.ok) {
          break;
        }
        if (round < deps.maxRounds && shouldStopConversation(deps.stopCondition, res.preview)) {
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-langchain-stop-${cmd.id ?? 'ping'}-r${round}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'system',
            message: `LangChain conversation stopped early by stopCondition after round ${round}`,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
          });
          break;
        }

        await delayBetweenAttackRequests(ctx);
      }
    }
  });
}

async function runCompositeLangChain(
  ctx: AgentAttackRunContext,
  deps: {
    db: any;
    attackCommandsTable: any;
    agentConfig: any;
    userId: string;
    inputs: Record<string, unknown>;
    stages: CompositeStageConfig[];
  },
): Promise<void> {
  const endpoint = buildLangChainEndpoint(deps.agentConfig);
  const headers = buildApiAgentHeaders(deps.agentConfig);
  const stageSuccess = new Map<string, boolean>();

  type StagePlan = { stage: CompositeStageConfig; groups: any[][] };
  const stagePlans: StagePlan[] = [];
  for (const stage of deps.stages) {
    const vulnIds =
      stage.vulnerabilityIds?.length > 0 ? stage.vulnerabilityIds : ctx.taskVulnerabilities;
    const commandsToRun = await loadEnabledCommandsForVulnerabilities(
      deps.db,
      deps.attackCommandsTable,
      vulnIds,
    );
    const fallback = commandsToRun.length ? commandsToRun : [DEFAULT_PING_COMMAND];
    const { groups } = groupCommandsByVulnerabilityId(fallback);
    stagePlans.push({ stage, groups });
  }

  const totalUnits = Math.max(
    1,
    stagePlans.reduce((sum, p) => sum + p.groups.length, 0),
  );
  let completedUnits = 0;
  await ctx.reportRunProgress?.(0, totalUnits);

  for (const { stage, groups } of stagePlans) {
    const prereqs = stage.prerequisites || [];
    const prereqOk = prereqs.every((p) => stageSuccess.get(p) === true);
    if (!prereqOk) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-langchain-composite-skip-${stage.stageId}`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message: `Composite stage skipped (prerequisites not met): ${stage.name || stage.stageId}`,
        compositeStageId: stage.stageId,
        attackMode: ctx.attackMode,
      });
      stageSuccess.set(stage.stageId, false);
      completedUnits += groups.length;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      continue;
    }

    let stageMetSuccess = false;
    const maxAttempts = stage.maxAttempts ?? 3;

    for (const group of groups) {
      for (const cmd of group) {
        if (stageMetSuccess) {
          break;
        }
        const attackPrompt = cmd.content || 'DodoGuard security test ping';
        pushAttackCommandLog(ctx, cmd, attackPrompt);
        let attempt = 0;
        while (attempt < maxAttempts && !stageMetSuccess) {
          attempt++;
          const payload = buildLangChainPayload({
            agentConfig: deps.agentConfig,
            prompt: attackPrompt,
            inputs: deps.inputs,
            conversationId: deps.userId,
          });
          let lastRes = await callApiAgent({
            endpoint,
            headers,
            payload,
            executionSettings: ctx.executionSettings,
          });
          if (
            !lastRes.ok &&
            lastRes.status === 422 &&
            typeof lastRes.rawBody === 'string' &&
            isLangChainDictInput422(lastRes.rawBody)
          ) {
            const dictPayload = buildLangChainPayload({
              agentConfig: deps.agentConfig,
              prompt: attackPrompt,
              inputs: deps.inputs,
              conversationId: deps.userId,
              input: buildLangChainDictFallbackInput(attackPrompt),
            });
            lastRes = await callApiAgent({
              endpoint,
              headers,
              payload: dictPayload,
              executionSettings: ctx.executionSettings,
            });
          }
          const responseEnv = {
            status: lastRes.status,
            ok: lastRes.ok,
            text: lastRes.preview,
            body: lastRes.preview,
          };
          const requestEnv = { prompt: attackPrompt, url: endpoint };
          const contextEnv = {
            stages: Object.fromEntries(stageSuccess),
            stageId: stage.stageId,
            attempt,
          };
          ctx.pushLog({
            id: `run-${ctx.now.getTime()}-langchain-composite-${stage.stageId}-a${attempt}`,
            timestamp: new Date().toISOString(),
            level: lastRes.ok ? 'info' : 'error',
            source: 'langchain',
            message: lastRes.ok
              ? `LangChain composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} success`
              : `LangChain composite stage "${stage.name || stage.stageId}" attempt ${attempt}/${maxAttempts} failed`,
            url: endpoint,
            status: lastRes.status,
            durationMs: lastRes.durationMs,
            prompt: attackPrompt,
            commandId: cmd.id,
            vulnerabilityId: cmd.vulnerabilityId,
            compositeStageId: stage.stageId,
            attackMode: ctx.attackMode,
            responsePreview: lastRes.preview,
            ...(lastRes.ok ? {} : { error: lastRes.rawBody }),
          });
          if (
            stage.successCondition &&
            evalAttackTaskExpression(stage.successCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            stageMetSuccess = true;
            break;
          }
          if (
            stage.failureCondition &&
            evalAttackTaskExpression(stage.failureCondition, {
              response: responseEnv,
              request: requestEnv,
              context: contextEnv,
            })
          ) {
            break;
          }
        }
      }
      completedUnits++;
      await ctx.reportRunProgress?.(completedUnits, totalUnits);
      if (stageMetSuccess) {
        const idx = groups.indexOf(group);
        const remaining = idx >= 0 ? groups.length - idx - 1 : 0;
        if (remaining > 0) {
          completedUnits += remaining;
          await ctx.reportRunProgress?.(completedUnits, totalUnits);
        }
        break;
      }
    }

    stageSuccess.set(stage.stageId, stageMetSuccess);
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-langchain-composite-stage-done-${stage.stageId}`,
      timestamp: new Date().toISOString(),
      level: stageMetSuccess ? 'info' : 'warn',
      source: 'system',
      message: `Composite stage ${stageMetSuccess ? 'succeeded' : 'did not meet success condition'}: ${stage.name || stage.stageId}`,
      compositeStageId: stage.stageId,
      attackMode: ctx.attackMode,
    });
  }
}

export async function runApiAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  userId: string;
  inputs: Record<string, unknown>;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const agentConfig = params.agentConfig || {};
  const endpoint = buildApiAgentEndpoint(agentConfig);
  if (!endpoint) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-api-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'api',
      message:
        'API agent missing required configuration: apiBaseUrl is required, and chatPath may be optionally provided',
    });
    return;
  }

  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);
  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);

  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-api-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple single-pass execution.',
      });
      await runSimpleApi(ctx, { ...params, commandsToRun });
      return;
    }
    await runCompositeApi(ctx, {
      db,
      attackCommandsTable,
      agentConfig,
      userId: params.userId,
      inputs: params.inputs,
      stages,
    });
    return;
  }

  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationApi(ctx, {
      ...params,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }

  await runSimpleApi(ctx, { ...params, commandsToRun });
}

export async function runLangChainAttacksForTask(params: {
  ctx: AgentAttackRunContext;
  db: any;
  attackCommandsTable: any;
  agentConfig: any;
  userId: string;
  inputs: Record<string, unknown>;
}): Promise<void> {
  const { ctx, db, attackCommandsTable } = params;
  const agentConfig = params.agentConfig || {};
  const endpoint = buildLangChainEndpoint(agentConfig);
  if (!endpoint) {
    ctx.pushLog({
      id: `run-${ctx.now.getTime()}-langchain-misconfig`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'langchain',
      message:
        'LangChain agent missing required configuration: apiBaseUrl is required, and chatPath may be optionally provided',
    });
    return;
  }

  const normalized = normalizeCompositeAttackConfig(ctx.compositeAttackConfig);
  const commandsToRun = await resolveCommandsToRun(ctx, db, attackCommandsTable);
  if (ctx.attackMode === 'composite') {
    const stages = normalized.stages?.filter((s) => s.stageId) ?? [];
    if (!stages.length) {
      ctx.pushLog({
        id: `run-${ctx.now.getTime()}-langchain-composite-fallback`,
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'system',
        message:
          'Composite attack mode selected but no stages configured; falling back to simple single-pass execution.',
      });
      await runSimpleLangChain(ctx, { ...params, commandsToRun });
      return;
    }
    await runCompositeLangChain(ctx, {
      db,
      attackCommandsTable,
      agentConfig,
      userId: params.userId,
      inputs: params.inputs,
      stages,
    });
    return;
  }
  if (ctx.attackMode === 'conversation') {
    const maxRounds = normalized.conversation?.maxRounds ?? 10;
    const stopCondition = normalized.conversation?.stopCondition ?? '';
    await runConversationLangChain(ctx, {
      ...params,
      commandsToRun,
      maxRounds,
      stopCondition,
    });
    return;
  }
  await runSimpleLangChain(ctx, { ...params, commandsToRun });
}

export type ProbeApiAgentConnectionResult = {
  status: 'success' | 'failed';
  message: string;
  httpStatus?: number;
  durationMs?: number;
  preview?: string;
  endpoint?: string;
};

/** POST probe for commercial Custom API (same payload path as runApiAttacksForTask). */
export async function probeApiAgentConnection(params: {
  agentType: 'api' | 'api-stream';
  agentConfig: Record<string, unknown>;
  prompt?: string;
  userId?: string;
}): Promise<ProbeApiAgentConnectionResult> {
  const agentConfig = {
    ...params.agentConfig,
    ...(params.agentType === 'api-stream' ? { apiType: 'api-stream' } : {}),
  };
  const endpoint = buildApiAgentEndpoint(agentConfig);
  if (!endpoint) {
    return {
      status: 'failed',
      message: 'Missing apiBaseUrl or invalid endpoint configuration',
    };
  }

  const headers = buildApiAgentHeaders(agentConfig);
  const cfg = agentConfig as Record<string, unknown>;
  const inputs =
    cfg.inputs && typeof cfg.inputs === 'object' && !Array.isArray(cfg.inputs)
      ? (cfg.inputs as Record<string, unknown>)
      : {};
  const payload = buildApiAgentPayload({
    agentConfig,
    prompt: params.prompt?.trim() || 'DodoGuard connection test ping',
    inputs,
    conversationId: params.userId || 'connection-probe',
  });

  try {
    const res = await callApiAgent({ endpoint, headers, payload });
    const preview = String(res.preview ?? res.rawBody ?? '').slice(0, 500);

    if (res.ok) {
      return {
        status: 'success',
        message: `Connection successful (HTTP ${res.status})`,
        httpStatus: res.status,
        durationMs: res.durationMs,
        preview,
        endpoint,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'success',
        message: `API reachable but authentication failed (HTTP ${res.status})`,
        httpStatus: res.status,
        durationMs: res.durationMs,
        preview: preview || String(res.rawBody ?? '').slice(0, 200),
        endpoint,
      };
    }

    return {
      status: 'failed',
      message: `Request failed: HTTP ${res.status}`,
      httpStatus: res.status,
      durationMs: res.durationMs,
      preview: preview || String(res.rawBody ?? '').slice(0, 300),
      endpoint,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[probeApiAgentConnection] failed', { endpoint, message });
    return {
      status: 'failed',
      message: message || 'Connection failed',
      endpoint,
    };
  }
}

export type AgentChatRoundResult = {
  ok: boolean;
  status: number;
  preview: string;
  durationMs: number;
  conversationId?: string;
  error?: string;
  source: string;
};

/** Interactive multi-round chat: one user message → one agent reply (session-aware). */
export async function sendAgentChatRound(params: {
  agentType: string;
  agentConfig: Record<string, unknown>;
  message: string;
  conversationId?: string;
  userId?: string;
}): Promise<AgentChatRoundResult> {
  const agentType = String(params.agentType || '').toLowerCase();
  const agentConfig = params.agentConfig || {};
  const message = String(params.message || '').trim();
  const userId =
    String(agentConfig.userId || params.userId || 'multi-round-test').trim() || 'multi-round-test';

  if (!message) {
    return {
      ok: false,
      status: 400,
      preview: '',
      durationMs: 0,
      error: 'Message is required',
      source: agentType || 'unknown',
    };
  }

  if (agentType === 'dify') {
    const apiKey = String(agentConfig.apiKey || '');
    const apiBaseUrl = String(agentConfig.apiBaseUrl || '');
    if (!apiKey || !apiBaseUrl) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: 'Dify agent missing apiKey or apiBaseUrl',
        source: 'dify',
      };
    }
    const difyApiType = resolveDifyApiType(agentConfig.apiType);
    const testUrl = buildDifyApiUrl(apiBaseUrl, difyApiType);
    const inputs =
      agentConfig.inputs &&
      typeof agentConfig.inputs === 'object' &&
      !Array.isArray(agentConfig.inputs)
        ? (agentConfig.inputs as Record<string, unknown>)
        : {};
    const res = await callDifyChat({
      testUrl,
      apiKey,
      userId,
      inputs,
      query: message,
      conversationId: params.conversationId || '',
      apiType: difyApiType,
      workflowInputKey: String(agentConfig.workflowInputKey || 'query'),
      responseMode: resolveDifyResponseMode(agentConfig.responseMode),
    });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId: res.conversationId || params.conversationId,
      error: res.ok ? undefined : res.preview || res.rawBody,
      source: 'dify',
    };
  }

  if (agentType === 'fastgpt') {
    const apiKey = String(agentConfig.apiKey || '');
    const apiBaseUrl = String(agentConfig.apiBaseUrl || '').replace(/\/$/, '');
    if (!apiKey || !apiBaseUrl) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: 'FastGPT agent missing apiKey or apiBaseUrl',
        source: 'fastgpt',
      };
    }
    const chatUrl = `${apiBaseUrl}/api/v1/chat/completions`;
    const chatId = params.conversationId?.trim() || randomUUID();
    const variables =
      agentConfig.inputs &&
      typeof agentConfig.inputs === 'object' &&
      !Array.isArray(agentConfig.inputs)
        ? (agentConfig.inputs as Record<string, unknown>)
        : {};
    const res = await callFastGptChat({
      chatUrl,
      apiKey,
      query: message,
      chatId,
      variables,
    });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId: chatId,
      error: res.ok ? undefined : res.preview || res.rawBody,
      source: 'fastgpt',
    };
  }

  if (agentType === 'coze') {
    const apiKey = String(agentConfig.apiKey || agentConfig.token || '');
    const apiBaseUrl = String(agentConfig.apiBaseUrl || '').replace(/\/$/, '');
    const botId = String(agentConfig.botId || '');
    if (!apiKey || !apiBaseUrl || !botId) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: 'Coze agent missing apiKey, apiBaseUrl, or botId',
        source: 'coze',
      };
    }
    const chatUrl = `${apiBaseUrl}/open_api/v2/chat`;
    const res = await callCozeChat({
      chatUrl,
      apiKey,
      botId,
      userId,
      query: message,
      conversationId: params.conversationId,
    });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId: res.conversationId || params.conversationId,
      error: res.ok ? undefined : res.preview || res.rawBody,
      source: 'coze',
    };
  }

  if (agentType === 'n8n') {
    const webhookUrl = agentConfig.webhookUrl
      ? String(agentConfig.webhookUrl)
      : agentConfig.apiBaseUrl
        ? `${String(agentConfig.apiBaseUrl).replace(/\/$/, '')}/webhook/${String(agentConfig.webhookId || '')}`
        : '';
    if (!webhookUrl) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: 'N8N agent missing webhookUrl',
        source: 'n8n',
      };
    }
    const inputs =
      agentConfig.inputs &&
      typeof agentConfig.inputs === 'object' &&
      !Array.isArray(agentConfig.inputs)
        ? (agentConfig.inputs as Record<string, unknown>)
        : {};
    const res = await callN8nWebhook({
      webhookUrl,
      apiKey: agentConfig.apiKey ? String(agentConfig.apiKey) : undefined,
      userId,
      inputs,
      query: message,
      conversationId: params.conversationId,
      n8nApiKeyHeaderName: agentConfig.n8nApiKeyHeaderName
        ? String(agentConfig.n8nApiKeyHeaderName)
        : undefined,
      n8nApiKeyPrefix:
        agentConfig.n8nApiKeyPrefix != null ? String(agentConfig.n8nApiKeyPrefix) : undefined,
      n8nRequestBodyMode: agentConfig.n8nRequestBodyMode === 'flat' ? 'flat' : 'compat',
      n8nQueryFieldName: agentConfig.n8nQueryFieldName
        ? String(agentConfig.n8nQueryFieldName)
        : undefined,
      additionalHeaders:
        agentConfig.additionalHeaders &&
        typeof agentConfig.additionalHeaders === 'object' &&
        !Array.isArray(agentConfig.additionalHeaders)
          ? (agentConfig.additionalHeaders as Record<string, string>)
          : undefined,
    });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId: res.conversationId || params.conversationId,
      error: res.ok ? undefined : res.preview || res.rawBody,
      source: 'n8n',
    };
  }

  if (agentType === 'tencent-adp') {
    const resolved = resolveTencentAdpConfig(agentConfig);
    if (!resolved) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: '腾讯 ADP 未配置 AppKey 或 VisitorId',
        source: 'tencent-adp',
      };
    }
    const transportError = validateTencentAdpConfigForTransport(resolved);
    if (transportError) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: transportError,
        source: 'tencent-adp',
      };
    }
    const conversationId = params.conversationId?.trim() || randomUUID();
    const res = await callTencentAdpChat({
      config: resolved,
      query: message,
      conversationId,
    });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId,
      error: res.ok ? undefined : res.errorMessage || res.preview,
      source: 'tencent-adp',
    };
  }

  if (agentType === 'api' || agentType === 'api-stream' || agentType === 'langchain') {
    const endpoint =
      agentType === 'langchain'
        ? buildLangChainEndpoint(agentConfig)
        : buildApiAgentEndpoint(agentConfig);
    if (!endpoint) {
      return {
        ok: false,
        status: 0,
        preview: '',
        durationMs: 0,
        error: 'Missing apiBaseUrl or endpoint configuration',
        source: agentType,
      };
    }
    const headers =
      agentType === 'langchain'
        ? { 'Content-Type': 'application/json' }
        : buildApiAgentHeaders(agentConfig);
    const inputs =
      agentConfig.inputs &&
      typeof agentConfig.inputs === 'object' &&
      !Array.isArray(agentConfig.inputs)
        ? (agentConfig.inputs as Record<string, unknown>)
        : {};
    const payload =
      agentType === 'langchain'
        ? buildLangChainPayload({
            agentConfig,
            prompt: message,
            inputs,
            conversationId: params.conversationId,
          })
        : buildApiAgentPayload({
            agentConfig: {
              ...agentConfig,
              ...(agentType === 'api-stream' ? { apiType: 'api-stream' } : {}),
            },
            prompt: message,
            inputs,
            conversationId: params.conversationId || userId,
          });
    const res = await callApiAgent({ endpoint, headers, payload });
    return {
      ok: res.ok,
      status: res.status,
      preview: res.preview,
      durationMs: res.durationMs,
      conversationId: params.conversationId || userId,
      error: res.ok ? undefined : res.preview || res.rawBody,
      source: agentType === 'langchain' ? 'langchain' : 'api',
    };
  }

  return {
    ok: false,
    status: 0,
    preview: '',
    durationMs: 0,
    error: `Unsupported agent type for multi-round chat: ${agentType}`,
    source: agentType || 'unknown',
  };
}
