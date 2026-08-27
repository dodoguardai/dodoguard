import type { TargetAgent } from '@/types/entities';

/**
 * 任务创建页用 `surface` 区分 Coze / FastGPT / Dify 的任务类型文案与载荷；
 * 从 Agent 入口跳转时需按 agent 平台设置，避免 `all` 时误走 Dify 分支。
 */
export function surfaceForTaskCreateFromAgentType(
  agentType: TargetAgent['type'],
): 'all' | 'coze' | 'fastgpt' | 'n8n' | 'tencent-adp' {
  if (agentType === 'coze') {
    return 'coze';
  }
  if (agentType === 'fastgpt') {
    return 'fastgpt';
  }
  if (agentType === 'n8n') {
    return 'n8n';
  }
  if (agentType === 'tencent-adp') {
    return 'tencent-adp';
  }
  return 'all';
}
