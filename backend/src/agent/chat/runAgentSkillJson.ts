/**
 * Run a pinned bundled skill against the Agent Mode Chat model and parse JSON.
 * Used by scan recommend services (dialogue / compliance) — same Orchestrator as agent-mode chat.
 */

import { resolveLlmProviderPayloadForRuntime } from '../../lib/resolve-llm-provider-runtime';
import logger from '../../logger';
import { loadApiProvider } from '../../providers';
import { extractFirstBalancedJsonObject } from '../../util/extractBalancedJson';
import { getAgentModeConfig } from '../config';
import { buildBundledSkillsSystemInjection } from '../skills';

export type RunAgentSkillJsonParams = {
  pinnedSkillSlug: string;
  /** Extra system context (portrait, catalog, etc.) */
  contextBlock: string;
  userMessage: string;
  /** When set, skip core-task-builder and only inject this skill */
  skillOnly?: boolean;
  temperature?: number;
};

export type RunAgentSkillJsonResult = {
  raw: string;
  json: unknown;
  providerId: string;
};

function extractJsonFromAssistant(text: string): unknown | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : text.trim();
  const balanced = extractFirstBalancedJsonObject(inner) ?? extractFirstBalancedJsonObject(text);
  if (!balanced) {
    try {
      return JSON.parse(inner);
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(balanced);
  } catch {
    return null;
  }
}

export async function runAgentSkillJson(
  params: RunAgentSkillJsonParams,
): Promise<RunAgentSkillJsonResult> {
  const agentCfg = await getAgentModeConfig();
  const payload = await resolveLlmProviderPayloadForRuntime({
    preferredModelId: agentCfg.llmModelId,
  });

  if (!payload) {
    throw new Error('No LLM model configured. Add an enabled Chat model under Settings → Models.');
  }

  const skillBlock = buildBundledSkillsSystemInjection(
    params.pinnedSkillSlug,
    params.skillOnly ? null : 'core-task-builder',
  );

  if (!skillBlock) {
    throw new Error(`Bundled skill not found: ${params.pinnedSkillSlug}`);
  }

  const systemParts = [
    agentCfg.systemPrompt,
    'You must respond with a single JSON object as specified by the pinned skill. No preamble.',
    params.contextBlock,
    `## Bundled skills (instructions)\n\n${skillBlock}`,
  ].filter(Boolean);

  const providerMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    { role: 'user', content: params.userMessage },
  ];

  const prompt = JSON.stringify(providerMessages);

  const temperature =
    params.temperature ??
    (agentCfg.temperature !== undefined ? Math.min(agentCfg.temperature, 0.3) : 0.2);

  const apiProvider = await loadApiProvider(payload.id, {
    options: {
      id: payload.id,
      config: {
        ...(typeof payload.config === 'object' && payload.config ? payload.config : {}),
        temperature,
        ...(agentCfg.maxTokens !== undefined ? { max_tokens: agentCfg.maxTokens } : {}),
      },
    },
  });

  const timeoutMs = Math.max(
    1,
    Number.parseInt(
      process.env.AGENT_SKILL_JSON_TIMEOUT_MS ||
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
        () => reject(new Error(`Agent skill JSON timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);

  if (judgeResponse?.error) {
    throw new Error(String(judgeResponse.error));
  }

  const rawOut = judgeResponse?.output;
  let raw: string;
  if (rawOut == null) {
    raw = '';
  } else if (typeof rawOut === 'string') {
    raw = rawOut;
  } else {
    try {
      raw = JSON.stringify(rawOut);
    } catch {
      raw = String(rawOut);
    }
  }

  const json = extractJsonFromAssistant(raw);
  if (json === null) {
    logger.warn('[runAgentSkillJson] failed to parse JSON from assistant', {
      skill: params.pinnedSkillSlug,
      preview: raw.slice(0, 240),
    });
    throw new Error('Skill response was not valid JSON');
  }

  return {
    raw,
    json,
    providerId: payload.id,
  };
}
