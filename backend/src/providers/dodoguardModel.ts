import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch/index';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/providers';

// Define types for the expected model API response structure
interface ModelMessage {
  role: string;
  content: string;
  refusal?: string | null;
}

interface ModelChoice {
  index: number;
  message: ModelMessage;
  finish_reason: string;
  native_finish_reason?: string;
  logprobs?: any | null;
}

interface ModelUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface ModelApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  provider?: string;
  choices: ModelChoice[];
  usage: ModelUsage;
  system_fingerprint?: string;
}

interface DodoguardModelOptions extends ProviderOptions {
  model: string;
  config?: Record<string, any>;
}

/**
 * Provider that connects to the DodoGuard model task of the server.
 */
export class DodoguardModelProvider implements ApiProvider {
  private readonly model: string;
  readonly config: Record<string, any>;

  constructor(model: string, options: DodoguardModelOptions = { model: '' }) {
    this.model = model || options.model;
    if (!this.model) {
      throw new Error('Model name is required for DodoguardModelProvider');
    }
    this.config = options.config || {};
    logger.debug(`[DodoguardModel] Initialized with model: ${this.model}`);
  }

  id() {
    return `dodoguard:model:${this.model}`;
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    logger.debug(`[DodoguardModel] Calling API with model: ${this.model}`);

    try {
      // Parse the prompt as chat messages if it's a JSON string
      let messages;
      try {
        messages = JSON.parse(prompt);
        if (!Array.isArray(messages)) {
          messages = [{ role: 'user', content: prompt }];
        }
      } catch {
        // If parsing fails, assume it's a single user message
        logger.debug(`[DodoguardModel] Assuming prompt is a single user message`);
        messages = [{ role: 'user', content: prompt }];
      }

      const payload = {
        task: 'dodoguard:model',
        model: this.model,
        messages,
        config: this.config,
      };

      const baseUrl = cloudConfig.getApiHost();
      const url = `${baseUrl}/api/v1/task`; // Use the standard task endpoint (auth is handled conditionally on the server)

      const token = cloudConfig.getApiKey();
      if (!token) {
        throw new Error(
          'No DodoGuard auth token available. Please log in with `dodoguard auth login`',
        );
      }

      const body = JSON.stringify(payload);
      logger.debug('[DodoguardModel] Sending request', { url, payload });
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DodoguardModel task API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      if (!data || !data.result) {
        throw new Error('Invalid response from DodoguardModel task API');
      }

      const modelResponse = data.result as ModelApiResponse;
      logger.debug('[DodoguardModel] Received response', { modelResponse });

      // Extract the completion from the choices
      const completionContent = modelResponse.choices?.[0]?.message?.content || '';

      // Return in the expected format for a provider
      return {
        output: completionContent,
        tokenUsage: {
          total: modelResponse.usage?.total_tokens || 0,
          prompt: modelResponse.usage?.prompt_tokens || 0,
          completion: modelResponse.usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      logger.error(
        `[DodoguardModel] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
