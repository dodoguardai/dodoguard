/**
 * n8n workflow JSON static security audit: parse, sanitize subset, LLM.
 */

import { createHash } from 'node:crypto';

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
  N8N_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
  N8N_CONFIG_AUDIT_SYSTEM_PROMPT,
  buildN8nConfigAuditUserContent,
} from './n8nConfigAuditPrompts';
import { callConfigAuditWithContextRetry } from './configAuditLlmContextRetry';

const MAX_JSON_CHARS = 5 * 1024 * 1024;
const MAX_LLM_PAYLOAD_CHARS = 100_000;
const MAX_NODES_IN_SUBSET = 100;
const MAX_CONNECTIONS_IN_SUBSET = 300;
const MAX_STRING_CHARS_IN_NODE = 5_000;

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

function normalizeN8nAuditProviderId(
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

export type AnalyzeN8nConfigInput = {
  jsonText: string;
  fileName?: string;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export function parseN8nWorkflowJson(text: string): unknown {
  if (text.length > MAX_JSON_CHARS) {
    throw new Error(`JSON exceeds maximum length (${MAX_JSON_CHARS} bytes)`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertN8nWorkflowExport(root: unknown): asserts root is Record<string, unknown> {
  if (!isRecord(root)) {
    throw new Error('JSON root must be an object');
  }

  const nodes = root.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Missing nodes: not a valid n8n workflow export');
  }

  for (const n of nodes) {
    if (!isRecord(n)) {
      throw new Error('Invalid node: each node must be an object');
    }
  }
}

function collectNodeNames(nodes: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const n of nodes) {
    if (isRecord(n) && typeof n.name === 'string' && n.name.trim()) {
      names.add(n.name);
    }
  }
  return names;
}

function countConnections(connections: unknown): number {
  if (!isRecord(connections)) {
    return 0;
  }
  let count = 0;
  // n8n connections shape: { [fromNodeName]: { main: [ [ {node: toName} ], ... ] } }
  for (const fromFlow of Object.values(connections)) {
    if (!isRecord(fromFlow)) {
      continue;
    }
    for (const edges of Object.values(fromFlow)) {
      if (!Array.isArray(edges)) {
        continue;
      }
      for (const group of edges) {
        if (!Array.isArray(group)) {
          continue;
        }
        for (const e of group) {
          if (isRecord(e) && typeof e.node === 'string') {
            count++;
          }
        }
      }
    }
  }
  return count;
}

function slimConnections(
  connections: unknown,
  allowedNodeNames: Set<string>,
): { connections: unknown; truncated: boolean } {
  if (!isRecord(connections)) {
    return { connections: {}, truncated: false };
  }

  let truncated = false;
  let edgeCount = 0;

  const out: Record<string, unknown> = {};
  for (const [fromName, fromFlow] of Object.entries(connections)) {
    if (!allowedNodeNames.has(fromName)) {
      continue;
    }
    if (!isRecord(fromFlow)) {
      continue;
    }

    const fromOut: Record<string, unknown> = {};
    for (const [flowType, edges] of Object.entries(fromFlow)) {
      if (!Array.isArray(edges)) {
        continue;
      }

      const newEdges: unknown[] = [];
      for (const group of edges) {
        if (!Array.isArray(group)) {
          continue;
        }
        const filteredGroup = group.filter(
          (e) => isRecord(e) && typeof e.node === 'string' && allowedNodeNames.has(e.node),
        );
        edgeCount += filteredGroup.length;
        if (filteredGroup.length > 0) {
          newEdges.push(filteredGroup);
        }

        if (edgeCount >= MAX_CONNECTIONS_IN_SUBSET) {
          truncated = true;
          break;
        }
      }

      if (newEdges.length > 0) {
        fromOut[flowType] = newEdges;
      }
      if (edgeCount >= MAX_CONNECTIONS_IN_SUBSET) {
        break;
      }
    }

    if (Object.keys(fromOut).length > 0) {
      out[fromName] = fromOut;
    }

    if (edgeCount >= MAX_CONNECTIONS_IN_SUBSET) {
      break;
    }
  }

  return { connections: out, truncated };
}

export function extractN8nSecuritySubset(root: Record<string, unknown>): {
  subset: Record<string, unknown>;
  truncated: boolean;
} {
  const nodesRaw = Array.isArray(root.nodes) ? root.nodes : [];
  const connectionsRaw = root.connections;

  let truncated = false;
  let nodesOut = nodesRaw;
  if (nodesRaw.length > MAX_NODES_IN_SUBSET) {
    nodesOut = nodesRaw.slice(0, MAX_NODES_IN_SUBSET);
    truncated = true;
  }

  const allowedNodeNames = collectNodeNames(nodesOut);
  const connectionsTrimmed = slimConnections(connectionsRaw, allowedNodeNames);
  truncated = truncated || connectionsTrimmed.truncated;

  const subset: Record<string, unknown> = {
    name: typeof root.name === 'string' ? root.name : undefined,
    nodes: nodesOut,
    connections: connectionsTrimmed.connections,
    active: root.active,
    settings: root.settings,
  };

  return { subset, truncated };
}

function slimString(s: string): string {
  return s.length > MAX_STRING_CHARS_IN_NODE
    ? `${s.slice(0, MAX_STRING_CHARS_IN_NODE)}...[truncated]`
    : s;
}

function slimNodeValue(v: unknown, depth: number): unknown {
  if (depth > 3) {
    return '[...]';
  }
  if (typeof v === 'string') {
    return slimString(v);
  }
  if (v === null || v === undefined) {
    return v;
  }
  if (typeof v !== 'object') {
    return v;
  }

  if (Array.isArray(v)) {
    return v.slice(0, 30).map((x) => slimNodeValue(x, depth + 1));
  }

  if (isRecord(v)) {
    const entries = Object.entries(v).slice(0, 60);
    return Object.fromEntries(entries.map(([k, val]) => [k, slimNodeValue(val, depth + 1)]));
  }

  return '[...]';
}

function slimNode(node: unknown): unknown {
  if (!isRecord(node)) {
    return node;
  }
  const parameters = isRecord(node.parameters)
    ? slimNodeValue(node.parameters, 0)
    : node.parameters;

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    parameters,
  };
}

export function n8nSubsetToSanitizedJson(subset: Record<string, unknown>): string {
  const sanitized = sanitizeObject(subset, { context: 'n8n-config-audit' }) as Record<
    string,
    unknown
  >;
  let json = JSON.stringify(sanitized, null, 0);

  if (json.length > MAX_LLM_PAYLOAD_CHARS) {
    const nodes = Array.isArray(sanitized.nodes) ? sanitized.nodes : [];
    const slimNodes = nodes.map((node) => slimNode(node));

    const slim = {
      ...sanitized,
      nodes: slimNodes,
    };
    json = JSON.stringify(slim, null, 0);
    if (json.length > MAX_LLM_PAYLOAD_CHARS) {
      json = json.slice(0, MAX_LLM_PAYLOAD_CHARS);
    }
  }

  return json;
}

export async function analyzeN8nConfigJson(
  input: AnalyzeN8nConfigInput,
): Promise<DifyConfigAuditResult> {
  const parsed = parseN8nWorkflowJson(input.jsonText);
  assertN8nWorkflowExport(parsed);

  const parsedRecord = parsed as Record<string, unknown>;
  const nodesRaw = parsedRecord.nodes;
  const nodes = Array.isArray(nodesRaw) ? (nodesRaw as unknown[]) : [];

  const connectionsCount = countConnections((parsed as Record<string, unknown>).connections);
  const workflowMeta = {
    workflowName: typeof parsedRecord.name === 'string' ? parsedRecord.name : undefined,
    nodeCount: nodes.length,
    connectionsCount,
  };

  const { subset, truncated: truncatedSubset } = extractN8nSecuritySubset(parsed);
  const payloadJson = n8nSubsetToSanitizedJson(subset);

  let truncated = truncatedSubset;
  if (payloadJson.length >= MAX_LLM_PAYLOAD_CHARS) {
    truncated = true;
  }

  const userContent = buildN8nConfigAuditUserContent({
    fileName: input.fileName,
    workflowMeta,
    payloadJson,
    truncated,
  });

  let providerId =
    input.provider?.id ??
    process.env.N8N_CONFIG_AUDIT_PROVIDER_ID ??
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
  const normalizedId = normalizeN8nAuditProviderId(providerId, isOllamaLike, apiBaseUrl);
  if (normalizedId !== providerId) {
    logger.info('[n8n-config-audit] Normalized provider id', {
      from: providerId,
      to: normalizedId,
    });
    providerId = normalizedId;
  }

  const apiKey =
    (input.provider?.config?.apiKey as string | undefined) ??
    (isOllamaLike ? getEnvString('OLLAMA_API_KEY', '') : getEnvString('OPENAI_API_KEY', ''));

  logger.info('[n8n-config-audit] Provider resolution', {
    receivedProviderId: input.provider?.id ?? '(none)',
    providerId,
    isOllamaLike,
    hasApiKey: !!apiKey,
  });

  // Ollama runs locally and typically does not require an API key.
  if (!isOptionalApiKeyLocalLlm(apiBaseUrl, providerId) && !apiKey) {
    const hint = input.provider?.id
      ? ''
      : ' No provider sent from frontend. Select a model in Settings → Integrations, or set N8N_CONFIG_AUDIT_PROVIDER_ID=ollama:chat:YOUR_MODEL in env.';
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
      N8N_CONFIG_AUDIT_SYSTEM_PROMPT,
      buildN8nConfigAuditUserContent({
        fileName: input.fileName,
        workflowMeta,
        payloadJson: nextPayloadJson,
        truncated: nextTruncated,
      }),
    );

  const prompt = buildChatPrompt(N8N_CONFIG_AUDIT_SYSTEM_PROMPT, userContent);
  logger.info('[n8n-config-audit] Starting LLM audit', {
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
    logPrefix: '[n8n-config-audit]',
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
    logger.warn('[n8n-config-audit] First LLM output parse failed', { error: msg });
    parsedJson = undefined;
  }

  if (typeof parsedJson === 'string') {
    logger.warn('[n8n-config-audit] Audit payload root is still a string after normalization', {
      head: parsedJson.slice(0, 280).replace(/\s+/g, ' '),
    });
  }

  let validated = auditResultSchema.safeParse(parsedJson);
  const needsRepair =
    parsedJson === undefined || typeof parsedJson === 'string' || !validated.success;

  let repairParseFailed = false;

  if (needsRepair && proseFromFirst.trim()) {
    logger.info('[n8n-config-audit] Running one JSON repair LLM call (prose or schema mismatch)');

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
        N8N_CONFIG_AUDIT_RETRY_SYSTEM_PROMPT,
        buildDifyConfigAuditRetryUserContent(proseFromFirst),
      );
      const retryResp = await repairProvider.callApi(retryPrompt);
      if (retryResp.error) {
        logger.warn('[n8n-config-audit] Repair LLM call failed', { error: retryResp.error });
      } else {
        lastModelOutput = retryResp.output;
        try {
          parsedJson = parseModelOutput(retryResp.output);
          if (typeof parsedJson === 'string') {
            logger.warn('[n8n-config-audit] Repair output still string root', {
              head: parsedJson.slice(0, 200).replace(/\s+/g, ' '),
            });
          }
          validated = auditResultSchema.safeParse(parsedJson);
        } catch (e) {
          repairParseFailed = true;
          const repairOutputText = coerceChatContentToText(retryResp.output);
          logger.warn('[n8n-config-audit] Repair LLM output parse failed', {
            error: e instanceof Error ? e.message : String(e),
            repairOutputHead:
              repairOutputText.slice(0, 400).replace(/\s+/g, ' ').trim() || '(empty)',
          });
          parsedJson = undefined;
          validated = auditResultSchema.safeParse(undefined);
        }
      }
    } else {
      logger.warn('[n8n-config-audit] Could not load repair provider; skipping repair pass');
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
        '[n8n-config-audit] Returning synthetic fallback (repair response was not parseable JSON)',
      );
    } else if (parsedJson === undefined) {
      logger.warn(
        '[n8n-config-audit] Returning synthetic fallback (reviewer output was not parseable JSON)',
      );
    } else {
      logger.warn('[n8n-config-audit] Returning synthetic fallback (schema mismatch)', {
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
      'n8n 工作流导出',
    );
  }

  return {
    ...validated.data,
    warnings: validated.data.warnings ?? [],
    truncated: effectiveTruncated,
  };
}
