/**
 * Coze workflow YAML static security audit: parse, sanitize subset, LLM.
 */

import { createHash } from 'node:crypto';

import yaml from 'js-yaml';
import { getEnvString } from '../envars';
import { isOptionalApiKeyLocalLlm, openAiJsonObjectResponseFormat } from '../lib/localLlmUrl';
import { applyModelAwareNonStreamingDefaults } from '../lib/llm-integration-resolve';
import logger from '../logger';
import { loadApiProviders } from '../providers/index';
import { sanitizeObject } from '../util/sanitizer';
import {
  auditResultSchema,
  buildChatPrompt,
  DifyConfigAuditResult,
  parseModelOutput,
  syntheticAuditWhenModelUnparseable,
} from './difyConfigAuditService';
import { coerceChatContentToText } from './difyConfigAuditParseModelJson';
import { buildDifyConfigAuditRetryUserContent } from './difyConfigAuditPrompts';
import {
  buildCozeConfigAuditUserContent,
  COZE_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
  COZE_CONFIG_AUDIT_SYSTEM_PROMPT,
} from './cozeConfigAuditPrompts';
import { callConfigAuditWithContextRetry } from './configAuditLlmContextRetry';

const MAX_YAML_CHARS = 5 * 1024 * 1024;
const MAX_LLM_PAYLOAD_CHARS = 100_000;
const MAX_NODES_IN_SUBSET = 100;
const MAX_EDGES_IN_SUBSET = 300;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeFullProviderPath(id: string): boolean {
  const parts = id.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function normalizeCozeAuditProviderId(
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
  if (apiBaseUrl.includes('/v1')) {
    return `openai:chat:${id}`;
  }
  return `ollama:chat:${id}`;
}

export function parseCozeExportYaml(yamlText: string): unknown {
  if (yamlText.length > MAX_YAML_CHARS) {
    throw new Error(`YAML exceeds maximum length (${MAX_YAML_CHARS} bytes)`);
  }
  try {
    return yaml.load(yamlText);
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const COZE_NODE_TYPES = new Set([
  'start',
  'end',
  'llm',
  'knowledge',
  'code',
  'http',
  'plugin',
  'condition',
  'loop',
  'variable',
]);

export function assertCozeWorkflowExport(root: unknown): asserts root is Record<string, unknown> {
  if (!isRecord(root)) {
    throw new Error('YAML root must be an object');
  }

  if (isRecord(root.workflow) && root.kind === 'app') {
    throw new Error(
      'This looks like a Dify application export, not a Coze workflow YAML. Use Dify Config Gray-Box Scanning instead.',
    );
  }

  const nodes = root.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Missing nodes: not a valid Coze workflow export');
  }

  const hasCozeShape =
    root.schema_version !== undefined ||
    root.mode === 'workflow' ||
    nodes.some((n) => {
      if (!isRecord(n)) {
        return false;
      }
      const t = typeof n.type === 'string' ? n.type.toLowerCase() : '';
      return COZE_NODE_TYPES.has(t);
    });

  if (!hasCozeShape) {
    throw new Error(
      'Unrecognized workflow export: expected Coze workflow fields (e.g. schema_version, mode: workflow, or node types such as llm/knowledge/start).',
    );
  }

  for (const n of nodes) {
    if (!isRecord(n)) {
      throw new Error('Invalid node: each node must be an object');
    }
    if (typeof n.id !== 'string' && typeof n.id !== 'number') {
      throw new Error('Invalid node: missing id');
    }
    if (typeof n.type !== 'string') {
      throw new Error('Invalid node: missing type');
    }
  }
}

export function extractCozeSecuritySubset(root: Record<string, unknown>): {
  subset: Record<string, unknown>;
  truncated: boolean;
} {
  const nodes = Array.isArray(root.nodes) ? root.nodes : [];
  const edges = Array.isArray(root.edges) ? root.edges : [];

  let truncated = false;
  let nodesOut = nodes;
  if (nodes.length > MAX_NODES_IN_SUBSET) {
    nodesOut = nodes.slice(0, MAX_NODES_IN_SUBSET);
    truncated = true;
  }

  let edgesOut = edges;
  if (edges.length > MAX_EDGES_IN_SUBSET) {
    edgesOut = edges.slice(0, MAX_EDGES_IN_SUBSET);
    truncated = true;
  }

  const subset: Record<string, unknown> = {
    schema_version: root.schema_version,
    name: root.name,
    id: root.id,
    description: root.description,
    mode: root.mode,
    icon: root.icon,
    nodes: nodesOut,
    edges: edgesOut,
  };

  return { subset, truncated };
}

export function cozeSubsetToSanitizedJson(subset: Record<string, unknown>): string {
  const sanitized = sanitizeObject(subset, { context: 'coze-config-audit' }) as Record<
    string,
    unknown
  >;
  let json = JSON.stringify(sanitized, null, 0);
  if (json.length > MAX_LLM_PAYLOAD_CHARS) {
    const nodes = Array.isArray(sanitized.nodes) ? sanitized.nodes : [];
    const slimNodes = nodes.map((node: unknown) => {
      if (!isRecord(node)) {
        return node;
      }
      return {
        id: node.id,
        type: node.type,
        title: node.title,
        description: node.description,
        version: node.version,
        parameters: node.parameters,
      };
    });
    const slim = {
      ...sanitized,
      nodes: slimNodes,
      edges: sanitized.edges,
    };
    json = JSON.stringify(slim, null, 0);
    if (json.length > MAX_LLM_PAYLOAD_CHARS) {
      json = json.slice(0, MAX_LLM_PAYLOAD_CHARS);
    }
  }
  return json;
}

export type AnalyzeCozeConfigInput = {
  yamlText: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export async function analyzeCozeConfigYaml(
  input: AnalyzeCozeConfigInput,
): Promise<DifyConfigAuditResult> {
  const parsed = parseCozeExportYaml(input.yamlText);
  assertCozeWorkflowExport(parsed);

  const { subset, truncated: truncatedSubset } = extractCozeSecuritySubset(parsed);
  const workflowMeta = {
    name: subset.name,
    id: subset.id,
    mode: subset.mode,
    schema_version: subset.schema_version,
  };
  const payloadJson = cozeSubsetToSanitizedJson(subset);
  let truncated = truncatedSubset;
  if (payloadJson.length >= MAX_LLM_PAYLOAD_CHARS) {
    truncated = true;
  }

  const userContent = buildCozeConfigAuditUserContent({
    fileName: input.fileName,
    workflowMeta,
    payloadJson,
    truncated,
  });

  let providerId =
    input.provider?.id ??
    process.env.COZE_CONFIG_AUDIT_PROVIDER_ID ??
    process.env.DIFY_CONFIG_AUDIT_PROVIDER_ID ??
    'openai:chat:gpt-4o-mini';
  const isOllamaProvider = providerId.toLowerCase().startsWith('ollama:');
  const apiBaseUrl =
    (input.provider?.config?.apiBaseUrl as string | undefined) ??
    (isOllamaProvider
      ? getEnvString('OLLAMA_BASE_URL', '')
      : getEnvString('OPENAI_API_BASE_URL', ''));
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
  const normalizedId = normalizeCozeAuditProviderId(providerId, isOllamaLike, apiBaseUrl);
  if (normalizedId !== providerId) {
    logger.info('[coze-config-audit] Normalized provider id', {
      from: providerId,
      to: normalizedId,
    });
    providerId = normalizedId;
  }
  const apiKey =
    (input.provider?.config?.apiKey as string | undefined) ??
    (isOllamaLike ? getEnvString('OLLAMA_API_KEY', '') : getEnvString('OPENAI_API_KEY', ''));

  logger.info('[coze-config-audit] Provider resolution', {
    receivedProviderId: input.provider?.id ?? '(none)',
    providerId,
    isOllamaLike,
    hasApiKey: !!apiKey,
  });

  if (!isOptionalApiKeyLocalLlm(apiBaseUrl, providerId) && !apiKey) {
    const hint = input.provider?.id
      ? ''
      : ' No provider sent from frontend. Select a model in Step 2, or set COZE_CONFIG_AUDIT_PROVIDER_ID=ollama:chat:YOUR_MODEL in env.';
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
      COZE_CONFIG_AUDIT_SYSTEM_PROMPT,
      buildCozeConfigAuditUserContent({
        fileName: input.fileName,
        workflowMeta,
        payloadJson: nextPayloadJson,
        truncated: nextTruncated,
      }),
    );

  const prompt = buildChatPrompt(COZE_CONFIG_AUDIT_SYSTEM_PROMPT, userContent);
  logger.info('[coze-config-audit] Starting LLM audit', {
    fileNameHash: input.fileName
      ? createHash('sha256').update(input.fileName).digest('hex').slice(0, 16)
      : undefined,
    providerId,
    truncated,
    payloadChars: payloadJson.length,
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
    logPrefix: '[coze-config-audit]',
  });
  const response = retryResult.response;
  const effectiveTruncated = retryResult.truncated;
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
    logger.warn('[coze-config-audit] First LLM output parse failed', { error: msg });
    parsedJson = undefined;
  }

  if (typeof parsedJson === 'string') {
    logger.warn('[coze-config-audit] Audit payload root is still a string after normalization', {
      head: parsedJson.slice(0, 280).replace(/\s+/g, ' '),
    });
  }

  let validated = auditResultSchema.safeParse(parsedJson);
  const needsRepair =
    parsedJson === undefined || typeof parsedJson === 'string' || !validated.success;
  let repairParseFailed = false;

  if (needsRepair && proseFromFirst.trim()) {
    logger.info('[coze-config-audit] Running one JSON repair LLM call (prose or schema mismatch)');
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
        COZE_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
        buildDifyConfigAuditRetryUserContent(proseFromFirst),
      );
      const retryResp = await repairProvider.callApi(retryPrompt);
      if (retryResp.error) {
        logger.warn('[coze-config-audit] Repair LLM call failed', { error: retryResp.error });
      } else {
        lastModelOutput = retryResp.output;
        try {
          parsedJson = parseModelOutput(retryResp.output);
          if (typeof parsedJson === 'string') {
            logger.warn('[coze-config-audit] Repair output still string root', {
              head: parsedJson.slice(0, 200).replace(/\s+/g, ' '),
            });
          }
          validated = auditResultSchema.safeParse(parsedJson);
        } catch (e) {
          repairParseFailed = true;
          const repairOutputText = coerceChatContentToText(retryResp.output);
          logger.warn('[coze-config-audit] Repair LLM output parse failed', {
            error: e instanceof Error ? e.message : String(e),
            repairOutputHead:
              repairOutputText.slice(0, 400).replace(/\s+/g, ' ').trim() || '(empty)',
          });
          parsedJson = undefined;
          validated = auditResultSchema.safeParse(undefined);
        }
      }
    } else {
      logger.warn('[coze-config-audit] Could not load repair provider; skipping repair pass');
    }
  }

  if (!validated.success) {
    const excerpt = coerceChatContentToText(lastModelOutput).trim()
      ? coerceChatContentToText(lastModelOutput)
      : proseFromFirst;
    if (!excerpt.trim()) {
      throw new Error('Model returned non-JSON output');
    }
    if (repairParseFailed) {
      logger.warn(
        '[coze-config-audit] Returning synthetic fallback (repair response was not parseable JSON)',
      );
    } else if (parsedJson === undefined) {
      logger.warn(
        '[coze-config-audit] Returning synthetic fallback (reviewer output was not parseable JSON)',
      );
    } else {
      logger.warn('[coze-config-audit] Returning synthetic fallback (schema mismatch)', {
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
    return syntheticAuditWhenModelUnparseable(
      reason,
      excerpt,
      effectiveTruncated,
      'Coze 工作流导出',
    );
  }

  return {
    ...validated.data,
    warnings: validated.data.warnings ?? [],
    truncated: effectiveTruncated,
  };
}
