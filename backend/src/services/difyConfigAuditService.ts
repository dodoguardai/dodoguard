/**
 * Dify application YAML static security audit: parse, sanitize, subset, LLM.
 */

import { createHash } from 'node:crypto';

import yaml from 'js-yaml';
import { z } from 'zod';
import { getEnvString } from '../envars';
import { isOptionalApiKeyLocalLlm, openAiJsonObjectResponseFormat } from '../lib/localLlmUrl';
import { applyModelAwareNonStreamingDefaults } from '../lib/llm-integration-resolve';
import logger from '../logger';
import { loadApiProviders } from '../providers/index';
import { sanitizeObject } from '../util/sanitizer';
import {
  coerceChatContentToText,
  normalizeDifyAuditLlmJson,
  parseDifyAuditModelJsonOutput,
} from './difyConfigAuditParseModelJson';
import {
  buildDifyConfigAuditRetryUserContent,
  buildDifyConfigAuditUserContent,
  DIFY_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
  DIFY_CONFIG_AUDIT_SYSTEM_PROMPT,
} from './difyConfigAuditPrompts';
import { callConfigAuditWithContextRetry } from './configAuditLlmContextRetry';

const MAX_YAML_CHARS = 5 * 1024 * 1024;
const MAX_LLM_PAYLOAD_CHARS = 100_000;
const MAX_NODES_IN_SUBSET = 100;

/** e.g. ollama:chat:deepseek-r1:1.5b — not bare model names like deepseek-r1:1.5b */
function looksLikeFullProviderPath(id: string): boolean {
  const parts = id.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

/** Fix legacy/wrong ids such as deepseek-r1:1.5b (Ollama tag) mistaken for a full provider path. */
function normalizeDifyAuditProviderId(
  id: string,
  isOllamaLike: boolean,
  apiBaseUrl: string,
): string {
  if (looksLikeFullProviderPath(id)) {
    return id;
  }
  if (!isOllamaLike) {
    return id;
  }
  // OpenAI-compatible Ollama (/v1) uses openai:chat stack
  if (apiBaseUrl.includes('/v1')) {
    return `openai:chat:${id}`;
  }
  return `ollama:chat:${id}`;
}

/** Shared structured audit JSON schema (Dify config audit, SKILLS.md audit, etc.). */
export const auditResultSchema = z.object({
  summary: z.string(),
  overallRisk: z.enum(['low', 'medium', 'high', 'critical']),
  findings: z.array(
    z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      category: z.string(),
      location: z.string(),
      issue: z.string(),
      evidence: z.string(),
      recommendation: z.string(),
      /** TrustTools-style dimension id (skills audit); optional for Dify YAML audit. */
      dimension: z.string().max(64).optional(),
      /** Zip-relative path when auditing a skill package. */
      sourceFile: z.string().max(2048).optional(),
    }),
  ),
  recommendations: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export type DifyConfigAuditResult = z.infer<typeof auditResultSchema> & {
  truncated: boolean;
};

/** Shown when the model keeps returning prose so the UI still has a structured result. */
export function syntheticAuditWhenModelUnparseable(
  reason: string,
  excerpt: string,
  truncatedWorkflow: boolean,
  resourceHint: string = 'YAML 导出',
): DifyConfigAuditResult {
  const safeExcerpt = excerpt.replace(/\s+/g, ' ').slice(0, 2000);
  return {
    summary: `审查模型未返回符合要求的结构化 JSON（或修复重试失败）。本段为系统自动生成的占位说明。请在「设置 → 集成」中更换能稳定输出纯 JSON 的大模型（例如支持 OpenAI 兼容的 \`response_format: json_object\`），或缩小 ${resourceHint} 体积后重试。`,
    overallRisk: 'medium',
    findings: [
      {
        severity: 'medium',
        category: 'F_workflow_logic',
        location: 'reviewer_output',
        issue: reason,
        evidence: safeExcerpt || '（模型输出摘录为空）',
        recommendation:
          '更换其他集成模型，或选用能在无前缀推理文本的情况下强制返回 JSON 对象的供应商接口。',
        dimension: 'prompt_injection',
      },
    ],
    recommendations: [
      '换用具备严格 JSON 输出能力的模型（例如 gpt-4o-mini 一类）后重试。',
      `若响应可能被截断，请缩小 ${resourceHint} 体积后重试。`,
    ],
    warnings: ['回退报告：模型输出在修复尝试后仍无法解析为所需审计 JSON 结构。'],
    truncated: truncatedWorkflow,
  };
}

export type AnalyzeDifyConfigInput = {
  yamlText: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseDifyExportYaml(yamlText: string): unknown {
  if (yamlText.length > MAX_YAML_CHARS) {
    throw new Error(`YAML exceeds maximum length (${MAX_YAML_CHARS} bytes)`);
  }
  try {
    return yaml.load(yamlText);
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function assertDifyAppExport(root: unknown): asserts root is Record<string, unknown> {
  if (!isRecord(root)) {
    throw new Error('YAML root must be an object');
  }
  const kind = root.kind;
  if (kind !== undefined && kind !== 'app') {
    throw new Error(`Unsupported export kind: expected app DSL, got kind=${String(kind)}`);
  }
  if (!isRecord(root.workflow)) {
    throw new Error('Missing workflow: not a valid Dify application export');
  }
}

/**
 * Build a smaller object for LLM: app, dependencies, workflow.features, graph nodes/edges (capped).
 */
export function extractSecurityRelevantSubset(root: Record<string, unknown>): {
  subset: Record<string, unknown>;
  truncated: boolean;
} {
  const workflow = root.workflow as Record<string, unknown>;
  const graph = isRecord(workflow.graph) ? workflow.graph : {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  let truncated = false;
  let nodesOut = nodes;
  if (nodes.length > MAX_NODES_IN_SUBSET) {
    nodesOut = nodes.slice(0, MAX_NODES_IN_SUBSET);
    truncated = true;
  }

  const subset: Record<string, unknown> = {
    app: root.app,
    dependencies: root.dependencies,
    version: root.version,
    kind: root.kind,
    workflow: {
      conversation_variables: workflow.conversation_variables,
      environment_variables: workflow.environment_variables,
      features: workflow.features,
      graph: {
        edges,
        nodes: nodesOut,
      },
    },
  };

  return { subset, truncated };
}

export function subsetToSanitizedJson(subset: Record<string, unknown>): string {
  const sanitized = sanitizeObject(subset, { context: 'dify-config-audit' }) as Record<
    string,
    unknown
  >;
  let json = JSON.stringify(sanitized, null, 0);
  if (json.length > MAX_LLM_PAYLOAD_CHARS) {
    const wf = sanitized.workflow as Record<string, unknown> | undefined;
    const g = wf && isRecord(wf.graph) ? wf.graph : {};
    const n = Array.isArray(g.nodes) ? g.nodes : [];
    const slimNodes = n.map((node: unknown) => {
      if (!isRecord(node)) {
        return node;
      }
      const data = node.data;
      return {
        id: node.id,
        type: node.type,
        data: isRecord(data)
          ? {
              type: data.type,
              title: data.title,
              desc: data.desc,
            }
          : data,
      };
    });
    const slim = {
      ...sanitized,
      workflow: {
        ...wf,
        graph: { ...g, nodes: slimNodes },
      },
    };
    json = JSON.stringify(slim, null, 0);
    if (json.length > MAX_LLM_PAYLOAD_CHARS) {
      json = json.slice(0, MAX_LLM_PAYLOAD_CHARS);
    }
  }
  return json;
}

export function buildChatPrompt(system: string, user: string): string {
  return JSON.stringify([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}

export function parseModelOutput(output: unknown): unknown {
  let parsedJson = normalizeDifyAuditLlmJson(parseDifyAuditModelJsonOutput(output));
  if (typeof parsedJson === 'string') {
    try {
      parsedJson = normalizeDifyAuditLlmJson(parseDifyAuditModelJsonOutput(parsedJson));
    } catch {
      /* keep string for caller */
    }
  }
  return parsedJson;
}

export async function analyzeDifyConfigYaml(
  input: AnalyzeDifyConfigInput,
): Promise<DifyConfigAuditResult> {
  const parsed = parseDifyExportYaml(input.yamlText);
  assertDifyAppExport(parsed);

  const { subset, truncated: truncatedNodes } = extractSecurityRelevantSubset(parsed);
  const appMeta = isRecord(parsed.app) ? { name: parsed.app.name, mode: parsed.app.mode } : {};
  const payloadJson = subsetToSanitizedJson(subset);
  let truncated = truncatedNodes;
  if (payloadJson.length >= MAX_LLM_PAYLOAD_CHARS) {
    truncated = true;
  }

  let providerId =
    input.provider?.id ?? process.env.DIFY_CONFIG_AUDIT_PROVIDER_ID ?? 'openai:chat:gpt-4o-mini';
  const isOllamaProvider = providerId.toLowerCase().startsWith('ollama:');
  const apiBaseUrl =
    (input.provider?.config?.apiBaseUrl as string | undefined) ??
    (isOllamaProvider
      ? getEnvString('OLLAMA_BASE_URL', '')
      : getEnvString('OPENAI_API_BASE_URL', ''));
  // Ollama as OpenAI-compatible: many users add "OpenAI" integration with apiBaseUrl=localhost:11434
  const isOllamaCompatibleUrl = (url: string) => {
    try {
      const u = new URL(url);
      const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      return (isLocal && u.port === '11434') || url.toLowerCase().includes('ollama');
    } catch {
      return url.includes('11434') || url.toLowerCase().includes('ollama');
    }
  };
  const isOllamaLike = isOllamaProvider || (!!apiBaseUrl && isOllamaCompatibleUrl(apiBaseUrl));
  const normalizedId = normalizeDifyAuditProviderId(providerId, isOllamaLike, apiBaseUrl);
  if (normalizedId !== providerId) {
    logger.info('[dify-config-audit] Normalized provider id', {
      from: providerId,
      to: normalizedId,
    });
    providerId = normalizedId;
  }
  const apiKey =
    (input.provider?.config?.apiKey as string | undefined) ??
    (isOllamaLike ? getEnvString('OLLAMA_API_KEY', '') : getEnvString('OPENAI_API_KEY', ''));

  logger.info('[dify-config-audit] Provider resolution', {
    receivedProviderId: input.provider?.id ?? '(none)',
    providerId,
    isOllamaLike,
    hasApiKey: !!apiKey,
  });

  // Ollama / LM Studio run locally and typically do not require an API key
  if (!isOptionalApiKeyLocalLlm(apiBaseUrl, providerId) && !apiKey) {
    const hint = input.provider?.id
      ? ''
      : ' No provider sent from frontend. Select a model in Step 2, or set DIFY_CONFIG_AUDIT_PROVIDER_ID=ollama:chat:YOUR_MODEL in env.';
    throw new Error(
      `No API key: provide provider.config.apiKey in the request body or set OPENAI_API_KEY.${hint}`,
    );
  }

  const jsonResponseFormat = openAiJsonObjectResponseFormat(apiBaseUrl ?? '');

  const providerConfig = applyModelAwareNonStreamingDefaults(
    {
      ...(apiKey ? { apiKey } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      temperature: 0.1,
      max_tokens: 8192,
      ...(jsonResponseFormat ? { response_format: jsonResponseFormat } : {}),
      ...(input.provider?.config && typeof input.provider.config === 'object'
        ? Object.fromEntries(
            Object.entries(input.provider.config).filter(
              ([k]) =>
                !['apiKey', 'apiBaseUrl', 'temperature', 'max_tokens', 'response_format'].includes(
                  k,
                ),
            ),
          )
        : {}),
    },
    providerId,
  );

  const providers = await loadApiProviders([
    {
      id: providerId,
      config: providerConfig,
    },
  ]);
  const provider = providers[0];
  if (!provider?.callApi) {
    throw new Error('Failed to load LLM provider');
  }

  const buildPromptForPayload = (nextPayloadJson: string, nextTruncated: boolean) =>
    buildChatPrompt(
      DIFY_CONFIG_AUDIT_SYSTEM_PROMPT,
      buildDifyConfigAuditUserContent({
        fileName: input.fileName,
        appMeta,
        payloadJson: nextPayloadJson,
        truncated: nextTruncated,
      }),
    );

  let effectivePayloadJson = payloadJson;
  let effectiveTruncated = truncated;
  const prompt = buildPromptForPayload(effectivePayloadJson, effectiveTruncated);
  logger.info('[dify-config-audit] Starting LLM audit', {
    fileNameHash: input.fileName
      ? createHash('sha256').update(input.fileName).digest('hex').slice(0, 16)
      : undefined,
    providerId,
    truncated: effectiveTruncated,
    payloadChars: effectivePayloadJson.length,
  });

  const retryResult = await callConfigAuditWithContextRetry({
    provider,
    providerId,
    providerConfig,
    prompt,
    buildPrompt: buildPromptForPayload,
    payloadJson,
    truncated,
    logger,
    logPrefix: '[dify-config-audit]',
  });
  const response = retryResult.response;
  effectivePayloadJson = retryResult.payloadJson;
  effectiveTruncated = retryResult.truncated;
  if (response.error) {
    throw new Error(response.error);
  }

  let lastModelOutput: unknown = response.output;

  const proseFromFirst = coerceChatContentToText(response.output);

  let parsedJson: unknown;
  try {
    parsedJson = parseModelOutput(response.output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Empty model output') {
      throw e;
    }
    logger.warn('[dify-config-audit] First LLM output parse failed', { error: msg });
    parsedJson = undefined;
  }

  if (typeof parsedJson === 'string') {
    logger.warn('[dify-config-audit] Audit payload root is still a string after normalization', {
      head: parsedJson.slice(0, 280).replace(/\s+/g, ' '),
    });
  }

  let validated = auditResultSchema.safeParse(parsedJson);

  const needsRepair =
    parsedJson === undefined || typeof parsedJson === 'string' || !validated.success;

  let repairParseFailed = false;

  if (needsRepair && proseFromFirst.trim()) {
    logger.info('[dify-config-audit] Running one JSON repair LLM call (prose or schema mismatch)');
    const repairProviderConfig: Record<string, unknown> = {
      ...providerConfig,
      temperature: 0,
      max_tokens: 4096,
      ...(jsonResponseFormat ? { response_format: jsonResponseFormat } : {}),
    };
    const [repairProviderLoaded] = await loadApiProviders([
      { id: providerId, config: repairProviderConfig },
    ]);
    const repairProvider = repairProviderLoaded;
    if (repairProvider?.callApi) {
      const retryPrompt = buildChatPrompt(
        DIFY_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
        buildDifyConfigAuditRetryUserContent(proseFromFirst),
      );
      const retryResp = await repairProvider.callApi(retryPrompt);
      if (retryResp.error) {
        logger.warn('[dify-config-audit] Repair LLM call failed', { error: retryResp.error });
      } else {
        lastModelOutput = retryResp.output;
        try {
          parsedJson = parseModelOutput(retryResp.output);
          if (typeof parsedJson === 'string') {
            logger.warn('[dify-config-audit] Repair output still string root', {
              head: parsedJson.slice(0, 200).replace(/\s+/g, ' '),
            });
          }
          validated = auditResultSchema.safeParse(parsedJson);
        } catch (e) {
          repairParseFailed = true;
          const repairOutputText = coerceChatContentToText(retryResp.output);
          logger.warn('[dify-config-audit] Repair LLM output parse failed', {
            error: e instanceof Error ? e.message : String(e),
            repairOutputHead:
              repairOutputText.slice(0, 400).replace(/\s+/g, ' ').trim() || '(empty)',
          });
          // Avoid stale Zod result from the pre-repair pass (e.g. safeParse(undefined) → all fields "Required").
          parsedJson = undefined;
          validated = auditResultSchema.safeParse(undefined);
        }
      }
    } else {
      logger.warn('[dify-config-audit] Could not load repair provider; skipping repair pass');
    }
  }

  if (!validated.success) {
    const excerpt = coerceChatContentToText(lastModelOutput).trim()
      ? coerceChatContentToText(lastModelOutput)
      : proseFromFirst;
    if (!excerpt.trim()) {
      const raw = response.output;
      const len = typeof raw === 'string' ? raw.length : 0;
      const head =
        typeof raw === 'string'
          ? raw.slice(0, 160).replace(/\s+/g, ' ')
          : typeof raw === 'object'
            ? '[object]'
            : String(raw).slice(0, 160);
      logger.warn('[dify-config-audit] Model output was not valid JSON', {
        outputLength: len,
        outputHead: head,
      });
      throw new Error('Model returned non-JSON output');
    }
    if (repairParseFailed) {
      logger.warn(
        '[dify-config-audit] Returning synthetic fallback (repair response was not parseable JSON)',
      );
    } else if (parsedJson === undefined) {
      logger.warn(
        '[dify-config-audit] Returning synthetic fallback (reviewer output was not parseable JSON)',
      );
    } else {
      logger.warn('[dify-config-audit] Returning synthetic fallback (schema mismatch)', {
        issues: validated.error.flatten(),
      });
    }
    const reason = repairParseFailed
      ? 'Repair model response could not be parsed as JSON (no valid audit object found).'
      : typeof parsedJson === 'string'
        ? 'Parsed value remained a string (model returned prose, not JSON).'
        : parsedJson === undefined
          ? 'Reviewer output could not be parsed as JSON.'
          : 'Model response did not match the expected audit schema.';
    return syntheticAuditWhenModelUnparseable(reason, excerpt, effectiveTruncated);
  }

  return {
    ...validated.data,
    warnings: validated.data.warnings ?? [],
    truncated: effectiveTruncated,
  };
}
