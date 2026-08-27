import { systemConfigService } from '../services/systemConfigService';

export const AGENT_MODE_CONFIG_KEY = 'agent_mode_config';

export type AgentModeConfigShape = {
  llmModelId: string | null;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  maxHarnessRepairAttempts?: number;
};

const defaults: AgentModeConfigShape = {
  llmModelId: null,
  systemPrompt:
    'You are DodoGuard security testing task orchestrator. Produce valid attack task drafts as JSON when asked.',
  temperature: 0.2,
  maxTokens: 4096,
  maxHarnessRepairAttempts: 2,
};

export function normalizeAgentModeConfig(raw: unknown): AgentModeConfigShape {
  if (!raw || typeof raw !== 'object') {
    return { ...defaults };
  }
  const o = raw as Record<string, unknown>;
  const llmRaw = o.llmModelId;
  const llmModelId =
    typeof llmRaw === 'string' && llmRaw.trim() !== ''
      ? llmRaw.trim()
      : llmRaw === null
        ? null
        : defaults.llmModelId;
  const systemPrompt =
    typeof o.systemPrompt === 'string' && o.systemPrompt.trim() !== ''
      ? o.systemPrompt.trim()
      : defaults.systemPrompt;
  return {
    llmModelId,
    systemPrompt,
    temperature: typeof o.temperature === 'number' ? o.temperature : defaults.temperature,
    maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : defaults.maxTokens,
    maxHarnessRepairAttempts:
      typeof o.maxHarnessRepairAttempts === 'number'
        ? o.maxHarnessRepairAttempts
        : defaults.maxHarnessRepairAttempts,
  };
}

export async function getAgentModeConfig(): Promise<AgentModeConfigShape> {
  const raw = await systemConfigService.getConfig(AGENT_MODE_CONFIG_KEY);
  return normalizeAgentModeConfig(raw);
}
