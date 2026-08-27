import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import yaml from 'js-yaml';

import type { ScanTaskInput } from '../../schemas/attackTaskSchema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveEnvPlaceholders(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => process.env[key] ?? '');
}

function normalizeVulnerabilityId(id: string): string {
  return id.replace(/^vuln-/, '').replace(/^agent-/, 'agent-');
}

function vulnerabilityToModuleId(vulnId: string): string {
  const normalized = normalizeVulnerabilityId(vulnId);
  if (normalized.includes('prompt-injection') || normalized.includes('jailbreak')) {
    return 'agent-prompt-injection';
  }
  if (normalized.includes('bypass')) {
    return 'dify-agent-bypass';
  }
  return normalized;
}

function buildModulesFromVulnerabilities(vulnerabilities: string[], attackMode: string) {
  const moduleIds = [...new Set(vulnerabilities.map(vulnerabilityToModuleId))];
  return moduleIds.map((id) => ({
    id,
    attackMode: attackMode === 'conversation' ? 'mixed' : 'direct',
    instructionSelection: {
      includeBuiltIn: true,
      attackMode: attackMode === 'conversation' ? 'mixed' : 'direct',
    },
  }));
}

function buildDifyPentestYamlFromTask(task: ScanTaskInput): Record<string, unknown> {
  const cfg = task.targetConfig;
  const apiBaseUrl =
    (typeof cfg.apiBaseUrl === 'string' && cfg.apiBaseUrl) ||
    (typeof cfg.apiUrl === 'string' && cfg.apiUrl) ||
    'https://api.dify.ai';
  const apiKey =
    (typeof cfg.apiKey === 'string' && resolveEnvPlaceholders(cfg.apiKey)) ||
    process.env.DIFY_API_KEY ||
    '';
  const userId =
    (typeof cfg.userId === 'string' && cfg.userId) ||
    (typeof cfg.user === 'string' && cfg.user) ||
    'scan-cli-user';

  if (!apiKey) {
    throw new Error(
      'Dify API key is required. Set targetConfig.apiKey or DIFY_API_KEY environment variable.',
    );
  }

  const useLlm = task.detectionConfig.useLLM;
  const config: Record<string, unknown> = {
    description: task.description || task.name,
    dify: {
      apiBaseUrl,
      apiKey,
      userId,
      conversationId: typeof cfg.conversationId === 'string' ? cfg.conversationId : '',
    },
    assertionConfig: {
      mode: useLlm ? 'mixed' : 'rule',
      ...(task.detectionConfig.ruleSetId ? { ruleSetId: task.detectionConfig.ruleSetId } : {}),
    },
    modules: buildModulesFromVulnerabilities(task.vulnerabilities, task.attackMode),
    maxConcurrency: task.execution?.maxConcurrency ?? 2,
  };

  if (task.attackMode === 'conversation') {
    config.strategies = [
      {
        id: 'conversation-chaining',
        enabled: true,
        config: { maxTurns: 3, escalationPattern: 'linear' },
      },
    ];
  }

  return config;
}

export interface ResolvedRunnerConfig {
  configPath: string;
  isTemporary: boolean;
}

/**
 * Resolve a dify-pentest runner config path from a scan task definition.
 */
export function resolveRunnerConfigPath(
  task: ScanTaskInput,
  configDir: string,
): ResolvedRunnerConfig {
  const metadata = isRecord(task.metadata) ? task.metadata : {};
  const runnerFromMeta =
    typeof metadata.runnerConfigPath === 'string' ? metadata.runnerConfigPath : undefined;
  const runnerPath = task.runnerConfigPath || runnerFromMeta;

  if (runnerPath) {
    const resolved = path.isAbsolute(runnerPath) ? runnerPath : path.resolve(configDir, runnerPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Runner config not found: ${resolved}`);
    }
    return { configPath: resolved, isTemporary: false };
  }

  const pf = String(task.platformFamily ?? '').toLowerCase();
  const targetType = task.targetType;
  const hasInlineDifyTarget =
    isRecord(task.targetConfig) &&
    (typeof task.targetConfig.apiKey === 'string' ||
      typeof task.targetConfig.apiBaseUrl === 'string' ||
      typeof task.targetConfig.apiUrl === 'string');

  if (
    pf === 'dify' ||
    targetType === 'platform' ||
    hasInlineDifyTarget ||
    task.scanMode === 'runtime' ||
    task.scanMode === 'hybrid'
  ) {
    const built = buildDifyPentestYamlFromTask(task);
    const tmpPath = path.join(
      os.tmpdir(),
      `dodoguard-scan-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`,
    );
    fs.writeFileSync(tmpPath, yaml.dump(built), 'utf8');
    return { configPath: tmpPath, isTemporary: true };
  }

  throw new Error(
    'Cannot resolve runner configuration. Provide runnerConfigPath, inline Dify targetConfig (apiKey/apiBaseUrl), or use a native dify-pentest YAML file.',
  );
}

export function getDefaultScanTemplate(): string {
  return `# DodoGuard CLI scan task (aligned with POST /api/v1/attack-tasks body)
name: "Dify Agent 安全扫描"
description: "本地 CLI 扫描示例"
targetType: platform
platformFamily: dify
scanMode: runtime
targetConfig:
  apiBaseUrl: https://api.dify.ai
  apiKey: \${DIFY_API_KEY}
  userId: scan-cli-user
vulnerabilities:
  - agent-prompt-injection
  - dify-agent-bypass
attackMode: conversation
detectionConfig:
  useRule: true
  useLLM: false
  useKnowledgeBase: false
metadata:
  creationMode: cli
execution:
  maxConcurrency: 2
output:
  path: ./scan-results.json
  format: json

# Alternative: reference an existing dify-pentest YAML instead of inline targetConfig
# runnerConfigPath: ./dify-pentest.yaml
`;
}
