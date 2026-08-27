import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { z } from 'zod';
import {
  loadDifyPentestConfigFromFile,
  validateDifyPentestConfig,
} from '../../dify-pentest/configLoader';
import { type ScanTaskInput, scanTaskSchema } from '../../schemas/attackTaskSchema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Detect native dify-pentest YAML (v1 or v2). */
export function isDifyPentestConfig(raw: unknown): boolean {
  if (!isRecord(raw)) {
    return false;
  }
  if (raw.dify || raw.modules) {
    return true;
  }
  if (raw.target && raw.task) {
    return true;
  }
  return false;
}

export function loadRawConfigFile(configPath: string): unknown {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${resolved}`);
  }
  const ext = path.extname(resolved).toLowerCase();
  const text = fs.readFileSync(resolved, 'utf8');
  if (ext === '.json') {
    return JSON.parse(text);
  }
  return yaml.load(text);
}

export function loadScanTaskConfig(configPath: string): {
  task: ScanTaskInput;
  isNativeDifyPentest: boolean;
  configDir: string;
} {
  const resolved = path.resolve(configPath);
  const raw = loadRawConfigFile(resolved);
  const configDir = path.dirname(resolved);

  if (isDifyPentestConfig(raw)) {
    const wrapped: ScanTaskInput = {
      name:
        isRecord(raw) && typeof raw.description === 'string'
          ? raw.description
          : 'Dify pentest scan',
      targetType: 'platform',
      targetConfig: {},
      vulnerabilities: ['agent-prompt-injection'],
      attackMode: 'simple',
      detectionConfig: {
        useRule: true,
        useLLM: false,
        useKnowledgeBase: false,
      },
      platformFamily: 'dify',
      scanMode: 'runtime',
      runnerConfigPath: resolved,
      metadata: {
        creationMode: 'cli',
        wrappedFrom: 'dify-pentest-config',
      },
    };
    return { task: wrapped, isNativeDifyPentest: true, configDir };
  }

  const parsed = scanTaskSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid scan task configuration:\n${message}`);
  }

  return { task: parsed.data, isNativeDifyPentest: false, configDir };
}

export async function validateScanTaskConfig(configPath: string): Promise<{
  valid: boolean;
  task?: ScanTaskInput;
  errors?: string[];
}> {
  try {
    const { task, isNativeDifyPentest } = loadScanTaskConfig(configPath);
    if (isNativeDifyPentest) {
      const difyConfig = await loadDifyPentestConfigFromFile(configPath);
      const validation = validateDifyPentestConfig(difyConfig);
      if (!validation.valid) {
        return { valid: false, errors: validation.errors };
      }
    }
    return { valid: true, task };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
