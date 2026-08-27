/**
 * Config-only attack task: evaluate uploaded Dify or Coze workflow YAML with detection rules + per-command LLM criteria (no live API calls).
 */

import { and, eq, inArray } from 'drizzle-orm';
import logger from '../../logger';
import { tryParseCozeStructureForRules } from '../cozeConfigStructure';
import { tryParseDifyStructureForRules } from '../difyConfigStructure';
import { tryParseFastGptStructureForRules } from '../fastgptConfigStructure';
import { evaluateDetectionRulesForResponse } from './evaluateDetectionRulesForResponse';
import { resolveLlmProviderPayloadForRuntime } from '../../lib/resolve-llm-provider-runtime';
import {
  isLmStudioCompatibleUrl,
  LM_STUDIO_CONFIG_STATIC_YAML_MAX_CHARS,
} from '../../lib/localLlmUrl';
import {
  runStructuredLlmJudge,
  buildConfigTextJudgePrompt,
  buildCompactConfigTextJudgePrompt,
  formatLlmJudgeLogMessage,
} from './runStructuredLlmJudge';

type AnyLog = Record<string, any>;

function getRequestMatchKey(log: AnyLog): string {
  const promptPreview = String(log.prompt || '').slice(0, 200);
  return [
    String(log.source || ''),
    String(log.url || ''),
    String(log.commandId ?? 'null'),
    String(log.vulnerabilityId ?? 'null'),
    String(log.conversationRound ?? ''),
    String(log.compositeStageId ?? ''),
    promptPreview,
  ].join('|');
}

function buildJudgeFallbackResult(input: { rawOutput: string; failureMessage?: string }) {
  const message = input.failureMessage?.trim();
  if (message) {
    return { vulnerable: false, reason: message };
  }
  const raw = (input.rawOutput || '').trim();
  if (!raw) {
    return { vulnerable: false, reason: 'Judge returned empty output' };
  }
  return { vulnerable: false, reason: `Judge parse failed: ${raw.slice(0, 220)}` };
}

const DEFAULT_YAML_MAX_LLM_CHARS = 120_000;
const DEFAULT_YAML_PREVIEW_LOG_CHARS = 400_000;

function yamlMaxForLlm(): number {
  const n = Number.parseInt(process.env.ATTACK_TASK_CONFIG_STATIC_YAML_MAX_CHARS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_YAML_MAX_LLM_CHARS;
}

function yamlMaxForLocalLlmJudge(apiBaseUrl?: string): number {
  const envMax = yamlMaxForLlm();
  if (!apiBaseUrl || !isLmStudioCompatibleUrl(apiBaseUrl)) {
    return envMax;
  }
  const n = Number.parseInt(
    process.env.ATTACK_TASK_CONFIG_STATIC_LMSTUDIO_YAML_MAX_CHARS || '',
    10,
  );
  const cap = Number.isFinite(n) && n > 0 ? n : LM_STUDIO_CONFIG_STATIC_YAML_MAX_CHARS;
  return Math.min(envMax, cap);
}

function pickConfigExcerptForLlmJudge(input: {
  yaml: string;
  structureText: string;
  maxChars: number;
  preferStructure: boolean;
}): string {
  const source =
    input.preferStructure && input.structureText.trim() ? input.structureText : input.yaml;
  if (source.length <= input.maxChars) {
    return source;
  }
  return `${source.slice(0, input.maxChars)}\n\n...[truncated for LLM context]`;
}

function yamlPreviewForLog(): number {
  const n = Number.parseInt(process.env.ATTACK_TASK_CONFIG_STATIC_LOG_PREVIEW_CHARS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_YAML_PREVIEW_LOG_CHARS;
}

export async function runStaticConfigYamlScanForTask(params: {
  db: any;
  now: Date;
  organizationId?: string | null;
  yamlText: string;
  vulnerabilityIds: string[];
  detectionConfig: {
    useRule?: boolean;
    useLLM?: boolean;
    llmConfig?: { model?: string };
  };
  attackCommandsTable: any;
  /** When `'coze'` / `'fastgpt'`, structure parsing and run-log source use that platform’s export semantics. */
  platformFamily?: string | null;
  pushLog: (entry: Record<string, unknown>) => void;
  reportRunProgress?: (completed: number, total: number) => void | Promise<void>;
}): Promise<{
  structureSummary?: {
    parseFailed: boolean;
    structureSchemaVersion?: number;
    nodesTruncated?: boolean;
    nodeCount?: number;
    structureSearchBlobTruncated?: boolean;
    nodesPreview: Array<{
      id: string;
      dataType: string;
      title?: string;
      logicalPointer?: string;
      detailsKind?: string;
    }>;
  };
}> {
  const {
    db,
    now,
    organizationId,
    yamlText,
    vulnerabilityIds,
    detectionConfig,
    attackCommandsTable,
    platformFamily,
    pushLog,
    reportRunProgress,
  } = params;

  const pf = String(platformFamily ?? '').toLowerCase();
  const isCoze = pf === 'coze';
  const isFastgpt = pf === 'fastgpt';
  const staticRoundSource = isCoze ? 'coze' : isFastgpt ? 'fastgpt' : 'dify';
  const structureLogSource = isCoze ? 'coze' : isFastgpt ? 'fastgpt-structure' : 'config-structure';

  const yaml = String(yamlText || '').trim();
  if (!yaml) {
    pushLog({
      id: `run-${now.getTime()}-config-static-no-yaml`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message: isFastgpt
        ? 'Config-static task: no JSON in metadata.configAudit; skipped scan'
        : 'Config-static task: no YAML in metadata.configAudit; skipped scan',
    });
    return {};
  }

  const shouldUseRule = detectionConfig?.useRule === true;
  const shouldUseLLM = detectionConfig?.useLLM === true;
  const preferredModel = detectionConfig?.llmConfig?.model;

  if (vulnerabilityIds.length === 0) {
    pushLog({
      id: `run-${now.getTime()}-config-static-no-vulns`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message:
        'Config-static task: no vulnerabilities selected; scan finished immediately (select vulnerabilities in Step 3)',
    });
    return {};
  }

  if (!shouldUseRule && !shouldUseLLM) {
    pushLog({
      id: `run-${now.getTime()}-config-static-no-detection`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message:
        'Config-static task: both rule and LLM detection are off; enable at least one in Detection step (纯配置任务默认只开 Rule，需在 Step 5 勾选 LLM Base 才会调用 LM Studio)',
    });
    return {};
  }

  if (shouldUseLLM && !preferredModel) {
    pushLog({
      id: `run-${now.getTime()}-config-static-llm-no-model`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message:
        'LLM detection is on but detectionConfig.llmConfig.model is empty — select a model in Detection step',
    });
  }

  let commands: any[] = [];
  try {
    if (attackCommandsTable && vulnerabilityIds.length > 0) {
      commands = await db
        .select()
        .from(attackCommandsTable)
        .where(
          and(
            inArray(attackCommandsTable.vulnerabilityId, vulnerabilityIds),
            eq(attackCommandsTable.enabled, true),
          ),
        );
    }
  } catch (e: any) {
    logger.error('[config_static] load attack commands failed', { message: e?.message });
    pushLog({
      id: `run-${now.getTime()}-config-static-cmd-error`,
      timestamp: new Date().toISOString(),
      level: 'error',
      source: 'attack-command',
      message: `Failed to load attack commands: ${e?.message || String(e)}`,
    });
    return {};
  }

  /** Ordered work items: one row per attack_result / combined verdict. */
  type Work = { vulnerabilityId: string; command: any | null };
  const work: Work[] = [];
  for (const vid of vulnerabilityIds) {
    const forV = commands.filter((c) => String(c.vulnerabilityId) === String(vid));
    forV.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    if (forV.length === 0) {
      work.push({ vulnerabilityId: vid, command: null });
    } else {
      for (const c of forV) {
        work.push({ vulnerabilityId: vid, command: c });
      }
    }
  }

  const commandsWithLlm = work.filter((w) => w.command != null).length;
  const vulnsWithoutCommands = new Set(
    work.filter((w) => w.command == null).map((w) => w.vulnerabilityId),
  ).size;

  let llmIntegrationHint = 'llmIntegration=(not probed)';
  let useCompactLlmPrompt = false;
  let yamlMaxForJudge = yamlMaxForLlm();
  if (shouldUseLLM) {
    try {
      const payload = await resolveLlmProviderPayloadForRuntime({
        preferredModelId: preferredModel,
        organizationId,
      });
      if (payload) {
        const base =
          typeof payload.config.apiBaseUrl === 'string' ? payload.config.apiBaseUrl : '(default)';
        llmIntegrationHint = `llmProvider=${payload.id}, base=${base}, matchedSelection=${payload.matchedSelection}`;
        if (base !== '(default)' && isLmStudioCompatibleUrl(base)) {
          useCompactLlmPrompt = true;
          yamlMaxForJudge = yamlMaxForLocalLlmJudge(base);
        }
      } else if (preferredModel) {
        llmIntegrationHint = `llmModel=NONE — task model "${String(preferredModel).slice(0, 80)}" did not match any enabled Chat model (check Settings → Models)`;
      } else {
        llmIntegrationHint = 'llmModel=NONE — enable a Chat model in Settings → Models';
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      llmIntegrationHint = `llmModelProbeError=${msg.slice(0, 120)}`;
    }
  } else {
    llmIntegrationHint =
      'llmModel=skipped (useLLM=false — only rule detection runs; LM Studio is not called)';
  }

  if (shouldUseLLM && commandsWithLlm === 0) {
    pushLog({
      id: `run-${now.getTime()}-config-static-llm-unavailable`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'system',
      message:
        'LLM detection is on but no enabled attack commands matched selected vulnerabilities — LLM judge will be skipped for all items (add commands in vulnerability library)',
    });
  }

  const total = Math.max(1, work.length);
  let completed = 0;
  let logSeq = 0;
  let llmCallsAttempted = 0;
  let llmCallsSucceeded = 0;
  const nextLogId = (suffix: string) => `run-${now.getTime()}-${++logSeq}-${suffix}`;
  await reportRunProgress?.(0, total);

  const structureParsed = isCoze
    ? tryParseCozeStructureForRules(yaml)
    : isFastgpt
      ? tryParseFastGptStructureForRules(yaml)
      : tryParseDifyStructureForRules(yaml);
  const structureText = structureParsed?.inventory.structureSearchBlob?.trim() || '';
  if (structureParsed) {
    pushLog({
      id: nextLogId('config-structure'),
      timestamp: new Date().toISOString(),
      level: 'info',
      source: structureLogSource,
      message: isCoze
        ? 'Parsed Coze workflow export structure for rule evaluation'
        : isFastgpt
          ? 'Parsed FastGPT workflow export structure for rule evaluation'
          : 'Parsed Dify export structure for rule evaluation',
      structureSchemaVersion: structureParsed.inventory.structureSchemaVersion,
      nodesTruncated: structureParsed.truncated,
      nodeCount: structureParsed.inventory.nodes.length,
      structureSearchBlobTruncated: structureParsed.inventory.structureSearchBlobTruncated,
    });
  } else {
    pushLog({
      id: nextLogId('config-structure-warn'),
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: structureLogSource,
      message: isCoze
        ? 'Could not parse YAML as Coze workflow export; config_structure / structure_json rules are skipped (config_yaml rules still run)'
        : isFastgpt
          ? 'Could not parse text as FastGPT workflow export; config_structure / structure_json rules are skipped (config_yaml rules still run)'
          : 'Could not parse YAML as Dify app export; config_structure / structure_json rules are skipped (config_yaml rules still run)',
    });
  }

  const structureSummary = {
    parseFailed: !structureParsed,
    structureSchemaVersion: structureParsed?.inventory.structureSchemaVersion,
    nodesTruncated: structureParsed?.truncated,
    nodeCount: structureParsed?.inventory.nodes.length,
    structureSearchBlobTruncated: structureParsed?.inventory.structureSearchBlobTruncated,
    nodesPreview: structureParsed
      ? structureParsed.inventory.nodes.slice(0, 30).map((n) => {
          const d = n.details as { kind?: string } | undefined;
          return {
            id: n.id,
            dataType: n.dataType,
            title: n.title,
            logicalPointer: n.logicalPointer,
            detailsKind: typeof d?.kind === 'string' ? d.kind : undefined,
          };
        })
      : [],
  };

  const configTextForLlm = pickConfigExcerptForLlmJudge({
    yaml,
    structureText,
    maxChars: yamlMaxForJudge,
    preferStructure: useCompactLlmPrompt,
  });

  pushLog({
    id: `run-${now.getTime()}-config-static-plan`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'system',
    message: [
      'Config-static scan plan',
      `yamlChars=${yaml.length}`,
      `useRule=${shouldUseRule}`,
      `useLLM=${shouldUseLLM}`,
      `vulnerabilities=${vulnerabilityIds.length}`,
      `workItems=${work.length}`,
      `enabledAttackCommands=${commands.length}`,
      `llmEligibleItems=${commandsWithLlm}`,
      `vulnsMissingCommands=${vulnsWithoutCommands}`,
      preferredModel ? `model=${preferredModel}` : 'model=(default integration)',
      llmIntegrationHint,
      useCompactLlmPrompt
        ? `llmPrompt=compact, yamlMaxChars=${yamlMaxForJudge}, configExcerptChars=${configTextForLlm.length}`
        : `llmPrompt=full, yamlMaxChars=${yamlMaxForJudge}`,
    ].join(' | '),
  });

  const previewCap = yamlPreviewForLog();
  const responsePreview =
    yaml.length > previewCap ? `${yaml.slice(0, previewCap)}\n\n...[truncated for log]` : yaml;

  const appendJudgeLog = (log: AnyLog) => {
    pushLog(log);
  };

  for (const item of work) {
    const vulnId = item.vulnerabilityId;
    const cmd = item.command;
    const commandId = cmd?.id ?? null;
    const promptText = cmd
      ? String(cmd.content || cmd.name || '').slice(0, 500)
      : '(config-static: no enabled attack command for this vulnerability; rule-only)';

    const targetLog: AnyLog = {
      id: nextLogId(`static-yaml-${commandId ?? 'norule'}-${vulnId}`),
      timestamp: new Date().toISOString(),
      level: 'info',
      source: staticRoundSource,
      url: isFastgpt ? 'static://config-json' : 'static://config-yaml',
      vulnerabilityId: vulnId,
      commandId,
      prompt: promptText,
      responsePreview,
    };
    pushLog(targetLog);

    const matchKey = getRequestMatchKey(targetLog);

    let ruleMatched = false;
    const ruleHits: any[] = [];
    if (shouldUseRule) {
      try {
        const ruleEval = await evaluateDetectionRulesForResponse(db, vulnId, yaml, {
          structureText: structureText || undefined,
        });
        ruleMatched = ruleEval.matched;
        ruleHits.push(...ruleEval.hits);
      } catch (e: any) {
        logger.error('[config_static] rule eval error', { message: e?.message });
      }
      appendJudgeLog({
        id: nextLogId('rule-judge-config-static'),
        timestamp: new Date().toISOString(),
        level: 'info',
        source: 'rule-judge',
        judgePipeline: 'config_static',
        matched: ruleMatched,
        hits: ruleHits,
        relatedMatchKey: matchKey,
        relatedCommandId: commandId,
        relatedVulnerabilityId: vulnId,
      });
    }

    let llmParsed: { vulnerable: boolean; reason: string } | null = null;
    if (shouldUseLLM && cmd) {
      llmCallsAttempted++;
      const judgeStartedAt = Date.now();
      try {
        const judgePrompt = useCompactLlmPrompt
          ? buildCompactConfigTextJudgePrompt({
              commandName: String(cmd.name || ''),
              commandContent: String(cmd.content || ''),
              expectedSuccess: String(cmd.expectedSuccess ?? '').trim(),
              nonVulnerability: String(cmd.nonVulnerability ?? '').trim(),
              configExcerpt: configTextForLlm,
              platform: isCoze ? 'coze' : isFastgpt ? 'fastgpt' : 'dify',
            })
          : buildConfigTextJudgePrompt({
              commandName: String(cmd.name || ''),
              commandContent: String(cmd.content || ''),
              expectedSuccess: String(cmd.expectedSuccess ?? '').trim(),
              nonVulnerability: String(cmd.nonVulnerability ?? '').trim(),
              configExcerpt: configTextForLlm,
              platform: isCoze ? 'coze' : isFastgpt ? 'fastgpt' : 'dify',
            });
        const { rawOutput, parsed, failure, meta } = await runStructuredLlmJudge({
          judgePrompt,
          preferredModelId: preferredModel,
          organizationId,
        });
        llmParsed = parsed;
        if (parsed && !failure) {
          llmCallsSucceeded++;
        }
        const judgeDurationMs = Date.now() - judgeStartedAt;
        appendJudgeLog({
          id: nextLogId('llm-judge-config-static'),
          timestamp: new Date().toISOString(),
          level: failure ? 'warn' : 'info',
          source: 'llm-judge',
          judgePipeline: 'config_static',
          durationMs: judgeDurationMs,
          message: `${formatLlmJudgeLogMessage({ meta, rawOutput, parsed, failure })} | durationMs=${judgeDurationMs}`,
          rawOutput: rawOutput.slice(0, 500),
          result:
            parsed ||
            buildJudgeFallbackResult({
              rawOutput,
              failureMessage: failure?.message,
            }),
          relatedMatchKey: matchKey,
          relatedUrl: targetLog.url,
          relatedCommandId: commandId,
          relatedVulnerabilityId: vulnId,
        });
      } catch (e: any) {
        logger.error('[config_static] LLM judge error', { message: e?.message });
        appendJudgeLog({
          id: nextLogId('llm-judge-config-static-error'),
          timestamp: new Date().toISOString(),
          level: 'error',
          source: 'llm-judge',
          judgePipeline: 'config_static',
          message: e?.message || String(e),
          relatedMatchKey: matchKey,
        });
      }
    } else if (shouldUseLLM && !cmd) {
      appendJudgeLog({
        id: nextLogId('llm-judge-config-static-skipped'),
        timestamp: new Date().toISOString(),
        level: 'warn',
        source: 'llm-judge',
        judgePipeline: 'config_static',
        message:
          'LLM judge skipped: no enabled attack command for this vulnerability (add commands in vulnerability library)',
        relatedMatchKey: matchKey,
        relatedCommandId: commandId,
        relatedVulnerabilityId: vulnId,
      });
    }

    const llmVuln = shouldUseLLM && cmd && llmParsed?.vulnerable === true;
    const rulePart = shouldUseRule ? ruleMatched : false;
    const llmPart = Boolean(llmVuln);
    const combinedVuln = Boolean(rulePart || llmPart);
    appendJudgeLog({
      id: nextLogId('config-static-combined'),
      timestamp: new Date().toISOString(),
      level: 'info',
      source: 'combined-judge',
      judgePipeline: 'config_static',
      relatedMatchKey: matchKey,
      ruleMatched,
      llmVulnerable: llmVuln,
      combinedVulnerable: combinedVuln,
    });

    completed++;
    await reportRunProgress?.(completed, total);
  }

  if (shouldUseLLM) {
    pushLog({
      id: nextLogId('config-static-llm-summary'),
      timestamp: new Date().toISOString(),
      level: llmCallsAttempted === 0 ? 'warn' : 'info',
      source: 'system',
      message: `Config-static LLM summary: attempted=${llmCallsAttempted}, parsedOk=${llmCallsSucceeded}, skippedNoCommand=${work.length - commandsWithLlm}`,
    });
  }

  return { structureSummary };
}
