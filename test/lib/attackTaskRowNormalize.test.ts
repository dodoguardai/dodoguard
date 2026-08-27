import {
  coerceBooleanFlag,
  parseAttackTaskDetectionConfig,
  parseAttackTaskExecutionSettings,
  parseAttackTaskVulnerabilities,
  resolveAttackTaskKind,
} from '../../backend/src/lib/attackTaskRowNormalize';

describe('parseAttackTaskVulnerabilities', () => {
  it('parses JSON string arrays from legacy MySQL rows', () => {
    expect(parseAttackTaskVulnerabilities('["a","b"]')).toEqual(['a', 'b']);
  });

  it('returns empty array for invalid values', () => {
    expect(parseAttackTaskVulnerabilities(null)).toEqual([]);
    expect(parseAttackTaskVulnerabilities('not-json')).toEqual([]);
  });
});

describe('parseAttackTaskDetectionConfig', () => {
  it('coerces string booleans for useLLM', () => {
    const cfg = parseAttackTaskDetectionConfig('{"useRule":"true","useLLM":"true"}');
    expect(cfg.useRule).toBe(true);
    expect(cfg.useLLM).toBe(true);
  });
});

describe('coerceBooleanFlag', () => {
  it('accepts common truthy string forms', () => {
    expect(coerceBooleanFlag('true')).toBe(true);
    expect(coerceBooleanFlag('1')).toBe(true);
    expect(coerceBooleanFlag('false')).toBe(false);
  });
});

describe('parseAttackTaskExecutionSettings', () => {
  it('returns undefined when advancedSettings is missing', () => {
    expect(parseAttackTaskExecutionSettings({})).toBeUndefined();
    expect(parseAttackTaskExecutionSettings({ taskKind: 'api_test' })).toBeUndefined();
  });

  it('parses wizard advancedSettings with defaults for nested fields', () => {
    expect(
      parseAttackTaskExecutionSettings({
        advancedSettings: {
          delayMs: 500,
          maxConcurrency: 3,
          timeout: 45000,
          retryStrategy: { maxRetries: 2, retryDelay: 2000 },
          notifications: {
            onComplete: true,
            onVulnerabilityFound: 'true',
            onFailure: false,
          },
        },
      }),
    ).toEqual({
      delayMs: 500,
      maxConcurrency: 3,
      timeoutMs: 45000,
      retryStrategy: { maxRetries: 2, retryDelayMs: 2000 },
      notifications: {
        onComplete: true,
        onVulnerabilityFound: true,
        onFailure: false,
      },
    });
  });

  it('clamps out-of-range values when parsing', () => {
    expect(
      parseAttackTaskExecutionSettings({
        advancedSettings: {
          delayMs: 999_999,
          maxConcurrency: 99,
          timeout: 1,
          retryStrategy: { maxRetries: 20, retryDelay: 1 },
        },
      }),
    ).toEqual({
      delayMs: 60_000,
      maxConcurrency: 5,
      timeoutMs: 5_000,
      retryStrategy: { maxRetries: 5, retryDelayMs: 500 },
      notifications: {
        onComplete: false,
        onVulnerabilityFound: false,
        onFailure: false,
      },
    });
  });
});

describe('resolveAttackTaskKind', () => {
  it('prefers metadata.taskKind', () => {
    expect(
      resolveAttackTaskKind({
        metadata: { taskKind: 'config_static' },
        taskTypeCode: 'dify_api_scan',
      }),
    ).toBe('config_static');
  });

  it('falls back to task type code', () => {
    expect(
      resolveAttackTaskKind({
        metadata: {},
        taskTypeCode: 'dify_config_static',
        scanMode: 'static',
      }),
    ).toBe('config_static');
  });

  it('uses scanMode static with task type code when metadata.taskKind is missing', () => {
    expect(
      resolveAttackTaskKind({
        metadata: {},
        taskTypeCode: 'dify_config_audit',
        scanMode: 'static',
      }),
    ).toBe('config_audit');
  });

  it('resolves commercial_api_test from metadata and runSource', () => {
    expect(
      resolveAttackTaskKind({
        metadata: { taskKind: 'commercial_api_test' },
        taskTypeCode: 'commercial_api_scan',
      }),
    ).toBe('commercial_api_test');
    expect(
      resolveAttackTaskKind({
        metadata: { runSource: 'commercial_api' },
        taskTypeCode: 'commercial_api_scan',
      }),
    ).toBe('commercial_api_test');
  });
});
