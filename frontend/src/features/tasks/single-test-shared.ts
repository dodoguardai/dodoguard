import type { TargetAgent, TaskType } from '@/types/entities';

export const SINGLE_TEST_MAX_CONFIG_BYTES = 5 * 1024 * 1024;

export function platformFamilyFromAgent(agent: TargetAgent | undefined): string {
  const t = String(agent?.type ?? '').toLowerCase();
  if (t === 'coze') {
    return 'coze';
  }
  if (t === 'fastgpt') {
    return 'fastgpt';
  }
  if (t === 'n8n') {
    return 'n8n';
  }
  return 'dify';
}

export function agentUsesJsonConfig(agent: TargetAgent | undefined): boolean {
  const t = String(agent?.type ?? '').toLowerCase();
  return t === 'fastgpt' || t === 'n8n';
}

export function resolveV4ForSingleTest(taskTypes: TaskType[], platformFamily: string) {
  const taskTypeId = taskTypes.find((t) => t.code === 'dify_api_scan')?.id;
  return {
    ...(taskTypeId ? { taskTypeId } : {}),
    platformFamily,
    scanMode: 'runtime' as const,
  };
}

/** 单次测试 scanMode：仅指令 → runtime；仅配置 → static；两者都有 → hybrid */
export function resolveSingleTestScanMode(
  hasPrompt: boolean,
  hasConfig: boolean,
): 'runtime' | 'static' | 'hybrid' {
  if (hasPrompt && hasConfig) {
    return 'hybrid';
  }
  if (hasConfig) {
    return 'static';
  }
  return 'runtime';
}
