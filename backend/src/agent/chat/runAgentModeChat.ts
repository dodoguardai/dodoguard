/**
 * Agent mode chat — Integration LLM + system_config + bundled Claude-style skills.
 */

import { createTaskSchema } from '../../schemas/attackTaskSchema';
import { resolveLlmProviderPayloadForRuntime } from '../../lib/resolve-llm-provider-runtime';
import logger from '../../logger';
import { loadApiProvider } from '../../providers';
import { extractFirstBalancedJsonObject } from '../../util/extractBalancedJson';
import { buildBundledSkillsSystemInjection } from '../skills';
import { getAgentModeConfig } from '../config';

export type AgentModeChatMessage = { role: 'user' | 'assistant'; content: string };

export type AgentModeChatParams = {
  surface: string;
  targetAgentId?: string;
  pinnedSkillSlug?: string | null;
  messages: AgentModeChatMessage[];
};

export type AgentModeChatResult = {
  assistant: string;
  draftTask?: unknown;
  validation?: { ok: boolean; errors?: unknown };
  providerId?: string;
};

function extractDraftJsonFromAssistant(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : text.trim();
  const balanced = extractFirstBalancedJsonObject(inner) ?? extractFirstBalancedJsonObject(text);
  if (!balanced) {
    return null;
  }
  try {
    return JSON.parse(balanced);
  } catch {
    return null;
  }
}

const CORE_SKILL_SLUG = 'core-task-builder';

export async function runAgentModeChat(params: AgentModeChatParams): Promise<AgentModeChatResult> {
  const agentCfg = await getAgentModeConfig();
  const payload = await resolveLlmProviderPayloadForRuntime({
    preferredModelId: agentCfg.llmModelId,
  });

  if (!payload) {
    throw new Error('No LLM model configured. Add an enabled Chat model under Settings → Models.');
  }

  if (agentCfg.llmModelId && !payload.matchedSelection) {
    logger.debug('[agentModeChat] llmModelId did not match a managed model; using fallback', {
      preferred: String(agentCfg.llmModelId).slice(0, 120),
    });
  }

  const skillBlock = buildBundledSkillsSystemInjection(
    CORE_SKILL_SLUG,
    params.pinnedSkillSlug || null,
  );

  const ctxLines = [
    `Attack surface (platform family): ${params.surface}`,
    params.targetAgentId
      ? `Target agent id (user-selected): ${params.targetAgentId}`
      : 'Target agent id: not specified',
  ].join('\n');

  const systemParts = [
    agentCfg.systemPrompt,
    ctxLines,
    skillBlock ? `## Bundled skills (instructions)\n\n${skillBlock}` : '',
  ].filter(Boolean);

  const systemContent = systemParts.join('\n\n');

  const providerMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemContent },
    ...params.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ];

  const prompt = JSON.stringify(providerMessages);

  const apiProvider = await loadApiProvider(payload.id, {
    options: {
      id: payload.id,
      config: {
        ...(typeof payload.config === 'object' && payload.config ? payload.config : {}),
        ...(agentCfg.temperature !== undefined ? { temperature: agentCfg.temperature } : {}),
        ...(agentCfg.maxTokens !== undefined ? { max_tokens: agentCfg.maxTokens } : {}),
      },
    },
  });

  const timeoutMs = Math.max(
    1,
    Number.parseInt(
      process.env.AGENT_MODE_CHAT_TIMEOUT_MS ||
        process.env.ATTACK_TASK_JUDGE_TIMEOUT_MS ||
        '120000',
      10,
    ) || 120_000,
  );

  const judgeResponse: any = await Promise.race([
    apiProvider.callApi(prompt, {
      prompt,
      vars: {},
    } as any),
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Agent mode chat timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);

  if (judgeResponse?.error) {
    throw new Error(String(judgeResponse.error));
  }

  const rawOut = judgeResponse?.output;
  let assistant: string;
  if (rawOut == null || rawOut === undefined) {
    assistant = '';
  } else if (typeof rawOut === 'string') {
    assistant = rawOut;
  } else {
    try {
      assistant = JSON.stringify(rawOut);
    } catch {
      assistant = String(rawOut);
    }
  }

  const draftParsed = extractDraftJsonFromAssistant(assistant);
  let validation: AgentModeChatResult['validation'];
  let draftTask: unknown;

  if (draftParsed !== null) {
    const parsed = createTaskSchema.safeParse(draftParsed);
    if (parsed.success) {
      draftTask = parsed.data;
      validation = { ok: true };
    } else {
      draftTask = draftParsed;
      validation = { ok: false, errors: parsed.error.flatten() };
    }
  }

  return {
    assistant,
    draftTask,
    validation,
    providerId: payload.id,
  };
}
