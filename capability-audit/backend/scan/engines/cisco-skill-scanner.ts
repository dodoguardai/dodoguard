/**
 * Cisco Skill Scanner adapter. Skips cleanly when the CLI is not installed.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { inferSkillAuditDimension } from '../../../../backend/src/services/skillsMdAuditDimensions';
import { resolveBin, runCli } from '../cli';
import type { EngineAdapter, UnifiedFinding } from '../types';

type CiscoFinding = {
  title?: string;
  name?: string;
  severity?: string;
  file?: string;
  path?: string;
  file_path?: string;
  line?: number;
  line_number?: number | null;
  description?: string;
  evidence?: string;
  snippet?: string | null;
  rule_id?: string;
  ruleId?: string;
  category?: string;
};

function mapSeverity(s?: string): UnifiedFinding['severity'] {
  const v = (s ?? '').toLowerCase();
  if (v === 'critical') {
    return 'critical';
  }
  if (v === 'high') {
    return 'high';
  }
  if (v === 'low' || v === 'info') {
    return 'low';
  }
  return 'medium';
}

function collectFindings(raw: unknown): CiscoFinding[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(raw)) {
    return raw as CiscoFinding[];
  }
  if (Array.isArray(obj.findings)) {
    return obj.findings as CiscoFinding[];
  }
  if (Array.isArray(obj.results)) {
    return (obj.results as Array<{ findings?: CiscoFinding[] }>).flatMap((r) => r.findings ?? []);
  }
  if (Array.isArray(obj.skills)) {
    return (obj.skills as Array<{ findings?: CiscoFinding[] }>).flatMap((s) => s.findings ?? []);
  }
  return [];
}

export const ciscoSkillScannerEngine: EngineAdapter = {
  name: 'cisco_skill_scanner',
  async run(ctx) {
    const start = Date.now();
    const bin = resolveBin('CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN', 'skill-scanner');
    const outPath = join(ctx.workDir, '.cisco-skill-scanner-report.json');

    const r = await runCli(
      bin,
      ['scan-all', ctx.workDir, '--recursive', '--format', 'json', '--output', outPath],
      { timeoutMs: 300_000, shell: false },
    );

    let items: CiscoFinding[] = [];
    let parsedReport = false;
    const combinedOutput = `${r.stderr}\n${r.stdout}`;
    try {
      if (!existsSync(outPath)) {
        throw new Error('report missing');
      }
      const { readFile } = await import('node:fs/promises');
      const raw = JSON.parse(await readFile(outPath, 'utf8')) as unknown;
      items = collectFindings(raw);
      parsedReport = true;
    } catch {
      if (
        combinedOutput.includes('not found') ||
        combinedOutput.includes('ENOENT') ||
        combinedOutput.includes('not recognized')
      ) {
        return {
          findings: [],
          status: {
            engine: 'cisco_skill_scanner',
            status: 'skipped',
            findingCount: 0,
            message:
              'Cisco Skill Scanner not found. Install cisco-ai-skill-scanner or set CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN.',
            durationMs: Date.now() - start,
          },
        };
      }
      if (/No skills found/i.test(combinedOutput)) {
        return {
          findings: [],
          status: {
            engine: 'cisco_skill_scanner',
            status: 'success',
            findingCount: 0,
            message: 'No scannable skills in package',
            durationMs: Date.now() - start,
          },
        };
      }
      return {
        findings: [],
        status: {
          engine: 'cisco_skill_scanner',
          status: r.timedOut ? 'timeout' : 'failed',
          findingCount: 0,
          message: (r.stderr || r.stdout || 'skill-scanner failed').trim().slice(0, 500),
          durationMs: Date.now() - start,
        },
      };
    }

    const findings: UnifiedFinding[] = items.map((item) => {
      const file = item.file ?? item.path ?? item.file_path ?? 'unknown';
      const rel = file.replace(ctx.workDir, '').replace(/^[/\\]/, '') || file;
      const line = item.line ?? item.line_number ?? 1;
      const evidence = (item.evidence ?? item.snippet ?? item.description ?? '').slice(0, 500);
      const ruleId = item.rule_id ?? item.ruleId;
      return {
        severity: mapSeverity(item.severity),
        category: item.category ?? 'CISCO_SKILL_SCANNER',
        location: `${rel}:${line}`,
        issue: item.title ?? item.name ?? item.description ?? 'Cisco Skill Scanner finding',
        evidence: evidence || ruleId || '',
        recommendation: 'Review Cisco Skill Scanner guidance and remediate flagged patterns.',
        dimension: inferSkillAuditDimension({
          category: item.category ?? 'CISCO_SKILL_SCANNER',
          evidence,
          location: `${rel}:${line}`,
        }),
        sourceFile: rel,
        sourceEngines: ['cisco_skill_scanner'],
        ruleIds: ruleId ? [ruleId] : undefined,
        confidence: 'high',
      };
    });

    const cliFailed = !parsedReport && !r.ok;
    return {
      findings,
      status: {
        engine: 'cisco_skill_scanner',
        status: r.timedOut ? 'timeout' : cliFailed ? 'failed' : 'success',
        findingCount: findings.length,
        message: cliFailed
          ? (r.stderr || r.stdout || `skill-scanner failed (exit ${r.exitCode ?? '?'})`)
              .trim()
              .slice(0, 500)
          : undefined,
        durationMs: Date.now() - start,
      },
    };
  },
};
