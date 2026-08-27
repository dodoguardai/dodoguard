import { getEnvString } from '../../envars';
import logger from '../../logger';

import type { EnvVarKey } from '../../envars';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { EnvOverrides } from '../../types/env';
import type { OpenAiSharedOptions } from './types';

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;

  config: OpenAiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    // Ensure config is always an object, preserving apiKey and apiBaseUrl
    // 重要：如果 config 存在，使用它；否则使用空对象
    // 这样可以确保 apiKey 和 apiBaseUrl 被正确传递
    // 使用深拷贝确保所有属性（包括 apiKey 和 apiBaseUrl）被保留
    this.config = config ? { ...config } : {};
    this.id = id ? () => id : this.id;

    // Debug: Log config to verify apiKey is present
    logger.debug(
      `[OpenAiGenericProvider] Constructor: modelName=${modelName}, has config=${!!config}, config keys=${config ? Object.keys(config).join(', ') : 'none'}, has apiKey=${!!config?.apiKey}, has apiBaseUrl=${!!config?.apiBaseUrl}`,
    );
    if (config?.apiKey) {
      logger.debug(
        `[OpenAiGenericProvider] Constructor: apiKey=${(config.apiKey as string).substring(0, 10)}...`,
      );
    }
    if (config?.apiBaseUrl) {
      logger.debug(`[OpenAiGenericProvider] Constructor: apiBaseUrl=${config.apiBaseUrl}`);
    }
    logger.debug(
      `[OpenAiGenericProvider] Constructor: this.config keys=${Object.keys(this.config).join(', ')}, has apiKey=${!!this.config.apiKey}, has apiBaseUrl=${!!this.config.apiBaseUrl}`,
    );
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      this.env?.OPENAI_ORGANIZATION ||
      getEnvString('OPENAI_ORGANIZATION')
    );
  }

  getApiUrlDefault(): string {
    return 'https://api.openai.com/v1';
  }

  getApiUrl(): string {
    // 优先使用 config 中的 apiBaseUrl（如果已设置）
    // 这对于使用自定义 API endpoint 的场景很重要（如阿里云 DashScope）
    if (this.config.apiBaseUrl) {
      logger.debug(
        `[OpenAiGenericProvider] getApiUrl: Using config.apiBaseUrl=${this.config.apiBaseUrl}`,
      );
      return this.config.apiBaseUrl;
    }

    const apiHost =
      this.config.apiHost || this.env?.OPENAI_API_HOST || getEnvString('OPENAI_API_HOST');
    if (apiHost) {
      const url = `https://${apiHost}/v1`;
      logger.debug(`[OpenAiGenericProvider] getApiUrl: Using apiHost=${apiHost}, url=${url}`);
      return url;
    }

    const url =
      this.env?.OPENAI_API_BASE_URL ||
      this.env?.OPENAI_BASE_URL ||
      getEnvString('OPENAI_API_BASE_URL') ||
      getEnvString('OPENAI_BASE_URL') ||
      this.getApiUrlDefault();
    logger.debug(
      `[OpenAiGenericProvider] getApiUrl: Final URL=${url}, config.apiBaseUrl=${this.config.apiBaseUrl || '未设置'}`,
    );
    return url;
  }

  getApiKey(): string | undefined {
    const apiKey =
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY');

    // Debug: Log apiKey retrieval
    logger.debug(
      `[OpenAiGenericProvider] getApiKey: has this.config.apiKey=${!!this.config.apiKey}, has env=${!!this.env}, result=${!!apiKey}`,
    );
    if (!apiKey) {
      logger.debug(
        `[OpenAiGenericProvider] getApiKey: config keys=${Object.keys(this.config).join(', ')}`,
      );
    }

    return apiKey;
  }

  requiresApiKey(): boolean {
    return this.config.apiKeyRequired ?? true;
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    _prompt: string,
    _context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}
