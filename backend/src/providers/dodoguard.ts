import dedent from 'dedent';

import { VERSION } from '../constants';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import {
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
  neverGenerateRemote,
  neverGenerateRemoteForRegularEvals,
} from '../redteam/remoteGeneration';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  PluginConfig,
  ProviderResponse,
  TokenUsage,
} from '../types/index';
import { fetchWithRetries } from '../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from './shared';

interface DodoguardHarmfulCompletionOptions {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;
}

/**
 * Provider for generating harmful/adversarial content using DodoGuard's unaligned models.
 * Used by red team plugins to generate test cases for harmful content categories.
 */
export class DodoguardHarmfulCompletionProvider implements ApiProvider {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;

  constructor(options: DodoguardHarmfulCompletionOptions) {
    this.harmCategory = options.harmCategory;
    this.n = options.n;
    this.purpose = options.purpose;
    this.config = options.config;
  }

  id(): string {
    return `dodoguard:redteam:${this.harmCategory}`;
  }

  toString(): string {
    return `[DodoGuard Harmful Completion Provider ${this.purpose} - ${this.harmCategory}]`;
  }

  async callApi(
    _prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse & { output?: string[] }> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. Harmful content generation requires DodoGuard's unaligned models.

          To enable:
          - Remove DODOGUARD_DISABLE_REMOTE_GENERATION (or DODOGUARD_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or configure an alternative unaligned model provider

          Learn more: https://dodoguard.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const body = {
      email: getUserEmail(),
      harmCategory: this.harmCategory,
      n: this.n,
      purpose: this.purpose,
      version: VERSION,
      config: this.config,
    };

    try {
      logger.debug(
        `[HarmfulCompletionProvider] Calling generate harmful API (${getRemoteGenerationUrlForUnaligned()}) with body: ${JSON.stringify(body)}`,
      );
      // We're using the DodoGuard API to avoid having users provide their own unaligned model.
      const response = await fetchWithRetries(
        getRemoteGenerationUrlForUnaligned(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        580000,
        2,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();

      const validOutputs: string[] = (
        Array.isArray(data.output) ? data.output : [data.output]
      ).filter(
        (item: string | null | undefined): item is string =>
          typeof item === 'string' && item.length > 0,
      );

      return {
        output: validOutputs,
      };
    } catch (err) {
      logger.info(`[HarmfulCompletionProvider] ${err}`);
      return {
        error: `[HarmfulCompletionProvider] ${err}`,
      };
    }
  }
}

interface DodoguardChatCompletionOptions {
  env?: EnvOverrides;
  id?: string;
  jsonOnly: boolean;
  preferSmallModel: boolean;
  task:
    | 'crescendo'
    | 'goat'
    | 'iterative'
    | 'iterative:image'
    | 'iterative:tree'
    | 'judge'
    | 'blocking-question-analysis'
    | 'meta-agent-decision';
}

/**
 * Provider for red team adversarial strategies using DodoGuard's task-specific models.
 * Supports multi-turn attack strategies like crescendo, goat, and iterative attacks.
 */
export class DodoguardChatCompletionProvider implements ApiProvider {
  private options: DodoguardChatCompletionOptions;

  constructor(options: DodoguardChatCompletionOptions) {
    this.options = options;
  }

  id(): string {
    return this.options.id || 'dodoguard:chatcompletion';
  }

  toString(): string {
    return `[DodoGuard Chat Completion Provider]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. This red team strategy requires DodoGuard's task-specific models.

          To enable:
          - Remove DODOGUARD_DISABLE_REMOTE_GENERATION (or DODOGUARD_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or provide OPENAI_API_KEY for local generation (may have lower quality)

          Learn more: https://dodoguard.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const body = {
      jsonOnly: this.options.jsonOnly,
      preferSmallModel: this.options.preferSmallModel,
      prompt,
      step: context?.prompt.label,
      task: this.options.task,
      email: getUserEmail(),
    };

    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      const data = await response.json();

      if (!data.result) {
        logger.error(
          `Error from DodoGuard completion provider. Status: ${response.status} ${response.statusText} ${JSON.stringify(data)} `,
        );
        return {
          error: 'LLM did not return a result, likely refusal',
        };
      }

      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface DodoguardAgentOptions {
  env?: EnvOverrides;
  id?: string;
  instructions?: string;
}

// Task ID constants for simulated user provider
export const REDTEAM_SIMULATED_USER_TASK_ID = 'mischievous-user-redteam';

/**
 * Provider for simulating realistic user conversations using DodoGuard's conversation models.
 * Supports both regular simulated users and adversarial red team users.
 */
export class DodoguardSimulatedUserProvider implements ApiProvider {
  private options: DodoguardAgentOptions;
  private taskId: string;

  constructor(options: DodoguardAgentOptions = {}, taskId: string) {
    this.options = options;
    this.taskId = taskId;
  }

  id(): string {
    return this.options.id || 'dodoguard:agent';
  }

  toString(): string {
    return '[DodoGuard Agent Provider]';
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if this is a redteam task
    const isRedteamTask = this.taskId === REDTEAM_SIMULATED_USER_TASK_ID;

    // For redteam tasks, check the redteam-specific flag
    // For regular tasks, only check the general flag
    const shouldDisable = isRedteamTask
      ? neverGenerateRemote() // Checks both flags
      : neverGenerateRemoteForRegularEvals(); // Only checks general flag

    if (shouldDisable) {
      const relevantFlag = isRedteamTask
        ? 'DODOGUARD_DISABLE_REMOTE_GENERATION or DODOGUARD_DISABLE_REDTEAM_REMOTE_GENERATION'
        : 'DODOGUARD_DISABLE_REMOTE_GENERATION';
      const docsUrl = isRedteamTask
        ? 'https://dodoguard.dev/docs/red-team/configuration#remote-generation'
        : 'https://dodoguard.dev/docs/providers/simulated-user#remote-generation';

      return {
        error: dedent`
          Remote generation is disabled.

          SimulatedUser requires DodoGuard's conversation simulation models.

          To enable, remove ${relevantFlag}

          Learn more: ${docsUrl}
        `,
      };
    }

    const messages = JSON.parse(prompt);
    const body = {
      task: this.taskId,
      instructions: this.options.instructions,
      history: messages,
      email: getUserEmail(),
      version: VERSION,
    };

    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        result: string;
        task: string;
        tokenUsage: TokenUsage;
      };
      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
