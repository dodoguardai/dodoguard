/**
 * Export unified findings as SARIF 2.1.0 (Word 方案结果回传格式之一).
 */

import type { CapabilityScanResult, UnifiedFinding } from './types';

const SEV_TO_SARIF: Record<string, string> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
};

function findingToResult(f: UnifiedFinding, index: number) {
  return {
    ruleId: f.ruleIds?.[0] ?? `capability/${f.category}`,
    ruleIndex: index,
    level: SEV_TO_SARIF[f.severity] ?? 'warning',
    message: { text: f.issue },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.sourceFile ?? f.location.split(':')[0] ?? 'unknown' },
          region: {
            startLine: Number.parseInt(f.location.split(':')[1] ?? '1', 10) || 1,
          },
        },
      },
    ],
    properties: {
      dimension: f.dimension,
      evidence: f.evidence,
      recommendation: f.recommendation,
      sourceEngines: f.sourceEngines,
      confidence: f.confidence,
    },
  };
}

export function capabilityScanToSarif(result: CapabilityScanResult): object {
  const rules = result.findings.map((f, i) => ({
    id: f.ruleIds?.[0] ?? `capability/${f.category}-${i}`,
    name: f.category,
    shortDescription: { text: f.issue },
    fullDescription: { text: f.evidence },
    defaultConfiguration: { level: SEV_TO_SARIF[f.severity] ?? 'warning' },
    properties: { dimension: f.dimension },
  }));

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'zhian-capability-scan',
            version: '1.0.0',
            informationUri: 'https://github.com/',
            rules,
          },
        },
        results: result.findings.map((f, i) => findingToResult(f, i)),
        properties: {
          taskId: result.taskId,
          strategy: result.strategy,
          artifactKind: result.artifactKind,
          overallRisk: result.overallRisk,
          summary: result.summary,
          engines: result.engines,
        },
      },
    ],
  };
}
