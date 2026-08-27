/**
 * LLM static audit engine — wraps existing skillsMdAuditService.
 */

import {
  analyzeMcpSourceZip,
  analyzeSkillZipPackage,
  analyzeSkillsMdMarkdown,
} from '../../../../backend/src/services/skillsMdAuditService';
import type { EngineAdapter, UnifiedFinding } from '../types';

function llmFindingToUnified(f: {
  severity: string;
  category: string;
  location: string;
  issue: string;
  evidence: string;
  recommendation: string;
  dimension?: string;
  sourceFile?: string;
}): UnifiedFinding {
  const sev = ['low', 'medium', 'high', 'critical'].includes(f.severity)
    ? (f.severity as UnifiedFinding['severity'])
    : 'medium';
  return {
    severity: sev,
    category: f.category,
    location: f.location,
    issue: f.issue,
    evidence: f.evidence,
    recommendation: f.recommendation,
    dimension: f.dimension,
    sourceFile: f.sourceFile,
    sourceEngines: ['llm'],
    confidence: 'medium',
  };
}

export const llmEngine: EngineAdapter = {
  name: 'llm',
  async run(ctx) {
    const start = Date.now();
    const opts = ctx.llm;

    try {
      if (!opts) {
        return {
          findings: [],
          status: {
            engine: 'llm',
            status: 'skipped',
            findingCount: 0,
            message: 'LLM options not provided',
            durationMs: Date.now() - start,
          },
        };
      }

      let data;
      if (opts.zipBuffer) {
        data =
          ctx.artifactKind === 'mcp'
            ? await analyzeMcpSourceZip(opts.zipBuffer, opts.fileName, opts.provider)
            : await analyzeSkillZipPackage(opts.zipBuffer, opts.fileName, opts.provider);
      } else if (opts.markdown?.trim()) {
        data = await analyzeSkillsMdMarkdown({
          markdown: opts.markdown,
          fileName: opts.fileName,
          provider: opts.provider,
          auditMode: ctx.artifactKind === 'mcp' ? 'mcp_source' : 'skills_md',
        });
      } else {
        return {
          findings: [],
          status: {
            engine: 'llm',
            status: 'failed',
            findingCount: 0,
            message: 'No content for LLM audit',
            durationMs: Date.now() - start,
          },
        };
      }

      const findings = data.findings.map(llmFindingToUnified);
      return {
        findings,
        status: {
          engine: 'llm',
          status: 'success',
          findingCount: findings.length,
          durationMs: Date.now() - start,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        findings: [],
        status: {
          engine: 'llm',
          status: 'failed',
          findingCount: 0,
          message: msg,
          durationMs: Date.now() - start,
        },
      };
    }
  },
};
