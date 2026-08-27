/**
 * LLM post-review for standard scan: dismiss false positives, adjust severity, merge duplicates.
 */

import { z } from 'zod';

import { getEnvString } from '../../../backend/src/envars';
import type { ProcessingStatus } from '../../shared/finding-disposition';
import {
  isOptionalApiKeyLocalLlm,
  openAiJsonObjectResponseFormat,
} from '../../../backend/src/lib/localLlmUrl';
import { applyModelAwareNonStreamingDefaults } from '../../../backend/src/lib/llm-integration-resolve';
import logger from '../../../backend/src/logger';
import { loadApiProviders } from '../../../backend/src/providers/index';
import {
  buildChatPrompt,
  parseModelOutput,
} from '../../../backend/src/services/difyConfigAuditService';
import { enrichFinding } from './finding-meta';
import {
  buildLlmFindingTriageUserContent,
  buildLlmFindingTriageRetryUserContent,
  LLM_FINDING_TRIAGE_RETRY_SYSTEM_PROMPT,
  LLM_FINDING_TRIAGE_SYSTEM_PROMPT,
} from './llm-finding-triage-prompts';
import {
  buildTriageAuditPackage,
  inferPathRoleFromPath,
  loadTriageSharedContext,
  parseFindingLocation,
} from './triage-audit-package';
import type {
  EngineRunStatus,
  ScanArtifactKind,
  ScanSeverity,
  TriagePathRole,
  UnifiedFinding,
} from './types';

const SEV_RANK: Record<ScanSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const MAX_FINDINGS_PER_CALL = 48;
const TRIAGE_BATCH_SIZE = 12;
const TRIAGE_LLM_TIMEOUT_MS = 120_000;

const processingStatusSchema = z.enum([
  'confirmed',
  'suspected',
  'hint',
  'reference_sample',
  'false_positive',
]);

const pathRoleSchema = z.enum([
  'skill_body',
  'executable_code',
  'install_chain',
  'documentation',
  'reference_sample',
  'scanner_or_test',
  'dev_environment',
  'data_or_knowledge',
  'unknown',
]);

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

const triageSchema = z.object({
  summary: z.string().optional(),
  decisions: z.array(
    z.object({
      findingId: z.string(),
      action: z.enum(['keep', 'dismiss']),
      status: processingStatusSchema.optional(),
      severity: severitySchema.nullable().optional(),
      pathRole: pathRoleSchema.optional(),
      reason: z.string().optional(),
    }),
  ),
  mergeGroups: z
    .array(
      z.object({
        groupTitle: z.string(),
        findingIds: z.array(z.string()).min(1),
        reason: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type LlmTriageResult = z.infer<typeof triageSchema>;

export type TriageInput = {
  artifactKind: ScanArtifactKind;
  workDir: string;
  filePaths: string[];
  findings: UnifiedFinding[];
  provider?: { id: string; config?: Record<string, unknown> };
};

export type TriageOutput = {
  findings: UnifiedFinding[];
  status: EngineRunStatus;
  summary?: string;
  warnings: string[];
};

type IndexedFinding = UnifiedFinding & { triageId: string };

function isProtectedFinding(f: UnifiedFinding): boolean {
  const cat = (f.category || '').toUpperCase();
  // Archive threats must not be dismissed. Engine integrity is a hint, not a formal risk.
  return cat === 'ARCHIVE_SECURITY';
}

function assignTriageIds(findings: UnifiedFinding[]): IndexedFinding[] {
  return findings.map((f, i) => ({ ...f, triageId: `f-${i}` }));
}

function codePathRole(f: IndexedFinding): TriagePathRole {
  const { filePath } = parseFindingLocation(f.location, f.sourceFile);
  return inferPathRoleFromPath(filePath);
}

function resolveTriageDecision(
  f: IndexedFinding,
  decision: LlmTriageResult['decisions'][number],
): {
  keep: boolean;
  severity: ScanSeverity;
  processingStatus?: ProcessingStatus;
  pathRole?: TriagePathRole;
  llmAdjusted: boolean;
  triageNote?: string;
} {
  const reason = decision.reason?.trim() || undefined;
  const fallbackPathRole = codePathRole(f);
  if (decision.action === 'dismiss') {
    if (isProtectedFinding(f)) {
      return {
        keep: true,
        severity: f.severity,
        processingStatus: 'suspected',
        pathRole: decision.pathRole ?? fallbackPathRole,
        llmAdjusted: true,
        triageNote: reason ?? 'Protected finding — dismiss ignored',
      };
    }
    return {
      keep: false,
      severity: 'low',
      processingStatus: decision.status ?? 'false_positive',
      pathRole: decision.pathRole ?? fallbackPathRole,
      llmAdjusted: true,
      triageNote: reason,
    };
  }

  const severity =
    decision.severity === null || decision.severity === undefined ? f.severity : decision.severity;

  return {
    keep: true,
    severity,
    processingStatus: decision.status,
    pathRole: decision.pathRole ?? fallbackPathRole,
    llmAdjusted:
      decision.severity != null && decision.severity !== f.severity
        ? true
        : decision.status != null || decision.pathRole != null,
    triageNote: reason,
  };
}

function looksLikeFullProviderPath(id: string): boolean {
  const parts = id.split(':');
  if (parts.length < 3) {
    return false;
  }
  const kind = parts[1]?.toLowerCase();
  return ['chat', 'completion', 'embedding', 'embeddings', 'assistant'].includes(kind);
}

function normalizeProviderId(id: string, isOllamaLike: boolean, apiBaseUrl: string): string {
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

async function callTriageLlm(
  userContent: string,
  provider?: TriageInput['provider'],
): Promise<LlmTriageResult> {
  let providerId =
    provider?.id ??
    process.env.CAPABILITY_SCAN_TRIAGE_PROVIDER_ID ??
    process.env.SKILLS_MD_AUDIT_PROVIDER_ID ??
    process.env.DIFY_CONFIG_AUDIT_PROVIDER_ID ??
    'openai:chat:gpt-4o-mini';

  const isOllamaProvider = providerId.toLowerCase().startsWith('ollama:');
  const apiBaseUrl =
    (provider?.config?.apiBaseUrl as string | undefined) ??
    (isOllamaProvider
      ? getEnvString('OLLAMA_BASE_URL', '')
      : getEnvString('OPENAI_API_BASE_URL', ''));
  const isOllamaLike =
    isOllamaProvider ||
    (!!apiBaseUrl && (apiBaseUrl.includes('11434') || apiBaseUrl.toLowerCase().includes('ollama')));
  const normalizedId = normalizeProviderId(providerId, isOllamaLike, apiBaseUrl);
  providerId = normalizedId;

  const apiKey =
    (provider?.config?.apiKey as string | undefined) ??
    (isOllamaLike ? getEnvString('OLLAMA_API_KEY', '') : getEnvString('OPENAI_API_KEY', ''));

  const apiKeyEnvar =
    (typeof provider?.config?.apiKeyEnvar === 'string' && provider.config.apiKeyEnvar.trim()) ||
    (typeof provider?.config?.apiKeyEnvVar === 'string' && provider.config.apiKeyEnvVar.trim()) ||
    '';
  const apiKeyFromEnvar = apiKeyEnvar ? getEnvString(apiKeyEnvar, '') : '';
  const effectiveApiKey = apiKey || apiKeyFromEnvar;

  if (!isOptionalApiKeyLocalLlm(apiBaseUrl, providerId) && !effectiveApiKey) {
    throw new Error('No LLM API key configured for finding triage');
  }

  const jsonResponseFormat = openAiJsonObjectResponseFormat(apiBaseUrl ?? '');
  const providerConfig = applyModelAwareNonStreamingDefaults(
    {
      ...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      temperature: 0,
      max_tokens: 8192,
      ...(jsonResponseFormat ? { response_format: jsonResponseFormat } : {}),
    },
    providerId,
  );

  const [loaded] = await loadApiProviders([{ id: providerId, config: providerConfig }]);
  if (!loaded?.callApi) {
    throw new Error('Failed to load LLM provider for triage');
  }

  const prompt = buildChatPrompt(LLM_FINDING_TRIAGE_SYSTEM_PROMPT, userContent);
  const response = await withTimeout(loaded.callApi(prompt), TRIAGE_LLM_TIMEOUT_MS, 'LLM triage');
  if (response.error) {
    throw new Error(response.error);
  }

  let parsed: unknown;
  try {
    parsed = parseModelOutput(response.output);
  } catch {
    parsed = undefined;
  }

  let validated = triageSchema.safeParse(parsed);
  if (!validated.success) {
    const prose =
      typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
    const repairProviderConfig: Record<string, unknown> = {
      ...providerConfig,
      temperature: 0,
      max_tokens: 8192,
      ...(jsonResponseFormat ? { response_format: jsonResponseFormat } : {}),
    };
    const [repairLoaded] = await loadApiProviders([
      { id: providerId, config: repairProviderConfig },
    ]);
    const repairProvider = repairLoaded;
    if (!repairProvider?.callApi) {
      throw new Error('Failed to load repair provider for triage');
    }
    const repairPrompt = buildChatPrompt(
      LLM_FINDING_TRIAGE_RETRY_SYSTEM_PROMPT,
      buildLlmFindingTriageRetryUserContent(prose),
    );
    const repair = await withTimeout(
      repairProvider.callApi(repairPrompt),
      TRIAGE_LLM_TIMEOUT_MS,
      'LLM triage repair',
    );
    if (repair.error) {
      throw new Error(repair.error);
    }
    parsed = parseModelOutput(repair.output);
    validated = triageSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error('LLM triage output failed schema validation');
    }
  }

  return validated.data;
}

export function applyTriageResult(
  indexed: IndexedFinding[],
  triage: LlmTriageResult,
): UnifiedFinding[] {
  const byId = new Map(indexed.map((f) => [f.triageId, f]));
  const decisionMap = new Map(triage.decisions.map((d) => [d.findingId, d]));
  const mergedAway = new Set<string>();

  for (const f of indexed) {
    if (!decisionMap.has(f.triageId)) {
      decisionMap.set(f.triageId, {
        findingId: f.triageId,
        action: 'keep',
      });
    }
  }

  let kept: IndexedFinding[] = [];
  for (const f of indexed) {
    const decision = decisionMap.get(f.triageId)!;
    const resolved = resolveTriageDecision(f, decision);
    if (!resolved.keep) {
      continue;
    }
    kept.push({
      ...f,
      severity: resolved.severity,
      ...(resolved.processingStatus ? { processingStatus: resolved.processingStatus } : {}),
      pathRole: resolved.pathRole,
      llmAdjusted: resolved.llmAdjusted,
      triageNote: resolved.triageNote,
      sourceEngines: [...new Set([...f.sourceEngines, 'llm_triage'])],
      confidence: resolved.triageNote ? 'medium' : f.confidence,
    });
  }

  for (const group of triage.mergeGroups ?? []) {
    const members = group.findingIds
      .map((id) => kept.find((f) => f.triageId === id && !mergedAway.has(id)))
      .filter((f): f is IndexedFinding => Boolean(f));
    if (members.length < 2) {
      continue;
    }
    for (const m of members) {
      mergedAway.add(m.triageId);
    }

    let topSeverity: ScanSeverity = 'low';
    const engines = new Set<string>();
    const rules = new Set<string>();
    const locations: string[] = [];
    for (const m of members) {
      if (SEV_RANK[m.severity] > SEV_RANK[topSeverity]) {
        topSeverity = m.severity;
      }
      for (const e of m.sourceEngines) {
        engines.add(e);
      }
      for (const r of m.ruleIds ?? []) {
        rules.add(r);
      }
      locations.push(m.location);
    }

    const primary = members[0];
    kept.push({
      ...primary,
      triageId: `merged-${group.groupTitle.slice(0, 20)}`,
      issue: group.groupTitle.trim() || primary.issue,
      severity: topSeverity,
      evidence: members
        .map((m) => `${m.location}: ${m.evidence.slice(0, 120)}`)
        .join('\n')
        .slice(0, 800),
      recommendation: group.reason?.trim() || primary.recommendation,
      sourceEngines: [...engines],
      ruleIds: rules.size > 0 ? [...rules] : primary.ruleIds,
      llmAdjusted: true,
      triageNote: group.reason?.trim() || `Merged ${members.length} related hits`,
      location: locations[0] ?? primary.location,
      processingStatus: members.some((m) => m.processingStatus === 'confirmed')
        ? 'confirmed'
        : members.some((m) => m.processingStatus === 'suspected')
          ? 'suspected'
          : members.some((m) => m.processingStatus === 'hint')
            ? 'hint'
            : members.some((m) => m.processingStatus === 'reference_sample')
              ? 'reference_sample'
              : undefined,
    });
  }

  kept = kept.filter((f) => !mergedAway.has(f.triageId));

  return kept
    .map(({ triageId: _triageId, ...rest }) => enrichFinding(rest))
    .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

export async function triageFindingsWithLlm(input: TriageInput): Promise<TriageOutput> {
  const start = Date.now();
  const warnings: string[] = [];
  const contentFindings = input.findings.filter((f) => !isProtectedFinding(f));
  const protectedFindings = input.findings.filter(isProtectedFinding);

  if (contentFindings.length === 0) {
    return {
      findings: input.findings.map(enrichFinding),
      status: {
        engine: 'llm_triage',
        status: 'skipped',
        findingCount: 0,
        message: 'No findings to triage',
        durationMs: Date.now() - start,
      },
      warnings,
    };
  }

  if (!input.provider?.id) {
    const hasEnv =
      process.env.CAPABILITY_SCAN_TRIAGE_PROVIDER_ID ||
      process.env.SKILLS_MD_AUDIT_PROVIDER_ID ||
      process.env.OPENAI_API_KEY ||
      process.env.OLLAMA_BASE_URL;
    if (!hasEnv) {
      return {
        findings: input.findings.map(enrichFinding),
        status: {
          engine: 'llm_triage',
          status: 'skipped',
          findingCount: 0,
          message: 'No LLM model selected — static engine results kept unchanged',
          durationMs: Date.now() - start,
        },
        warnings: ['llm_triage: skipped (no model)'],
      };
    }
  }

  try {
    const indexed = assignTriageIds(contentFindings);
    const capped = indexed.slice(0, MAX_FINDINGS_PER_CALL);
    if (indexed.length > MAX_FINDINGS_PER_CALL) {
      warnings.push(`llm_triage: only first ${MAX_FINDINGS_PER_CALL} findings reviewed`);
    }

    logger.info('[capability-scan] LLM finding triage', {
      findingCount: capped.length,
      artifactKind: input.artifactKind,
      batchSize: TRIAGE_BATCH_SIZE,
    });

    const sharedContext = await loadTriageSharedContext(input.workDir, input.filePaths);
    const triagedChunks: UnifiedFinding[] = [];
    let triageSummary: string | undefined;
    let anyBatchOk = false;

    for (let offset = 0; offset < capped.length; offset += TRIAGE_BATCH_SIZE) {
      const slice = capped.slice(offset, offset + TRIAGE_BATCH_SIZE);
      const sliceWithIds = slice.map((f, i) => ({ ...f, triageId: `f-${i}` }));
      const batchNo = Math.floor(offset / TRIAGE_BATCH_SIZE) + 1;
      try {
        const auditPackage = await buildTriageAuditPackage(
          input.workDir,
          input.filePaths,
          input.artifactKind,
          sliceWithIds,
          sharedContext,
        );
        logger.info('[capability-scan] LLM finding triage audit package', {
          contextChars: JSON.stringify(auditPackage).length,
          findingCount: auditPackage.findings.length,
          reviewMode: auditPackage.reviewMode,
          fileCount: input.filePaths.length,
          batch: batchNo,
        });
        const userContent = buildLlmFindingTriageUserContent(auditPackage);
        const triage = await callTriageLlm(userContent, input.provider);
        triagedChunks.push(...applyTriageResult(sliceWithIds, triage));
        if (triage.summary?.trim()) {
          triageSummary = triage.summary.trim();
        }
        anyBatchOk = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`llm_triage batch ${batchNo}: ${msg}`);
        triagedChunks.push(
          ...sliceWithIds.map(({ triageId: _id, ...f }) =>
            enrichFinding({
              ...f,
              triageNote: `LLM triage batch failed; local disposition applied: ${msg}`,
            }),
          ),
        );
      }
    }

    const untouched = indexed
      .slice(MAX_FINDINGS_PER_CALL)
      .map(({ triageId: _id, ...f }) => enrichFinding(f));
    const findings = [...protectedFindings.map(enrichFinding), ...triagedChunks, ...untouched].sort(
      (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity],
    );

    return {
      findings,
      summary: triageSummary,
      status: {
        engine: 'llm_triage',
        status: anyBatchOk ? 'success' : 'failed',
        findingCount: findings.length,
        message: triageSummary ?? (anyBatchOk ? 'LLM triage completed' : 'LLM triage failed'),
        durationMs: Date.now() - start,
      },
      warnings,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('[capability-scan] LLM triage failed', { error: msg });
    return {
      findings: input.findings.map(enrichFinding),
      status: {
        engine: 'llm_triage',
        status: 'failed',
        findingCount: input.findings.length,
        message: msg,
        durationMs: Date.now() - start,
      },
      warnings: [`llm_triage failed: ${msg}`],
    };
  }
}
