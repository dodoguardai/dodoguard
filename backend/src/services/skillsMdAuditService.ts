/**
 * SKILLS.md static security audit: sanitize subset, LLM, structured JSON.
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
import { extractSkillPackageForAudit, mergeSkillFilesForAuditPayload } from './skillPackageExtract';
import { inferSkillAuditDimension, inferSourceFileFromLocation } from './skillsMdAuditDimensions';
import {
  buildMcpSourceAuditUserContent,
  MCP_SOURCE_AUDIT_RETRY_SYSTEM_PROMPT,
  MCP_SOURCE_AUDIT_SYSTEM_PROMPT,
} from './mcpSourceAuditPrompts';
import {
  buildSkillsMdAuditUserContent,
  SKILLS_MD_AUDIT_RETRY_SYSTEM_PROMPT,
  SKILLS_MD_AUDIT_SYSTEM_PROMPT,
} from './skillsMdAuditPrompts';
import { callConfigAuditWithContextRetry } from './configAuditLlmContextRetry';

const MAX_MARKDOWN_CHARS = 5 * 1024 * 1024;
const MAX_LLM_PAYLOAD_CHARS = 100_000;

function looksLikeFullProviderPath(id: string): boolean {
  const parts = id.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function normalizeSkillsAuditProviderId(
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

export type SkillsMdAuditMode = 'skills_md' | 'mcp_source';

export type AnalyzeSkillsMdInput = {
  markdown: string;
  fileName?: string;
  /** Zip-relative paths included in the payload (for sourceFile inference + UI). */
  scannedPaths?: string[];
  /** e.g. skipped paths from package extraction */
  packageWarnings?: string[];
  /** Default skills_md — use mcp_source for MCP server source archives. */
  auditMode?: SkillsMdAuditMode;
  provider?: {
    id: string;
    config?: Record<string, unknown>;
  };
};

export type SkillsMdAuditResult = DifyConfigAuditResult & {
  scannedFiles: { path: string }[];
};

function resolveScannedPaths(input: AnalyzeSkillsMdInput): string[] {
  if (input.scannedPaths && input.scannedPaths.length > 0) {
    return input.scannedPaths;
  }
  if (input.fileName?.trim()) {
    return [input.fileName.trim()];
  }
  return ['document.md'];
}

function finalizeSkillsMdAuditResult(
  data: DifyConfigAuditResult,
  opts: { scannedPaths: string[]; extraWarnings?: string[] },
): SkillsMdAuditResult {
  const mergedWarnings = [...(data.warnings ?? []), ...(opts.extraWarnings ?? [])];
  const findings = data.findings.map((f) => {
    const withExtras = f as typeof f & { sourceFile?: string };
    const sourceFile =
      withExtras.sourceFile?.trim() || inferSourceFileFromLocation(f.location, opts.scannedPaths);
    return {
      ...f,
      dimension: inferSkillAuditDimension(f),
      ...(sourceFile ? { sourceFile } : {}),
    };
  });
  return {
    ...data,
    findings,
    warnings: mergedWarnings,
    scannedFiles: opts.scannedPaths.map((path) => ({ path })),
  };
}

function withFinalize(
  data: DifyConfigAuditResult,
  input: AnalyzeSkillsMdInput,
  truncatedPayload: boolean,
): SkillsMdAuditResult {
  return {
    ...finalizeSkillsMdAuditResult(data, {
      scannedPaths: resolveScannedPaths(input),
      extraWarnings: input.packageWarnings,
    }),
    truncated: truncatedPayload,
  };
}

/** Exported for unit tests (size limits and truncation). */
export function prepareMarkdownPayload(
  markdown: string,
  auditMode: SkillsMdAuditMode = 'skills_md',
): { payloadText: string; truncated: boolean } {
  if (markdown.length > MAX_MARKDOWN_CHARS) {
    throw new Error(`Markdown exceeds maximum length (${MAX_MARKDOWN_CHARS} bytes)`);
  }
  const sanitizerContext = auditMode === 'mcp_source' ? 'mcp-audit' : 'skills-md-audit';
  const sanitized = sanitizeObject({ content: markdown }, { context: sanitizerContext }) as {
    content: string;
  };
  let text = sanitized.content;
  let truncated = false;
  if (text.length > MAX_LLM_PAYLOAD_CHARS) {
    text = text.slice(0, MAX_LLM_PAYLOAD_CHARS);
    truncated = true;
  }
  return { payloadText: text, truncated };
}

export async function analyzeSkillZipPackage(
  zipBuffer: Buffer,
  archiveFileName: string | undefined,
  provider?: AnalyzeSkillsMdInput['provider'],
): Promise<SkillsMdAuditResult> {
  const { files, warnings } = extractSkillPackageForAudit(zipBuffer);
  const markdown = mergeSkillFilesForAuditPayload(files);
  return analyzeSkillsMdMarkdown({
    markdown,
    fileName: archiveFileName,
    scannedPaths: files.map((f) => f.relativePath),
    packageWarnings: warnings,
    provider,
    auditMode: 'skills_md',
  });
}

/** MCP server source tree as .zip — same extract limits as skill packages, MCP-focused LLM prompts. */
export async function analyzeMcpSourceZip(
  zipBuffer: Buffer,
  archiveFileName: string | undefined,
  provider?: AnalyzeSkillsMdInput['provider'],
): Promise<SkillsMdAuditResult> {
  const { files, warnings } = extractSkillPackageForAudit(zipBuffer);
  const markdown = mergeSkillFilesForAuditPayload(files);
  return analyzeSkillsMdMarkdown({
    markdown,
    fileName: archiveFileName,
    scannedPaths: files.map((f) => f.relativePath),
    packageWarnings: warnings,
    provider,
    auditMode: 'mcp_source',
  });
}

export async function analyzeSkillsMdMarkdown(
  input: AnalyzeSkillsMdInput,
): Promise<SkillsMdAuditResult> {
  const auditMode = input.auditMode ?? 'skills_md';
  const logPrefix = auditMode === 'mcp_source' ? '[mcp-audit]' : '[skills-md-audit]';
  const { payloadText, truncated: truncatedPayload } = prepareMarkdownPayload(
    input.markdown,
    auditMode,
  );
  const scannedPaths = resolveScannedPaths(input);
  const userContent =
    auditMode === 'mcp_source'
      ? buildMcpSourceAuditUserContent({
          fileName: input.fileName,
          payloadText,
          truncated: truncatedPayload,
          includedRelativePaths: scannedPaths,
        })
      : buildSkillsMdAuditUserContent({
          fileName: input.fileName,
          payloadText,
          truncated: truncatedPayload,
          includedRelativePaths: scannedPaths,
        });

  const systemPrompt =
    auditMode === 'mcp_source' ? MCP_SOURCE_AUDIT_SYSTEM_PROMPT : SKILLS_MD_AUDIT_SYSTEM_PROMPT;
  const retrySystemPrompt =
    auditMode === 'mcp_source'
      ? MCP_SOURCE_AUDIT_RETRY_SYSTEM_PROMPT
      : SKILLS_MD_AUDIT_RETRY_SYSTEM_PROMPT;

  let providerId =
    auditMode === 'mcp_source'
      ? (input.provider?.id ??
        process.env.MCP_SOURCE_AUDIT_PROVIDER_ID ??
        process.env.SKILLS_MD_AUDIT_PROVIDER_ID ??
        process.env.DIFY_CONFIG_AUDIT_PROVIDER_ID ??
        'openai:chat:gpt-4o-mini')
      : (input.provider?.id ??
        process.env.SKILLS_MD_AUDIT_PROVIDER_ID ??
        process.env.DIFY_CONFIG_AUDIT_PROVIDER_ID ??
        'openai:chat:gpt-4o-mini');
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
  const normalizedId = normalizeSkillsAuditProviderId(providerId, isOllamaLike, apiBaseUrl);
  if (normalizedId !== providerId) {
    logger.info(`${logPrefix} Normalized provider id`, {
      from: providerId,
      to: normalizedId,
    });
    providerId = normalizedId;
  }
  const apiKey =
    (input.provider?.config?.apiKey as string | undefined) ??
    (isOllamaLike ? getEnvString('OLLAMA_API_KEY', '') : getEnvString('OPENAI_API_KEY', ''));

  logger.info(`${logPrefix} Provider resolution`, {
    receivedProviderId: input.provider?.id ?? '(none)',
    providerId,
    isOllamaLike,
    hasApiKey: !!apiKey,
    auditMode,
  });

  if (!isOptionalApiKeyLocalLlm(apiBaseUrl, providerId) && !apiKey) {
    const envHint =
      auditMode === 'mcp_source'
        ? 'MCP_SOURCE_AUDIT_PROVIDER_ID or SKILLS_MD_AUDIT_PROVIDER_ID'
        : 'SKILLS_MD_AUDIT_PROVIDER_ID';
    const hint = input.provider?.id
      ? ''
      : ` No provider sent from frontend. Select a model in Step 2, or set ${envHint}=ollama:chat:YOUR_MODEL in env.`;
    throw new Error(
      `No API key: provide provider.config.apiKey in the request body or set OPENAI_API_KEY.${hint}`,
    );
  }

  const jsonResponseFormat = openAiJsonObjectResponseFormat(apiBaseUrl ?? '');

  const providerConfig = applyModelAwareNonStreamingDefaults(
    {
      ...(apiKey ? { apiKey } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      temperature: 0,
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

  const buildPromptForPayload = (nextPayloadText: string, nextTruncated: boolean) =>
    buildChatPrompt(
      systemPrompt,
      auditMode === 'mcp_source'
        ? buildMcpSourceAuditUserContent({
            fileName: input.fileName,
            payloadText: nextPayloadText,
            truncated: nextTruncated,
            includedRelativePaths: scannedPaths,
          })
        : buildSkillsMdAuditUserContent({
            fileName: input.fileName,
            payloadText: nextPayloadText,
            truncated: nextTruncated,
            includedRelativePaths: scannedPaths,
          }),
    );

  const prompt = buildChatPrompt(systemPrompt, userContent);
  logger.info(`${logPrefix} Starting LLM audit`, {
    fileNameHash: input.fileName
      ? createHash('sha256').update(input.fileName).digest('hex').slice(0, 16)
      : undefined,
    providerId,
    truncated: truncatedPayload,
    payloadChars: payloadText.length,
    scannedFileCount: scannedPaths.length,
  });

  const retryResult = await callConfigAuditWithContextRetry({
    provider,
    providerId,
    providerConfig,
    prompt,
    buildPrompt: buildPromptForPayload,
    payloadJson: payloadText,
    truncated: truncatedPayload,
    logger,
    logPrefix,
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
    logger.warn(`${logPrefix} First LLM output parse failed`, { error: msg });
    parsedJson = undefined;
  }

  if (typeof parsedJson === 'string') {
    logger.warn(`${logPrefix} Audit payload root is still a string after normalization`, {
      head: parsedJson.slice(0, 280).replace(/\s+/g, ' '),
    });
  }

  let validated = auditResultSchema.safeParse(parsedJson);
  const needsRepair =
    parsedJson === undefined || typeof parsedJson === 'string' || !validated.success;
  let repairParseFailed = false;

  if (needsRepair && proseFromFirst.trim()) {
    logger.info(`${logPrefix} Running one JSON repair LLM call (prose or schema mismatch)`);
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
        retrySystemPrompt,
        buildDifyConfigAuditRetryUserContent(proseFromFirst),
      );
      const retryResp = await repairProvider.callApi(retryPrompt);
      if (retryResp.error) {
        logger.warn(`${logPrefix} Repair LLM call failed`, { error: retryResp.error });
      } else {
        lastModelOutput = retryResp.output;
        try {
          parsedJson = parseModelOutput(retryResp.output);
          if (typeof parsedJson === 'string') {
            logger.warn(`${logPrefix} Repair output still string root`, {
              head: parsedJson.slice(0, 200).replace(/\s+/g, ' '),
            });
          }
          validated = auditResultSchema.safeParse(parsedJson);
        } catch (e) {
          repairParseFailed = true;
          const repairOutputText = coerceChatContentToText(retryResp.output);
          logger.warn(`${logPrefix} Repair LLM output parse failed`, {
            error: e instanceof Error ? e.message : String(e),
            repairOutputHead:
              repairOutputText.slice(0, 400).replace(/\s+/g, ' ').trim() || '(empty)',
          });
          parsedJson = undefined;
          validated = auditResultSchema.safeParse(undefined);
        }
      }
    } else {
      logger.warn(`${logPrefix} Could not load repair provider; skipping repair pass`);
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
        `${logPrefix} Returning synthetic fallback (repair response was not parseable JSON)`,
      );
    } else if (parsedJson === undefined) {
      logger.warn(
        `${logPrefix} Returning synthetic fallback (reviewer output was not parseable JSON)`,
      );
    } else {
      logger.warn(`${logPrefix} Returning synthetic fallback (schema mismatch)`, {
        issues: validated.error.flatten(),
      });
    }
    const syntheticIssueZh = repairParseFailed
      ? '修复模型返回内容无法解析为有效的审计 JSON（未找到符合要求的审计对象）。'
      : typeof parsedJson === 'string'
        ? '解析结果仍为字符串（模型返回了说明性文本而非 JSON）。'
        : parsedJson === undefined
          ? '审查模型输出无法解析为 JSON。'
          : '模型返回内容与预期审计数据结构不匹配。';
    const resourceHint = auditMode === 'mcp_source' ? 'MCP 源码包' : '技能包或 SKILLS 文档';
    const synthetic = syntheticAuditWhenModelUnparseable(
      syntheticIssueZh,
      excerpt,
      effectiveTruncated,
      resourceHint,
    );
    return withFinalize(synthetic, input, effectiveTruncated);
  }

  const base: DifyConfigAuditResult = {
    ...validated.data,
    warnings: validated.data.warnings ?? [],
    truncated: effectiveTruncated,
  };
  return withFinalize(base, input, effectiveTruncated);
}
