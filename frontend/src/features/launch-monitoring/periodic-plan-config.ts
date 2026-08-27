export const periodicFrequencyOptions = [
  ['daily', '每日'],
  ['weekly', '每周'],
  ['monthly', '每月'],
] as const;

export const periodicScopeOptions = [
  ['baseline', '安全基线 + 原失败用例回放'],
  ['capability', 'API 对话 + 能力组件联动'],
  ['knowledge', '知识库 / RAG 专项'],
  ['toolchain', '工具 / MCP / Skill 专项'],
] as const;

export const periodicFailurePolicyOptions = [
  ['notify', '通知负责人'],
  ['remediation', '创建整改项'],
  ['block', '升级安全确认'],
] as const;

export type PeriodicPlanConfig = {
  frequency: (typeof periodicFrequencyOptions)[number][0];
  firstRunAt: string;
  runAtTime: string;
  scope: (typeof periodicScopeOptions)[number][0];
  replayFailedCases: boolean;
  enabled: boolean;
  failurePolicy: (typeof periodicFailurePolicyOptions)[number][0];
};

export function defaultPeriodicPlanConfig(): PeriodicPlanConfig {
  return {
    frequency: 'weekly',
    firstRunAt: new Date().toISOString().slice(0, 10),
    runAtTime: '02:00',
    scope: 'baseline',
    replayFailedCases: true,
    enabled: true,
    failurePolicy: 'remediation',
  };
}

export function labelFromOptions(
  pairs: readonly (readonly [string, string])[],
  value?: string | null,
): string {
  return pairs.find(([key]) => key === value)?.[1] || value || '未设置';
}
