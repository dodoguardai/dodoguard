import {
  agentDepartment,
  agentScene,
  type CreationMode,
} from '@/features/compliance-detection/compliance-precheck';
import { assetIntakeApi } from '@/services/api/asset-intake';
import type { AgentAsset, SecurityCaseLibrary, TargetAgent } from '@/types/entities';
import { pickRecommendedLibraryEntriesForAgent } from './dialogue-capability-signals';
import type { AssessScenario } from './dialogue-security-wizard-ui';

export type RecommendedDialogueLibrary = {
  id: string;
  title: string;
  domain: string;
  caseCount: number;
  enabled: boolean;
  reason?: string;
};

export type DialoguePrecheckStep = {
  key: string;
  title: string;
  description: string;
  status: 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
};

export type DialoguePrecheckResult = {
  apiStatus: 'passed' | 'failed' | 'skipped';
  apiMessage?: string;
  responseTimeMs?: number;
  endpointConfigured: boolean;
  availableLibraryCount: number;
  recommendedLibraries: RecommendedDialogueLibrary[];
  warnings: string[];
  estimatedCaseCount: number;
  agent: {
    name: string;
    department: string;
    scene: string;
    environment: string;
    admissionStatus: string;
  };
};

export type DialogueTaskMetrics = {
  libraries: number;
  cases: number;
  rounds: number;
  minutes: number;
};

export function assetRuntimeConfig(asset?: AgentAsset): Record<string, unknown> {
  const config = asset?.metadata?.runtimeConfig;
  return config && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

export function hasRuntimeEndpoint(asset?: AgentAsset): boolean {
  const config = assetRuntimeConfig(asset);
  return Boolean(
    String(config.apiBaseUrl || '').trim() ||
      String(config.webhookUrl || '').trim() ||
      config.agentType === 'tencent-adp',
  );
}

export function assetPrimaryOwner(asset?: AgentAsset): string {
  return (
    asset?.owners?.find((owner) => owner.isPrimary)?.ownerName ||
    asset?.owners?.find((owner) => owner.ownerType === 'security')?.ownerName ||
    '安全负责人'
  );
}

function probePayloadFromAsset(asset: AgentAsset) {
  const config = assetRuntimeConfig(asset);
  return {
    type: String(config.agentType || 'http') as TargetAgent['type'],
    name: asset.name,
    config,
  };
}

function toRecommendedLibrary(
  library: SecurityCaseLibrary,
  reason?: string,
): RecommendedDialogueLibrary {
  return {
    id: library.id,
    title: library.title,
    domain: library.domain,
    caseCount: library.caseCount,
    enabled: library.enabled,
    reason,
  };
}

export function recommendLibrariesForAgent(
  agent: AgentAsset,
  libraries: SecurityCaseLibrary[],
  assessScenario: AssessScenario,
): RecommendedDialogueLibrary[] {
  const enabledLibraries = libraries.filter((library) => library.enabled);
  if (enabledLibraries.length === 0) {
    return [];
  }

  return pickRecommendedLibraryEntriesForAgent(agent, enabledLibraries, assessScenario).map((entry) =>
    toRecommendedLibrary(entry.library, entry.reason),
  );
}

export type DialoguePrecheckStepDef = {
  title: string;
  heroTitle: string;
  description: string;
};

export function buildDialoguePrecheckSteps(agent: AgentAsset): DialoguePrecheckStepDef[] {
  const config = assetRuntimeConfig(agent);
  const endpoint =
    String(config.apiBaseUrl || '').trim() ||
    String(config.webhookUrl || '').trim() ||
    '未配置';
  return [
    {
      title: '连接 Agent API',
      heroTitle: '正在进行：连接 Agent API',
      description: '校验接口联通、鉴权与响应时延',
    },
    {
      title: '读取接入配置',
      heroTitle: '正在进行：读取接入配置',
      description: `${String(config.agentType || 'http')} · ${endpoint}`,
    },
    {
      title: '统计对话安全用例库',
      heroTitle: '正在进行：识别可用检测库',
      description: '识别可通过对话 API 执行的攻击场景库',
    },
    {
      title: '匹配评估方案',
      heroTitle: '正在进行：匹配评估方案',
      description: `${agentScene(agent)} · 按业务场景推荐对话测试子场景`,
    },
  ];
}

export async function runDialoguePrecheck(
  agent: AgentAsset,
  libraries: SecurityCaseLibrary[],
  assessScenario: AssessScenario,
): Promise<DialoguePrecheckResult> {
  const endpointConfigured = hasRuntimeEndpoint(agent);
  const enabledLibraries = libraries.filter((library) => library.enabled);
  const enabledCaseCount = enabledLibraries.reduce((sum, library) => sum + library.caseCount, 0);
  const warnings: string[] = [];

  let apiStatus: DialoguePrecheckResult['apiStatus'] = 'skipped';
  let apiMessage: string | undefined;
  let responseTimeMs: number | undefined;

  if (endpointConfigured) {
    try {
      const probe = await assetIntakeApi.probeRuntime(probePayloadFromAsset(agent));
      apiStatus = probe.status === 'success' ? 'passed' : 'failed';
      apiMessage = probe.message;
      responseTimeMs = probe.durationMs ?? probe.responseTime;
    } catch (error) {
      apiStatus = 'failed';
      apiMessage = error instanceof Error ? error.message : 'API 探测失败';
    }
  } else {
    apiStatus = 'failed';
    apiMessage = '未配置 API Base URL 或 Webhook，请先在资产入库补充接入配置';
  }

  if (!endpointConfigured) {
    warnings.push('Agent 接入配置不完整，无法执行 API 对话检测');
  }
  if (apiStatus === 'failed') {
    warnings.push(apiMessage || 'API 联通失败，请修复接入后重试');
  }
  if (enabledLibraries.length === 0) {
    warnings.push('暂无已启用的对话安全测试用例库，请先在用例库中启用');
  } else if (enabledCaseCount <= 0) {
    warnings.push('已启用的对话安全测试用例库暂无可执行用例，请先导入或发布测试用例');
  }
  if (!agent.owners?.some((owner) => owner.isPrimary)) {
    warnings.push('Agent 未配置主责负责人，创建任务后将使用默认安全负责人');
  }

  const recommendedLibraries = recommendLibrariesForAgent(agent, libraries, assessScenario);

  return {
    apiStatus,
    apiMessage,
    responseTimeMs,
    endpointConfigured,
    availableLibraryCount: enabledLibraries.length,
    recommendedLibraries,
    warnings,
    estimatedCaseCount: recommendedLibraries.reduce((sum, lib) => sum + lib.caseCount, 0),
    agent: {
      name: agent.name,
      department: agentDepartment(agent),
      scene: agentScene(agent),
      environment: agent.environment || '未设置',
      admissionStatus: agent.admissionStatus || '未知',
    },
  };
}

export function computeDialogueTaskMetrics(
  libraries: SecurityCaseLibrary[],
  selectedLibIds: string[],
): DialogueTaskMetrics {
  const selected = libraries.filter((library) => selectedLibIds.includes(library.id));
  const cases = selected.reduce((sum, library) => sum + library.caseCount, 0);
  const rounds = Math.max(cases, Math.round(cases * 1.15));
  const minutes = Math.max(5, Math.round(Math.max(cases, 1) * 0.35));
  return {
    libraries: selected.length,
    cases,
    rounds,
    minutes,
  };
}

export function resolveLibrariesForDialogueMode(
  mode: CreationMode,
  precheck: DialoguePrecheckResult,
  libraries: SecurityCaseLibrary[],
  scanStrategy: 'full' | 'custom',
): string[] {
  if (mode === 'ai') {
    return precheck.recommendedLibraries.map((library) => library.id);
  }
  if (scanStrategy === 'full') {
    return libraries
      .filter((library) => library.enabled)
      .map((library) => library.id);
  }
  return [];
}

export function formatAgentOptionLabel(agent: AgentAsset): string {
  return `${agent.name} · ${agentDepartment(agent)}`;
}
