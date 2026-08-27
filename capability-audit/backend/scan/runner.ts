/**
 * Scan orchestrator.
 */

import { randomUUID } from 'node:crypto';

import '../../tools/load-tools-env';
import { ensureBundledTools } from '../../tools/ensure-bundled-tools';
import { builtinRulesEngine } from './engines/builtin-rules';
import { ciscoSkillScannerEngine } from './engines/cisco-skill-scanner';
import { llmEngine } from './engines/llm';
import { skillspectorEngine } from './engines/skillspector';
import { snykAgentScanEngine } from './engines/snyk-agent-scan';
import {
  applyFindingDisposition,
  buildDispositionSummary,
  overallRiskFromFormalFindings,
} from './apply-disposition';
import { triageFindingsWithLlm } from './llm-finding-triage';
import { buildRiskSummary, overallSuggestedAction } from './finding-meta';
import {
  buildSummary,
  buildIntegrityFindings,
  defaultRecommendations,
  mergeFindings,
  resolveScanStatus,
} from './merge';
import { buildSkillPreview } from './skill-preview';
import { enginesForStrategy, pickAdapters } from './strategies';
import type {
  CapabilityScanResult,
  EngineAdapter,
  EngineRunStatus,
  ScanArtifactKind,
  ScanStrategy,
  UnifiedFinding,
} from './types';
import { cleanupWorkDir, extractArchiveToWorkDir, writeMarkdownWorkDir } from './workdir';
import { resolveCapabilityScanProvider } from './resolve-scan-provider';

const ENGINE_REGISTRY = new Map<string, EngineAdapter>([
  ['builtin_rules', builtinRulesEngine],
  ['skillspector', skillspectorEngine],
  ['cisco_skill_scanner', ciscoSkillScannerEngine],
  ['snyk_agent_scan', snykAgentScanEngine],
  ['llm', llmEngine],
]);

export function registerScanEngine(adapter: EngineAdapter): void {
  ENGINE_REGISTRY.set(adapter.name, adapter);
}

export type RunCapabilityScanInput = {
  taskId?: string;
  strategy: ScanStrategy;
  artifactKind: ScanArtifactKind;
  zipBuffer?: Buffer;
  markdown?: string;
  fileName?: string;
  provider?: { id: string; config?: Record<string, unknown> };
  engines?: string[];
  /** Auth org — used to load managed-model API keys for LLM triage / llm engine */
  organizationId?: string | null;
};

export async function runCapabilityScan(
  input: RunCapabilityScanInput,
): Promise<CapabilityScanResult> {
  const taskId = input.taskId ?? randomUUID();
  const warnings: string[] = [];
  let workDir = '';
  let filePaths: string[] = [];
  let assetManifest: CapabilityScanResult['assetManifest'];
  let hasArchiveThreat = false;
  const archiveSecurityFindings: UnifiedFinding[] = [];

  try {
    if (input.zipBuffer) {
      const extracted = await extractArchiveToWorkDir(input.zipBuffer, input.fileName);
      workDir = extracted.workDir;
      filePaths = extracted.filePaths;
      assetManifest = extracted.assetManifest;
      warnings.push(...extracted.warnings);
      archiveSecurityFindings.push(...extracted.securityFindings);
      hasArchiveThreat = extracted.securityFindings.length > 0;
    } else if (input.markdown?.trim()) {
      const extracted = await writeMarkdownWorkDir(input.markdown, input.fileName ?? 'SKILL.md');
      workDir = extracted.workDir;
      filePaths = extracted.filePaths;
      assetManifest = extracted.assetManifest;
      warnings.push(...extracted.warnings);
    } else {
      return {
        taskId,
        status: 'failed',
        strategy: input.strategy,
        artifactKind: input.artifactKind,
        summary: 'No ZIP or Markdown content was provided.',
        overallRisk: 'medium',
        findings: [],
        recommendations: ['Upload a ZIP/tar.gz archive or paste Markdown content.'],
        warnings: ['MISSING_INPUT'],
        engines: [],
        scannedFiles: [],
      };
    }

    const engineNames = enginesForStrategy(input.strategy, input.engines);
    if (engineNames.some((name) => name === 'skillspector' || name === 'cisco_skill_scanner')) {
      ensureBundledTools();
    }
    const adapters = pickAdapters(input.strategy, ENGINE_REGISTRY, input.engines);
    const engineStatuses: EngineRunStatus[] = [];
    const allFindings: UnifiedFinding[] = [...archiveSecurityFindings];

    const needsLlm =
      engineNames.includes('llm') ||
      input.strategy === 'standard' ||
      input.strategy === 'deep_offline' ||
      input.strategy === 'online_enhanced' ||
      input.strategy === 'llm_only';
    const resolvedProvider = needsLlm
      ? await resolveCapabilityScanProvider({
          provider: input.provider,
          organizationId: input.organizationId,
        })
      : input.provider;

    const ctx = {
      workDir,
      artifactKind: input.artifactKind,
      filePaths,
      llm: {
        zipBuffer: input.zipBuffer,
        markdown: input.markdown,
        fileName: input.fileName,
        provider: resolvedProvider,
      },
    };

    for (const adapter of adapters) {
      try {
        const { findings, status } = await adapter.run(ctx);
        allFindings.push(...findings);
        engineStatuses.push(status);
        if (status.status === 'skipped' && status.message) {
          warnings.push(`${status.engine}: ${status.message}`);
        }
        if (status.status === 'failed' && status.message) {
          warnings.push(`${status.engine} failed: ${status.message}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        engineStatuses.push({
          engine: adapter.name,
          status: 'failed',
          findingCount: 0,
          message: msg,
        });
        warnings.push(`${adapter.name} error: ${msg}`);
      }
    }

    allFindings.push(...buildIntegrityFindings(engineStatuses, input.strategy));

    let findings = mergeFindings(allFindings);
    const rawFindings = [...findings];
    let triageSummary: string | undefined;

    if (input.strategy === 'standard') {
      const triage = await triageFindingsWithLlm({
        artifactKind: input.artifactKind,
        workDir,
        filePaths,
        findings,
        provider: resolvedProvider,
      });
      findings = triage.findings;
      engineStatuses.push(triage.status);
      warnings.push(...triage.warnings);
      triageSummary = triage.summary;
    }

    findings = applyFindingDisposition(findings);
    const disposition = buildDispositionSummary(rawFindings.length, findings);
    const overallRisk = overallRiskFromFormalFindings(findings);
    const riskSummary = buildRiskSummary(findings);
    const suggestedAction = overallSuggestedAction(findings);

    let skillPreview: CapabilityScanResult['skillPreview'];
    if (workDir && filePaths.length > 0) {
      try {
        skillPreview = await buildSkillPreview(workDir, filePaths, assetManifest ?? []);
      } catch {
        skillPreview = undefined;
      }
    }

    return {
      taskId,
      status: resolveScanStatus(findings, engineStatuses, hasArchiveThreat),
      strategy: input.strategy,
      artifactKind: input.artifactKind,
      summary: triageSummary
        ? `${disposition.summaryZh} · ${triageSummary}`
        : `${buildSummary(findings, input.artifactKind, input.strategy)} · ${disposition.summaryZh}`,
      overallRisk,
      suggestedAction,
      riskSummary,
      findings,
      rawFindings,
      dispositionSummary: {
        ...disposition.stats,
        summaryZh: disposition.summaryZh,
        summaryEn: disposition.summaryEn,
      },
      recommendations: defaultRecommendations(findings),
      warnings,
      engines: engineStatuses,
      scannedFiles: filePaths.map((path) => ({ path })),
      assetManifest,
      skillPreview,
    };
  } finally {
    if (workDir) {
      await cleanupWorkDir(workDir);
    }
  }
}
