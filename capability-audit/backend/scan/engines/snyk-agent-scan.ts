/**
 * Snyk Agent Scan adapter. Scans Skills directly and MCP packages when a config file is present.
 */

import { join } from 'node:path';

import { inferSkillAuditDimension } from '../../../../backend/src/services/skillsMdAuditDimensions';
import { resolveBin, runCli } from '../cli';
import type { EngineAdapter, EngineContext, UnifiedFinding } from '../types';

type SnykRawFinding = Record<string, unknown>;
type SnykCliCapabilities = {
  supportsSkillPath: boolean;
  supportsNoSkills: boolean;
  supportsDangerouslyRunMcpServers: boolean;
};

const COLLECTION_KEYS = [
  'findings',
  'issues',
  'vulnerabilities',
  'violations',
  'risks',
  'results',
  'items',
  'checks',
  'problems',
];

const MCP_CONFIG_BASENAMES = new Set([
  'mcp.json',
  'mcp-config.json',
  'mcp_config.json',
  'claude_desktop_config.json',
  'claude_desktop_config.jsonc',
]);

let snykCapabilitiesPromise: Promise<SnykCliCapabilities> | undefined;

export function resolveSnykAgentScanInvocation(): { command: string; prefixArgs: string[] } {
  if (
    !process.env.CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN?.trim() &&
    /^(1|true|yes)$/i.test(process.env.CAPABILITY_SCAN_SNYK_AGENT_SCAN_USE_UVX ?? '')
  ) {
    return {
      command: resolveBin('CAPABILITY_SCAN_UVX_BIN', 'uvx'),
      prefixArgs: ['snyk-agent-scan@latest'],
    };
  }
  return {
    command: resolveBin('CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN', 'snyk-agent-scan'),
    prefixArgs: [],
  };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const joined = value.map(stringValue).filter(Boolean).join(', ');
    return joined || undefined;
  }
  return undefined;
}

function getString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = stringValue(obj[key]);
    if (direct) {
      return direct;
    }
    const nested = obj[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedValue = getString(nested as Record<string, unknown>, [
        'path',
        'file',
        'filePath',
        'name',
        'id',
        'title',
        'description',
      ]);
      if (nestedValue) {
        return nestedValue;
      }
    }
  }
  return undefined;
}

function getNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedValue = getNumber(value as Record<string, unknown>, [
        'line',
        'lineNumber',
        'line_number',
        'startLine',
        'start_line',
      ]);
      if (nestedValue) {
        return nestedValue;
      }
    }
  }
  return undefined;
}

function parseJsonOutput(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Some CLIs mix logs with JSON. Try extracting the broadest JSON-looking slice.
  }

  const candidates = [
    [trimmed.indexOf('{'), trimmed.lastIndexOf('}')],
    [trimmed.indexOf('['), trimmed.lastIndexOf(']')],
  ] as const;
  for (const [start, end] of candidates) {
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        // Try the next candidate.
      }
    }
  }
  return undefined;
}

function looksLikeFinding(obj: Record<string, unknown>): boolean {
  const hasIssue = Boolean(
    getString(obj, [
      'issue',
      'title',
      'name',
      'message',
      'description',
      'code',
      'issueCode',
      'issue_code',
      'id',
      'ruleId',
      'rule_id',
    ]),
  );
  const hasFindingSignal = Boolean(
    getString(obj, ['severity', 'level', 'risk', 'priority', 'category', 'type', 'issueType']),
  );
  return hasIssue && hasFindingSignal;
}

function collectSnykFindings(raw: unknown): SnykRawFinding[] {
  const findings: SnykRawFinding[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (!node || typeof node !== 'object' || seen.has(node)) {
      return;
    }
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (looksLikeFinding(obj)) {
      findings.push(obj);
    }
    for (const key of COLLECTION_KEYS) {
      if (Array.isArray(obj[key])) {
        visit(obj[key]);
      }
    }
  }

  visit(raw);
  return findings;
}

function mapSeverity(value?: string): UnifiedFinding['severity'] {
  const v = (value ?? '').toLowerCase();
  if (v === 'critical' || v === 'severe') {
    return 'critical';
  }
  if (v === 'high') {
    return 'high';
  }
  if (v === 'low' || v === 'info' || v === 'informational') {
    return 'low';
  }
  return 'medium';
}

function relativizeLocation(value: string, workDir: string): string {
  const normalizedValue = value.replace(/\\/g, '/');
  const normalizedWorkDir = workDir.replace(/\\/g, '/');
  if (normalizedValue.toLowerCase().startsWith(normalizedWorkDir.toLowerCase())) {
    return normalizedValue.slice(normalizedWorkDir.length).replace(/^\/+/, '') || value;
  }
  return value.replace(/^[/\\]+/, '');
}

function inferSnykRiskType(finding: SnykRawFinding): UnifiedFinding['riskType'] | undefined {
  const haystack = [
    getString(finding, ['category', 'type', 'issueType', 'code', 'issueCode', 'issue_code']),
    getString(finding, ['title', 'name', 'issue', 'message', 'description']),
    getString(finding, ['evidence', 'details', 'reason']),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (/prompt|instruction|jailbreak|system override/.test(haystack)) {
    return 'prompt_instruction_risk';
  }
  if (/secret|credential|token|password|api key|apikey/.test(haystack)) {
    return 'sensitive_data_leakage';
  }
  if (/tool poisoning|tool_poison|mcp tool|description poisoning/.test(haystack)) {
    return 'tool_poisoning_risk';
  }
  if (/toxic flow|exfil|network|external|callback|webhook/.test(haystack)) {
    return 'external_network_risk';
  }
  if (/supply|dependency|package|install/.test(haystack)) {
    return 'supply_chain_risk';
  }
  if (/permission|scope|privilege/.test(haystack)) {
    return 'permission_overreach';
  }
  if (/file|filesystem|path traversal|directory traversal/.test(haystack)) {
    return 'filesystem_risk';
  }
  return undefined;
}

function sourceFileFromLocation(location: string): string | undefined {
  const idx = location.lastIndexOf(':');
  if (idx > 0 && /^\d+$/.test(location.slice(idx + 1))) {
    return location.slice(0, idx);
  }
  return location && location !== 'unknown' ? location : undefined;
}

function mapSnykFinding(item: SnykRawFinding, workDir: string): UnifiedFinding {
  const severity = mapSeverity(getString(item, ['severity', 'level', 'risk', 'priority']));
  const category = getString(item, ['category', 'type', 'issueType']) ?? 'SNYK_AGENT_SCAN';
  const issue =
    getString(item, ['title', 'name', 'issue', 'message', 'description', 'code', 'issueCode']) ??
    'Snyk Agent Scan finding';
  const evidence =
    getString(item, ['evidence', 'snippet', 'details', 'reason', 'description', 'message']) ?? '';
  const recommendation =
    getString(item, ['recommendation', 'remediation', 'fix', 'fixAdvice']) ??
    'Review Snyk Agent Scan guidance and remediate the flagged agent component.';
  const ruleId = getString(item, ['issueCode', 'issue_code', 'ruleId', 'rule_id', 'code', 'id']);
  const rawLocation =
    getString(item, [
      'file',
      'filePath',
      'file_path',
      'path',
      'location',
      'skill',
      'server',
      'serverName',
      'component',
      'resource',
      'target',
      'source',
    ]) ?? 'unknown';
  const rel = relativizeLocation(rawLocation, workDir);
  const line = getNumber(item, [
    'line',
    'lineNumber',
    'line_number',
    'startLine',
    'start_line',
    'location',
  ]);
  const location = line && rel !== 'unknown' && !/:\d+$/.test(rel) ? `${rel}:${line}` : rel;
  const sourceFile = sourceFileFromLocation(location);

  return {
    severity,
    category,
    location,
    issue,
    evidence: evidence.slice(0, 500) || ruleId || '',
    recommendation,
    dimension: inferSkillAuditDimension({
      category,
      issue,
      evidence,
      location,
    }),
    sourceFile,
    sourceEngines: ['snyk_agent_scan'],
    ruleIds: ruleId ? [ruleId] : undefined,
    confidence: 'high',
    riskType: inferSnykRiskType(item),
  };
}

function findMcpConfigPaths(ctx: EngineContext): string[] {
  return ctx.filePaths
    .filter((relPath) => {
      const normalized = relPath.replace(/\\/g, '/').toLowerCase();
      const base = normalized.split('/').pop() ?? normalized;
      if (MCP_CONFIG_BASENAMES.has(base)) {
        return true;
      }
      if (/(^|\/)\.vscode\/mcp\.json$/.test(normalized)) {
        return true;
      }
      return normalized.endsWith('.json') && (base.includes('mcp') || normalized.includes('/mcp/'));
    })
    .slice(0, 20)
    .map((relPath) => join(ctx.workDir, relPath));
}

function envEnabled(key: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[key] ?? '');
}

function detectCapabilitiesFromHelp(helpText: string): SnykCliCapabilities {
  if (looksMissing(helpText)) {
    return {
      supportsSkillPath: true,
      supportsNoSkills: false,
      supportsDangerouslyRunMcpServers: false,
    };
  }
  const hasHelp = Boolean(helpText.trim());
  return {
    // Main-branch docs expose "--skills PATH"; v0.5.12 exposes "--skills | --no-skills".
    supportsSkillPath: !hasHelp || /--skills\s+(?:PATH|PATHS|PATH_TO|PATH_TO_)/i.test(helpText),
    supportsNoSkills: /--no-skills/i.test(helpText),
    supportsDangerouslyRunMcpServers: /--dangerously-run-mcp-servers/i.test(helpText),
  };
}

async function getSnykCliCapabilities(
  command: string,
  prefixArgs: string[],
): Promise<SnykCliCapabilities> {
  if (!snykCapabilitiesPromise) {
    snykCapabilitiesPromise = runCli(command, [...prefixArgs, 'scan', '--help'], {
      timeoutMs: 60_000,
      shell: false,
    }).then((result) => detectCapabilitiesFromHelp(`${result.stdout}\n${result.stderr}`));
  }
  return snykCapabilitiesPromise;
}

function buildSnykArgs(
  ctx: EngineContext,
  prefixArgs: string[],
  capabilities: SnykCliCapabilities,
): { args: string[]; skipMessage?: string; cwd?: string } {
  const args = [...prefixArgs, 'scan', '--json'];
  if (ctx.artifactKind === 'skills') {
    if (capabilities.supportsSkillPath) {
      return { args: [...args, '--skills', ctx.workDir] };
    }
    if (envEnabled('CAPABILITY_SCAN_SNYK_ALLOW_MACHINE_SKILL_SCAN')) {
      return { args: [...args, '--skills'], cwd: ctx.workDir };
    }
    return {
      args,
      skipMessage:
        'Installed Snyk Agent Scan CLI does not support scanning a supplied skill path. Upgrade snyk-agent-scan or set CAPABILITY_SCAN_SNYK_ALLOW_MACHINE_SKILL_SCAN=true to allow machine-level skill discovery.',
    };
  }

  const configPaths = findMcpConfigPaths(ctx);
  if (configPaths.length === 0) {
    return {
      args,
      skipMessage: 'No MCP config JSON found in package for Snyk Agent Scan.',
    };
  }

  const serverTimeout = process.env.CAPABILITY_SCAN_SNYK_MCP_SERVER_TIMEOUT_SECONDS?.trim() || '5';
  const mcpArgs = [...args];
  if (capabilities.supportsNoSkills) {
    mcpArgs.push('--no-skills');
  }
  if (
    capabilities.supportsDangerouslyRunMcpServers &&
    envEnabled('CAPABILITY_SCAN_SNYK_DANGEROUSLY_RUN_MCP_SERVERS')
  ) {
    mcpArgs.push('--dangerously-run-mcp-servers');
  }
  return {
    args: [
      ...mcpArgs,
      '--server-timeout',
      serverTimeout,
      '--suppress-mcpserver-io',
      'True',
      ...configPaths,
    ],
  };
}

function looksMissing(text: string): boolean {
  return /not recognized|not found|enoent|cannot find|could not find/i.test(text);
}

export const snykAgentScanEngine: EngineAdapter = {
  name: 'snyk_agent_scan',
  async run(ctx) {
    const start = Date.now();
    const { command, prefixArgs } = resolveSnykAgentScanInvocation();
    const capabilities = await getSnykCliCapabilities(command, prefixArgs);
    const { args, skipMessage, cwd } = buildSnykArgs(ctx, prefixArgs, capabilities);

    if (skipMessage) {
      return {
        findings: [],
        status: {
          engine: 'snyk_agent_scan',
          status: 'skipped',
          findingCount: 0,
          message: skipMessage,
          durationMs: Date.now() - start,
        },
      };
    }

    const timeoutMs = Number(process.env.CAPABILITY_SCAN_SNYK_TIMEOUT_MS ?? 300_000);
    const r = await runCli(command, args, {
      cwd,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 300_000,
      shell: false,
    });
    const combinedOutput = `${r.stdout}\n${r.stderr}`;

    if (!r.ok && looksMissing(combinedOutput)) {
      return {
        findings: [],
        status: {
          engine: 'snyk_agent_scan',
          status: 'skipped',
          findingCount: 0,
          message:
            'Snyk Agent Scan not found. Install snyk-agent-scan, set CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN, or enable CAPABILITY_SCAN_SNYK_AGENT_SCAN_USE_UVX.',
          durationMs: Date.now() - start,
        },
      };
    }

    const raw = parseJsonOutput(combinedOutput);
    if (!raw) {
      return {
        findings: [],
        status: {
          engine: 'snyk_agent_scan',
          status: r.timedOut ? 'timeout' : r.ok ? 'success' : 'failed',
          findingCount: 0,
          message: r.ok
            ? 'Snyk Agent Scan emitted no JSON findings.'
            : (r.stderr || r.stdout || `snyk-agent-scan failed (exit ${r.exitCode ?? '?'})`)
                .trim()
                .slice(0, 500),
          durationMs: Date.now() - start,
        },
      };
    }

    const findings = collectSnykFindings(raw).map((item) => mapSnykFinding(item, ctx.workDir));
    return {
      findings,
      status: {
        engine: 'snyk_agent_scan',
        status: r.timedOut ? 'timeout' : 'success',
        findingCount: findings.length,
        message: !r.ok && !r.timedOut ? (r.stderr || r.stdout).trim().slice(0, 500) : undefined,
        durationMs: Date.now() - start,
      },
    };
  },
};
