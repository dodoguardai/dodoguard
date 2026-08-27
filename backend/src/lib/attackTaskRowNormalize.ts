/**
 * Normalize attack_tasks row JSON columns after DB read (MySQL legacy TEXT / string JSON).
 */

import { ATTACK_TASK_EXECUTION_LIMITS, clampExecutionInt } from './attackTaskExecutionLimits';

export type AttackTaskKind =
  | 'api_test'
  | 'config_audit'
  | 'config_static'
  | 'single_test'
  | 'commercial_api_test';

/** Metadata.runSource value for commercial custom API scans (UI label: 商业API). */
export const ATTACK_TASK_RUN_SOURCE_COMMERCIAL_API = 'commercial_api';

/** Metadata.runSource value for ad-hoc single-prompt tests (UI label: 单次). */
export const ATTACK_TASK_RUN_SOURCE_SINGLE = 'single';

export function safeJsonParseField<T>(value: unknown, fallback: T): T {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const s = value.trim();
  if (s === '') {
    return fallback;
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function parseAttackTaskVulnerabilities(value: unknown): string[] {
  const parsed = safeJsonParseField<unknown>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((v) => String(v)).filter(Boolean);
}

export function coerceBooleanFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
}

export type NormalizedDetectionConfig = {
  useRule: boolean;
  useLLM: boolean;
  useKnowledgeBase: boolean;
  ruleSetId?: string;
  llmConfig?: { model?: string; confidenceThreshold?: number; successDescription?: string };
};

export function parseAttackTaskDetectionConfig(value: unknown): NormalizedDetectionConfig {
  const raw = safeJsonParseField<Record<string, unknown>>(value, {});
  const llmRaw =
    raw.llmConfig && typeof raw.llmConfig === 'object' && !Array.isArray(raw.llmConfig)
      ? (raw.llmConfig as Record<string, unknown>)
      : undefined;
  return {
    useRule: coerceBooleanFlag(raw.useRule),
    useLLM: coerceBooleanFlag(raw.useLLM),
    useKnowledgeBase: coerceBooleanFlag(raw.useKnowledgeBase),
    ...(typeof raw.ruleSetId === 'string' && raw.ruleSetId.trim()
      ? { ruleSetId: raw.ruleSetId.trim() }
      : {}),
    ...(llmRaw
      ? {
          llmConfig: {
            ...(typeof llmRaw.model === 'string' && llmRaw.model.trim()
              ? { model: llmRaw.model.trim() }
              : {}),
            ...(typeof llmRaw.confidenceThreshold === 'number'
              ? { confidenceThreshold: llmRaw.confidenceThreshold }
              : {}),
            ...(typeof llmRaw.successDescription === 'string'
              ? { successDescription: llmRaw.successDescription }
              : {}),
          },
        }
      : {}),
  };
}

export function parseAttackTaskMetadata(value: unknown): Record<string, unknown> {
  return safeJsonParseField<Record<string, unknown>>(value, {});
}

export type AttackTaskExecutionSettings = {
  delayMs: number;
  maxConcurrency: number;
  timeoutMs: number;
  retryStrategy: {
    maxRetries: number;
    retryDelayMs: number;
  };
  notifications: {
    onComplete: boolean;
    onVulnerabilityFound: boolean;
    onFailure: boolean;
  };
};

/**
 * Parse wizard "advancedSettings" from task metadata.
 * Returns undefined when the task has no execution settings (legacy tasks keep runner defaults).
 */
export function parseAttackTaskExecutionSettings(
  metadata?: Record<string, unknown> | null,
): AttackTaskExecutionSettings | undefined {
  const raw = metadata?.advancedSettings;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const settings = raw as Record<string, unknown>;
  const retryRaw =
    settings.retryStrategy &&
    typeof settings.retryStrategy === 'object' &&
    !Array.isArray(settings.retryStrategy)
      ? (settings.retryStrategy as Record<string, unknown>)
      : undefined;
  const notifyRaw =
    settings.notifications &&
    typeof settings.notifications === 'object' &&
    !Array.isArray(settings.notifications)
      ? (settings.notifications as Record<string, unknown>)
      : undefined;

  const L = ATTACK_TASK_EXECUTION_LIMITS;

  return {
    delayMs: clampExecutionInt(settings.delayMs, L.delayMs),
    maxConcurrency: clampExecutionInt(settings.maxConcurrency, L.maxConcurrency),
    timeoutMs: clampExecutionInt(settings.timeout, L.timeoutMs),
    retryStrategy: {
      maxRetries: clampExecutionInt(retryRaw?.maxRetries, L.maxRetries),
      retryDelayMs: clampExecutionInt(retryRaw?.retryDelay, L.retryDelayMs),
    },
    notifications: {
      onComplete: coerceBooleanFlag(notifyRaw?.onComplete),
      onVulnerabilityFound: coerceBooleanFlag(notifyRaw?.onVulnerabilityFound),
      onFailure: coerceBooleanFlag(notifyRaw?.onFailure),
    },
  };
}

/**
 * Resolve task kind from metadata.taskKind and/or product task_types.code (MySQL v4).
 */
export function resolveAttackTaskKind(input: {
  metadata?: Record<string, unknown> | null;
  scanMode?: string | null;
  taskTypeCode?: string | null;
}): AttackTaskKind | undefined {
  const mk = input.metadata?.taskKind;
  if (
    mk === 'api_test' ||
    mk === 'config_audit' ||
    mk === 'config_static' ||
    mk === 'single_test' ||
    mk === 'commercial_api_test'
  ) {
    return mk;
  }

  if (input.metadata?.runSource === ATTACK_TASK_RUN_SOURCE_COMMERCIAL_API) {
    return 'commercial_api_test';
  }

  if (input.metadata?.runSource === ATTACK_TASK_RUN_SOURCE_SINGLE) {
    return 'single_test';
  }

  const code = String(input.taskTypeCode ?? '').toLowerCase();
  if (code.includes('config_static')) {
    return 'config_static';
  }
  if (code.includes('config_audit')) {
    return 'config_audit';
  }
  if (code.includes('api_scan') || code.includes('api_test')) {
    return 'api_test';
  }

  const sm = String(input.scanMode ?? '').toLowerCase();
  if (sm === 'runtime') {
    return 'api_test';
  }
  if (sm === 'static') {
    if (code.includes('config_static')) {
      return 'config_static';
    }
    if (code.includes('config_audit')) {
      return 'config_audit';
    }
  }

  return undefined;
}
