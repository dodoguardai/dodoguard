import { existsSync } from 'node:fs';
import { join } from 'node:path';

import '../../tools/load-tools-env';
import { resolveBin, runCli, TOOLS_ROOT } from './cli';
import { resolveSnykAgentScanInvocation } from './engines/snyk-agent-scan';
import { SKILL_MCP_ENGINE_NAMES } from './skill-mcp-engines';
import type { EngineHealthStatus } from './types';

type EngineDefinition = {
  engine: string;
  required: boolean;
  phase: EngineHealthStatus['phase'];
  envKey?: string;
  fallback?: string;
  versionArgs?: string[];
};

const ENGINE_DEFINITIONS: EngineDefinition[] = [
  {
    engine: 'skillspector',
    required: true,
    phase: 'phase1',
    envKey: 'CAPABILITY_SCAN_SKILLSPECTOR_BIN',
    fallback: 'skillspector',
    versionArgs: ['--version'],
  },
  {
    engine: 'cisco_skill_scanner',
    required: true,
    phase: 'phase1',
    envKey: 'CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN',
    fallback: 'skill-scanner',
    versionArgs: ['--help'],
  },
  {
    engine: 'snyk_agent_scan',
    required: false,
    phase: 'phase1',
    envKey: 'CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN',
    fallback: 'snyk-agent-scan',
    versionArgs: ['help'],
  },
  { engine: 'llm', required: false, phase: 'phase2' },
];

function looksMissing(text: string): boolean {
  return /not recognized|not found|ENOENT|cannot find|could not find/i.test(text);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function firstLine(text: string): string | undefined {
  return stripAnsi(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 200);
}

async function inspectSkillspector(def: EngineDefinition): Promise<EngineHealthStatus> {
  const wrapper = join(TOOLS_ROOT, 'run-skillspector.py');
  const scriptsDir = process.platform === 'win32' ? 'Scripts' : 'bin';
  const pythonExt = process.platform === 'win32' ? '.exe' : '';
  const python = join(TOOLS_ROOT, 'scan-venv', scriptsDir, `python${pythonExt}`);

  if (existsSync(wrapper) && existsSync(python)) {
    const result = await runCli(python, [wrapper, '--version'], {
      timeoutMs: 10_000,
      shell: false,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    const version = firstLine(combined);
    if (result.ok || (version && !looksMissing(combined))) {
      return {
        engine: def.engine,
        available: true,
        required: def.required,
        phase: def.phase,
        path: python,
        version,
        message: 'YARA wrapper',
      };
    }
  }

  return inspectCli(def);
}

async function inspectCli(def: EngineDefinition): Promise<EngineHealthStatus> {
  const path = resolveBin(def.envKey!, def.fallback!);
  const result = await runCli(path, def.versionArgs ?? ['--version'], {
    timeoutMs: 15_000,
    shell: false,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  const version = firstLine(combined);
  const missing = looksMissing(combined);
  const pathExists = /[\\/]/.test(path) && existsSync(path);
  const hasUsableOutput = Boolean(version) && !missing;
  if (result.ok || hasUsableOutput || (pathExists && result.timedOut)) {
    return {
      engine: def.engine,
      available: true,
      required: def.required,
      phase: def.phase,
      path,
      version,
      message:
        pathExists && result.timedOut ? 'CLI path exists; version check timed out' : undefined,
    };
  }
  return {
    engine: def.engine,
    available: false,
    required: def.required,
    phase: def.phase,
    path,
    message: looksMissing(combined)
      ? 'CLI not found'
      : (firstLine(combined) ?? 'Version check failed'),
  };
}

function inspectLlm(def: EngineDefinition): EngineHealthStatus {
  const configured = Boolean(
    process.env.CAPABILITY_SCAN_LLM_PROVIDER ||
      process.env.CAPABILITY_SCAN_LOCAL_LLM_URL ||
      process.env.CAPABILITY_SCAN_LLM_BASE_URL,
  );
  return {
    engine: def.engine,
    available: configured,
    required: def.required,
    phase: def.phase,
    message: configured ? 'LLM provider configured' : 'LLM provider is selected per scan request',
  };
}

function failedStatus(def: EngineDefinition, error: unknown): EngineHealthStatus {
  const message = error instanceof Error ? error.message : String(error);
  return {
    engine: def.engine,
    available: false,
    required: def.required,
    phase: def.phase,
    path: def.envKey && def.fallback ? resolveBin(def.envKey, def.fallback) : undefined,
    message: firstLine(message) ?? 'Engine status check failed',
  };
}

async function inspectSnykAgentScan(def: EngineDefinition): Promise<EngineHealthStatus> {
  const { command, prefixArgs } = resolveSnykAgentScanInvocation();
  const result = await runCli(command, [...prefixArgs, 'help'], {
    timeoutMs: 60_000,
    shell: false,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  const version = firstLine(combined);
  const missing = looksMissing(combined);
  const path = prefixArgs.length > 0 ? `${command} ${prefixArgs.join(' ')}` : command;
  if (result.ok || (version && !missing)) {
    return {
      engine: def.engine,
      available: true,
      required: def.required,
      phase: def.phase,
      path,
      version,
      message: prefixArgs.length > 0 ? 'uvx launcher' : undefined,
    };
  }
  return {
    engine: def.engine,
    available: false,
    required: def.required,
    phase: def.phase,
    path,
    message: missing ? 'CLI not found' : (firstLine(combined) ?? 'Help check failed'),
  };
}

export async function getCapabilityEngineStatuses(): Promise<EngineHealthStatus[]> {
  const statuses: EngineHealthStatus[] = [];
  for (const def of ENGINE_DEFINITIONS) {
    if (!SKILL_MCP_ENGINE_NAMES.includes(def.engine as (typeof SKILL_MCP_ENGINE_NAMES)[number])) {
      continue;
    }
    try {
      if (def.engine === 'llm') {
        statuses.push(inspectLlm(def));
        continue;
      }
      if (def.engine === 'skillspector') {
        statuses.push(await inspectSkillspector(def));
        continue;
      }
      if (def.engine === 'snyk_agent_scan') {
        statuses.push(await inspectSnykAgentScan(def));
        continue;
      }
      statuses.push(await inspectCli(def));
    } catch (error) {
      statuses.push(failedStatus(def, error));
    }
  }
  return statuses;
}
