/**
 * SkillSpector adapter. Skips cleanly when the CLI is not installed.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { inferSkillAuditDimension } from '../../../../backend/src/services/skillsMdAuditDimensions';
import { resolveBin, runCli, TOOLS_ROOT } from '../cli';
import type { EngineAdapter, UnifiedFinding } from '../types';

function resolveSkillspectorInvocation(): { command: string; prefixArgs: string[] } {
  const bin = resolveBin('CAPABILITY_SCAN_SKILLSPECTOR_BIN', 'skillspector');
  const wrapper = join(TOOLS_ROOT, 'run-skillspector.py');
  const scriptsDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const pythonExt = process.platform === 'win32' ? '.exe' : '';
  const python = join(TOOLS_ROOT, 'scan-venv', scriptsDir, `python${pythonExt}`);

  if (existsSync(wrapper) && existsSync(python)) {
    return { command: python, prefixArgs: [wrapper] };
  }
  return { command: bin, prefixArgs: [] };
}

type SkillSpectorFinding = {
  title?: string;
  severity?: string;
  file?: string;
  line?: number;
  description?: string;
  evidence?: string;
  rule_id?: string;
  id?: string;
  finding?: string;
  explanation?: string;
  code_snippet?: string;
  location?: { file?: string; start_line?: number; end_line?: number };
};

function normalizeSkillSpectorItems(raw: unknown): SkillSpectorFinding[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const list = obj.issues ?? obj.findings;
    if (Array.isArray(list)) {
      return list as SkillSpectorFinding[];
    }
  }
  return [];
}

function mapSkillSpectorItem(item: SkillSpectorFinding, workDir: string): UnifiedFinding {
  const rel =
    item.file?.replace(workDir, '').replace(/^[/\\]/, '') ??
    item.location?.file?.replace(workDir, '').replace(/^[/\\]/, '') ??
    'unknown';
  const line = item.line ?? item.location?.start_line ?? 1;
  const evidence = (
    item.evidence ??
    item.code_snippet ??
    item.description ??
    item.explanation ??
    ''
  ).slice(0, 500);
  return {
    severity: mapSeverity(item.severity),
    category: 'SKILL_SPECTOR',
    location: `${rel}:${line}`,
    issue:
      item.title ?? item.finding ?? item.description ?? item.explanation ?? 'SkillSpector finding',
    evidence: evidence || item.rule_id || item.id || '',
    recommendation: 'Follow SkillSpector guidance for remediation.',
    dimension: inferSkillAuditDimension({
      category: 'SKILL_SPECTOR',
      evidence,
      location: `${rel}:${line}`,
    }),
    sourceFile: rel,
    sourceEngines: ['skillspector'],
    ruleIds: item.rule_id || item.id ? [item.rule_id ?? item.id!] : undefined,
    confidence: 'high',
  };
}

function mapSeverity(s?: string): UnifiedFinding['severity'] {
  const v = (s ?? '').toLowerCase();
  if (v === 'critical' || v === 'severe') {
    return 'critical';
  }
  if (v === 'high') {
    return 'high';
  }
  if (v === 'low') {
    return 'low';
  }
  return 'medium';
}

export const skillspectorEngine: EngineAdapter = {
  name: 'skillspector',
  async run(ctx) {
    const start = Date.now();
    const { command, prefixArgs } = resolveSkillspectorInvocation();
    const outPath = join(ctx.workDir, '.skillspector-report.json');

    const r = await runCli(
      command,
      [...prefixArgs, 'scan', ctx.workDir, '--no-llm', '--format', 'json', '--output', outPath],
      { timeoutMs: 300_000, shell: false },
    );

    let items: SkillSpectorFinding[] = [];
    let parsedReport = false;
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = JSON.parse(await readFile(outPath, 'utf8')) as unknown;
      items = normalizeSkillSpectorItems(raw);
      parsedReport = true;
    } catch {
      if (r.stderr.includes('not found') || r.stderr.includes('ENOENT')) {
        return {
          findings: [],
          status: {
            engine: 'skillspector',
            status: 'skipped',
            findingCount: 0,
            message: 'SkillSpector not found. Install it or set CAPABILITY_SCAN_SKILLSPECTOR_BIN.',
            durationMs: Date.now() - start,
          },
        };
      }
      return {
        findings: [],
        status: {
          engine: 'skillspector',
          status: r.timedOut ? 'timeout' : 'failed',
          findingCount: 0,
          message: (r.stderr || r.stdout || 'skillspector failed').trim().slice(0, 500),
          durationMs: Date.now() - start,
        },
      };
    }

    const findings: UnifiedFinding[] = items.map((item) => mapSkillSpectorItem(item, ctx.workDir));

    // SkillSpector may exit non-zero when risk_score is high; a parsed report means the scan ran.
    const cliFailed = !parsedReport && !r.ok;
    return {
      findings,
      status: {
        engine: 'skillspector',
        status: r.timedOut ? 'timeout' : cliFailed ? 'failed' : 'success',
        findingCount: findings.length,
        message: cliFailed
          ? (r.stderr || r.stdout || `skillspector failed (exit ${r.exitCode ?? '?'})`)
              .trim()
              .slice(0, 500)
          : undefined,
        durationMs: Date.now() - start,
      },
    };
  },
};
