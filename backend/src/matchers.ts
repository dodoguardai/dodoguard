import path from 'path';

import { loadFromJavaScriptFile } from './assertions/utils';
import cliState from './cliState';
import { getEnvBool, getEnvString } from './envars';
import logger from './logger';
import {
  ANSWER_RELEVANCY_GENERATE,
  CONTEXT_FAITHFULNESS_LONGFORM,
  CONTEXT_FAITHFULNESS_NLI_STATEMENTS,
  CONTEXT_RECALL,
  CONTEXT_RECALL_ATTRIBUTED_TOKEN,
  CONTEXT_RELEVANCE,
  CONTEXT_RELEVANCE_BAD,
  DEFAULT_GRADING_PROMPT,
  GEVAL_PROMPT_EVALUATE,
  GEVAL_PROMPT_STEPS,
  OPENAI_CLOSED_QA_PROMPT,
  DODOGUARD_FACTUALITY_PROMPT,
  SELECT_BEST_PROMPT,
} from './prompts/index';
import { loadApiProvider } from './providers/index';
import { getDefaultProviders } from './providers/defaults';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from './redteam/constants';
import { shouldGenerateRemote } from './redteam/remoteGeneration';
import { doRemoteGrading } from './remoteGrading';
import { doRemoteScoringWithPi } from './remoteScoring';
import { maybeLoadFromExternalFile } from './util/file';
import { isJavascriptFile } from './util/fileExtensions';
import invariant from './util/invariant';
import { extractFirstJsonObject, extractJsonObjects } from './util/json';
import { serializeContext } from './assertions/contextUtils';
import { getNunjucksEngine } from './util/templates';
import { accumulateTokenUsage } from './util/tokenUsageUtils';

import type {
  ApiClassificationProvider,
  ApiEmbeddingProvider,
  ApiModerationProvider,
  ApiProvider,
  ApiSimilarityProvider,
  Assertion,
  GradingConfig,
  GradingResult,
  ProviderOptions,
  ProviderType,
  ProviderTypeMap,
  TokenUsage,
} from './types/index';

class LlmRubricProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRubricProviderError';
  }
}

const nunjucks = getNunjucksEngine(undefined, false, true);

function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

async function loadFromProviderOptions(provider: ProviderOptions) {
  invariant(
    typeof provider === 'object',
    `Provider must be an object, but received a ${typeof provider}: ${provider}`,
  );
  invariant(
    !Array.isArray(provider),
    `Provider must be an object, but received an array: ${JSON.stringify(provider)}`,
  );
  invariant(provider.id, 'Provider supplied to assertion must have an id');
  // TODO(ian): set basepath if invoked from filesystem config

  // 输出详细的 provider 信息到控制台
  console.log('\n' + '='.repeat(80));
  console.log('📦 [loadFromProviderOptions] 接收到的 ProviderOptions');
  console.log('='.repeat(80));
  console.log(`📌 Provider ID: ${provider.id}`);
  console.log(`📦 Provider 有 config: ${!!provider.config}`);
  if (provider.config) {
    console.log(`📦 Config keys: ${Object.keys(provider.config).join(', ')}`);
    console.log(
      `📦 Config.apiKey: ${provider.config.apiKey ? `已设置 (长度: ${provider.config.apiKey.length})` : '未设置'}`,
    );
    console.log(`📦 Config.apiBaseUrl: ${provider.config.apiBaseUrl || '未设置'}`);
    if (provider.config.apiKey) {
      const maskedKey =
        provider.config.apiKey.length > 10
          ? `${provider.config.apiKey.substring(0, 6)}...${provider.config.apiKey.substring(provider.config.apiKey.length - 4)}`
          : '***';
      console.log(`🔑 Config.apiKey (掩码): ${maskedKey}`);
    }
  } else {
    console.log(`⚠️  Provider.config 为 undefined 或 null`);
  }
  console.log('='.repeat(80) + '\n');

  // Debug: Log provider config to verify apiKey is present
  logger.debug(
    `[Grading] loadFromProviderOptions: provider.id=${provider.id}, has config=${!!provider.config}, has apiKey=${!!provider.config?.apiKey}`,
  );
  if (provider.config?.apiKey) {
    logger.debug(
      `[Grading] loadFromProviderOptions: apiKey=${(provider.config.apiKey as string).substring(0, 10)}...`,
    );
  }
  if (provider.config?.apiBaseUrl) {
    logger.debug(`[Grading] loadFromProviderOptions: apiBaseUrl=${provider.config.apiBaseUrl}`);
  }

  return loadApiProvider(provider.id, { options: provider as ProviderOptions });
}

export async function getGradingProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
): Promise<ApiProvider | null> {
  let finalProvider: ApiProvider | null;
  if (typeof provider === 'string') {
    // Defined as a string
    // First, try to find the provider in cliState.config.providers array
    // This ensures we use the configured apiBaseUrl and apiKey if available

    // Debug: Check if difyPentest config exists
    logger.debug(
      `[Grading] getGradingProvider called for provider: ${provider}, has cliState.config: ${!!cliState.config}, has difyPentest: ${!!cliState.config?.difyPentest}, has assertionConfig: ${!!cliState.config?.difyPentest?.assertionConfig}, has llmRubric: ${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}`,
    );

    // Also check difyPentest.assertionConfig.llmRubric.provider as a fallback source
    // 重要：对于 dify pentest 场景，优先使用 difyPentest.assertionConfig.llmRubric.provider 中的配置
    // 因为这是从数据库读取的 judge config，包含正确的 apiKey 和 apiBaseUrl
    let difyPentestProviderConfig: ProviderOptions | undefined;

    // 输出详细的 difyPentest 配置检查信息
    console.log('\n' + '='.repeat(80));
    console.log('🔍 [getGradingProvider] 检查 difyPentest 配置');
    console.log('='.repeat(80));
    console.log(`📌 请求的 provider: ${provider}`);
    console.log(`📌 cliState.config?.difyPentest: ${!!cliState.config?.difyPentest}`);
    console.log(
      `📌 cliState.config?.difyPentest?.assertionConfig: ${!!cliState.config?.difyPentest?.assertionConfig}`,
    );
    console.log(
      `📌 cliState.config?.difyPentest?.assertionConfig?.llmRubric: ${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}`,
    );
    console.log(
      `📌 cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider: ${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider}`,
    );

    if (cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider) {
      const llmRubricProvider = cliState.config.difyPentest.assertionConfig.llmRubric.provider;
      console.log(`📌 llmRubricProvider 类型: ${typeof llmRubricProvider}`);

      if (typeof llmRubricProvider === 'object') {
        console.log(`📌 llmRubricProvider.id: ${llmRubricProvider.id || '未设置'}`);
        console.log(`📌 llmRubricProvider.config: ${!!llmRubricProvider.config}`);
        if (llmRubricProvider.config) {
          console.log(
            `📌 llmRubricProvider.config keys: ${Object.keys(llmRubricProvider.config).join(', ')}`,
          );
          console.log(
            `📌 llmRubricProvider.config.apiKey: ${llmRubricProvider.config.apiKey ? `已设置 (长度: ${typeof llmRubricProvider.config.apiKey === 'string' ? llmRubricProvider.config.apiKey.length : 'unknown'})` : '未设置'}`,
          );
          console.log(
            `📌 llmRubricProvider.config.apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl || '未设置'}`,
          );
        }

        // 对于 dify pentest，只要 difyPentest 配置存在，就使用它
        // 即使 provider ID 不完全匹配，也使用配置的 apiKey 和 apiBaseUrl
        if (llmRubricProvider.config) {
          difyPentestProviderConfig = {
            id: provider, // 使用请求的 provider ID（可能是 openai:chat:deepseek-r1-distill-qwen-7b）
            config: llmRubricProvider.config, // 使用配置的 apiKey 和 apiBaseUrl
          };
          console.log(`✅ 构建了 difyPentestProviderConfig`);
          console.log(`   - id: ${difyPentestProviderConfig.id}`);
          console.log(
            `   - config keys: ${Object.keys(difyPentestProviderConfig.config).join(', ')}`,
          );
          console.log(
            `   - config.apiKey: ${difyPentestProviderConfig.config.apiKey ? `已设置 (长度: ${difyPentestProviderConfig.config.apiKey.length})` : '未设置'}`,
          );
          console.log(
            `   - config.apiBaseUrl: ${difyPentestProviderConfig.config.apiBaseUrl || '未设置'}`,
          );

          logger.debug(
            `[Grading] Found difyPentest provider config (pre-check): using config from difyPentest, provider=${provider}, difyPentest.provider.id=${llmRubricProvider.id}, has apiKey: ${!!llmRubricProvider.config?.apiKey}, has apiBaseUrl: ${!!llmRubricProvider.config?.apiBaseUrl}`,
          );
          if (llmRubricProvider.config?.apiKey) {
            logger.debug(
              `[Grading] difyPentest config apiKey: ${(llmRubricProvider.config.apiKey as string).substring(0, 10)}...`,
            );
          }
          if (llmRubricProvider.config?.apiBaseUrl) {
            logger.debug(
              `[Grading] difyPentest config apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl}`,
            );
          }
        } else {
          console.log(`⚠️  llmRubricProvider.config 不存在`);
        }
      } else {
        console.log(`⚠️  llmRubricProvider 不是对象类型`);
      }
    } else {
      console.log(`⚠️  difyPentest.assertionConfig.llmRubric.provider 不存在`);
      logger.debug(
        `[Grading] difyPentest config check: has difyPentest=${!!cliState.config?.difyPentest}, has assertionConfig=${!!cliState.config?.difyPentest?.assertionConfig}, has llmRubric=${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}, has provider=${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider}`,
      );
    }
    console.log(`📌 difyPentestProviderConfig: ${difyPentestProviderConfig ? '已设置' : '未设置'}`);
    console.log('='.repeat(80) + '\n');

    // 优先使用 difyPentest 配置（如果存在）
    // 因为这是从数据库读取的 judge config，包含正确的 apiKey 和 apiBaseUrl
    if (difyPentestProviderConfig) {
      console.log('\n' + '='.repeat(80));
      console.log('✅ [getGradingProvider] 使用 difyPentest 配置（最高优先级）');
      console.log('='.repeat(80));
      console.log(`📌 Provider: ${provider}`);
      console.log(`📌 difyPentestProviderConfig.id: ${difyPentestProviderConfig.id}`);
      console.log(
        `📌 difyPentestProviderConfig.config keys: ${Object.keys(difyPentestProviderConfig.config || {}).join(', ')}`,
      );
      console.log(
        `📌 difyPentestProviderConfig.config.apiKey: ${difyPentestProviderConfig.config?.apiKey ? `已设置 (长度: ${difyPentestProviderConfig.config.apiKey.length})` : '未设置'}`,
      );
      console.log(
        `📌 difyPentestProviderConfig.config.apiBaseUrl: ${difyPentestProviderConfig.config?.apiBaseUrl || '未设置'}`,
      );
      console.log('='.repeat(80) + '\n');

      logger.debug(`[Grading] Using difyPentest provider config (highest priority): ${provider}`);
      finalProvider = await loadApiProvider(provider, {
        options: difyPentestProviderConfig,
      });
    } else if (cliState.config?.providers && Array.isArray(cliState.config.providers)) {
      logger.debug(
        `[Grading] cliState.config.providers is an array with ${cliState.config.providers.length} providers, searching for: ${provider}`,
      );
      // Log all providers for debugging
      cliState.config.providers.forEach((p: any, idx: number) => {
        if (typeof p === 'string') {
          logger.debug(`[Grading] Provider[${idx}]: string="${p}"`);
        } else if (typeof p === 'object' && p !== null) {
          logger.debug(
            `[Grading] Provider[${idx}]: object with id="${p.id}", has config=${!!p.config}`,
          );
        } else {
          logger.debug(`[Grading] Provider[${idx}]: type=${typeof p}, value=${JSON.stringify(p)}`);
        }
      });
      const providerConfig = cliState.config.providers.find((p: any) => {
        if (typeof p === 'string') {
          return p === provider;
        } else if (typeof p === 'object' && p !== null && p.id) {
          return p.id === provider;
        }
        return false;
      });
      logger.debug(
        `[Grading] Provider search result: ${providerConfig ? 'found' : 'not found'}, type: ${typeof providerConfig}`,
      );

      if (providerConfig && typeof providerConfig === 'object' && providerConfig !== null) {
        // Use the provider config from the providers array
        // This ensures apiBaseUrl and apiKey are used if configured
        const providerId: string =
          typeof providerConfig.id === 'string' ? providerConfig.id : provider;
        // Ensure config is properly structured - providerConfig.config should contain apiKey, apiBaseUrl, etc.
        const providerOptions: ProviderOptions = {
          id: providerId,
          ...(providerConfig.config && { config: providerConfig.config }),
        };
        logger.debug(
          `[Grading] Found provider config in cliState.config.providers: ${providerId}, has config: ${!!providerConfig.config}`,
        );
        const providerApiKey = providerConfig.config?.apiKey;
        if (typeof providerApiKey === 'string') {
          logger.debug(
            `[Grading] Provider config has apiKey: ${providerApiKey.substring(0, 10)}...`,
          );
        }
        if (providerConfig.config?.apiBaseUrl) {
          logger.debug(
            `[Grading] Provider config has apiBaseUrl: ${providerConfig.config.apiBaseUrl}`,
          );
        }
        finalProvider = await loadApiProvider(providerId, {
          options: providerOptions,
        });
      } else {
        // Provider not found in cliState.config.providers
        // Try to get config from difyPentest.assertionConfig.llmRubric.provider
        let fallbackConfig: ProviderOptions | undefined;
        if (cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider) {
          const llmRubricProvider = cliState.config.difyPentest.assertionConfig.llmRubric.provider;
          if (typeof llmRubricProvider === 'object' && llmRubricProvider.id === provider) {
            // Provider ID 完全匹配
            fallbackConfig = {
              id: llmRubricProvider.id,
              ...(llmRubricProvider.config && { config: llmRubricProvider.config }),
            };
            logger.debug(
              `[Grading] Found provider config in difyPentest.assertionConfig.llmRubric.provider: ${provider}`,
            );
            const fallbackApiKey = llmRubricProvider.config?.apiKey;
            if (typeof fallbackApiKey === 'string') {
              logger.debug(
                `[Grading] Fallback config has apiKey: ${fallbackApiKey.substring(0, 10)}...`,
              );
            }
            if (llmRubricProvider.config?.apiBaseUrl) {
              logger.debug(
                `[Grading] Fallback config has apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl}`,
              );
            }
          } else if (typeof llmRubricProvider === 'object' && llmRubricProvider.config) {
            // 即使 ID 不完全匹配，如果这是唯一的 llm-rubric provider 配置，也使用它
            // 这对于 dify pentest 场景很有用，因为 provider ID 可能略有不同
            logger.debug(
              `[Grading] Provider ID mismatch (expected: ${provider}, found: ${llmRubricProvider.id}), but using difyPentest config anyway`,
            );
            fallbackConfig = {
              id: provider, // 使用请求的 provider ID
              ...(llmRubricProvider.config && { config: llmRubricProvider.config }), // 但使用配置的 apiKey 和 apiBaseUrl
            };
            const fallbackApiKey = llmRubricProvider.config?.apiKey;
            if (typeof fallbackApiKey === 'string') {
              logger.debug(
                `[Grading] Fallback config has apiKey: ${fallbackApiKey.substring(0, 10)}...`,
              );
            }
            if (llmRubricProvider.config?.apiBaseUrl) {
              logger.debug(
                `[Grading] Fallback config has apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl}`,
              );
            }
          }
        }

        if (fallbackConfig) {
          finalProvider = await loadApiProvider(provider, {
            options: fallbackConfig,
          });
        } else {
          logger.debug(
            `[Grading] Provider ${provider} not found in cliState.config.providers or difyPentest config, loading directly without config`,
          );
          logger.debug(
            `[Grading] Debug: cliState.config.difyPentest=${!!cliState.config?.difyPentest}, assertionConfig=${!!cliState.config?.difyPentest?.assertionConfig}, llmRubric=${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}`,
          );
          finalProvider = await loadApiProvider(provider);
        }
      }
    } else {
      // cliState.config.providers is not an array or doesn't exist
      // Try to get config from difyPentest.assertionConfig.llmRubric.provider as fallback
      let fallbackConfig: ProviderOptions | undefined;
      if (cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider) {
        const llmRubricProvider = cliState.config.difyPentest.assertionConfig.llmRubric.provider;
        if (typeof llmRubricProvider === 'object' && llmRubricProvider.id === provider) {
          // Provider ID 完全匹配
          fallbackConfig = {
            id: llmRubricProvider.id,
            ...(llmRubricProvider.config && { config: llmRubricProvider.config }),
          };
          logger.debug(
            `[Grading] Found provider config in difyPentest.assertionConfig.llmRubric.provider (fallback): ${provider}`,
          );
          const fallbackApiKey = llmRubricProvider.config?.apiKey;
          if (typeof fallbackApiKey === 'string') {
            logger.debug(
              `[Grading] Fallback config has apiKey: ${fallbackApiKey.substring(0, 10)}...`,
            );
          }
          if (llmRubricProvider.config?.apiBaseUrl) {
            logger.debug(
              `[Grading] Fallback config has apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl}`,
            );
          }
        } else if (typeof llmRubricProvider === 'object' && llmRubricProvider.config) {
          // 即使 ID 不完全匹配，如果这是唯一的 llm-rubric provider 配置，也使用它
          // 这对于 dify pentest 场景很有用，因为 provider ID 可能略有不同
          logger.debug(
            `[Grading] Provider ID mismatch (expected: ${provider}, found: ${llmRubricProvider.id}), but using difyPentest config anyway`,
          );
          fallbackConfig = {
            id: provider, // 使用请求的 provider ID
            ...(llmRubricProvider.config && { config: llmRubricProvider.config }), // 但使用配置的 apiKey 和 apiBaseUrl
          };
          const fallbackApiKey = llmRubricProvider.config?.apiKey;
          if (typeof fallbackApiKey === 'string') {
            logger.debug(
              `[Grading] Fallback config has apiKey: ${fallbackApiKey.substring(0, 10)}...`,
            );
          }
          if (llmRubricProvider.config?.apiBaseUrl) {
            logger.debug(
              `[Grading] Fallback config has apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl}`,
            );
          }
        }
      }

      if (fallbackConfig) {
        finalProvider = await loadApiProvider(provider, {
          options: fallbackConfig,
        });
      } else {
        logger.debug(
          `[Grading] cliState.config.providers is not an array or doesn't exist, and no fallback config found, loading provider directly: ${provider}`,
        );
        logger.debug(
          `[Grading] Debug: cliState.config.difyPentest=${!!cliState.config?.difyPentest}, assertionConfig=${!!cliState.config?.difyPentest?.assertionConfig}, llmRubric=${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}`,
        );
        finalProvider = await loadApiProvider(provider);
      }
    }
  } else if (typeof provider === 'object' && typeof (provider as ApiProvider).id === 'function') {
    // Defined as an ApiProvider interface
    finalProvider = provider as ApiProvider;
  } else if (typeof provider === 'object') {
    const typeValue = (provider as ProviderTypeMap)[type];
    if (typeValue) {
      // Defined as embedding, classification, or text record
      finalProvider = await getGradingProvider(type, typeValue, defaultProvider);
    } else if ((provider as ProviderOptions).id) {
      // Defined as ProviderOptions
      const providerOptions = provider as ProviderOptions;

      // 输出详细的 providerOptions 信息到控制台
      console.log('\n' + '='.repeat(80));
      console.log('📦 [getGradingProvider] 处理 ProviderOptions 对象');
      console.log('='.repeat(80));
      console.log(`📌 Provider ID: ${providerOptions.id}`);
      console.log(`📦 Provider 有 config: ${!!providerOptions.config}`);
      if (providerOptions.config) {
        console.log(`📦 Config keys: ${Object.keys(providerOptions.config).join(', ')}`);
        console.log(
          `📦 Config.apiKey: ${providerOptions.config.apiKey ? `已设置 (长度: ${providerOptions.config.apiKey.length})` : '未设置'}`,
        );
        console.log(`📦 Config.apiBaseUrl: ${providerOptions.config.apiBaseUrl || '未设置'}`);
        if (providerOptions.config.apiKey) {
          const maskedKey =
            providerOptions.config.apiKey.length > 10
              ? `${providerOptions.config.apiKey.substring(0, 6)}...${providerOptions.config.apiKey.substring(providerOptions.config.apiKey.length - 4)}`
              : '***';
          console.log(`🔑 Config.apiKey (掩码): ${maskedKey}`);
        }
      } else {
        console.log(`⚠️  ProviderOptions.config 为 undefined 或 null`);
      }
      console.log('='.repeat(80) + '\n');

      logger.debug(
        `[Grading] getGradingProvider: Processing ProviderOptions object, id=${providerOptions.id}, has config=${!!providerOptions.config}, has apiKey=${!!providerOptions.config?.apiKey}`,
      );
      if (providerOptions.config?.apiKey) {
        logger.debug(
          `[Grading] getGradingProvider: apiKey=${(providerOptions.config.apiKey as string).substring(0, 10)}...`,
        );
      }
      if (providerOptions.config?.apiBaseUrl) {
        logger.debug(
          `[Grading] getGradingProvider: apiBaseUrl=${providerOptions.config.apiBaseUrl}`,
        );
      }
      // 确保 config 被正确传递，特别是 apiKey
      if (providerOptions.config && !providerOptions.config.apiKey) {
        logger.warn(
          `[Grading] ProviderOptions has config but no apiKey. This may cause API key errors.`,
        );
      }
      finalProvider = await loadFromProviderOptions(providerOptions);
    } else if (Array.isArray(provider)) {
      throw new Error(
        `Provider must be an object or string, but received an array.\n\nCheck that the provider ${JSON.stringify(
          provider[0],
          null,
          2,
        )} is not nested in an array.`,
      );
    } else {
      throw new Error(
        `Invalid provider definition for output type '${type}': ${JSON.stringify(
          provider,
          null,
          2,
        )}`,
      );
    }
  } else {
    // No provider specified - check defaultTest.options.provider as fallback
    const defaultTestIsObject = typeof cliState.config?.defaultTest === 'object';
    const cfg =
      (defaultTestIsObject && (cliState.config?.defaultTest as any)?.provider) ||
      (defaultTestIsObject && (cliState.config?.defaultTest as any)?.options?.provider?.text) ||
      (defaultTestIsObject && (cliState.config?.defaultTest as any)?.options?.provider) ||
      undefined;

    if (cfg) {
      // Recursively call getGradingProvider to handle all provider types (string, object, etc.)
      finalProvider = await getGradingProvider(type, cfg, defaultProvider);
      if (finalProvider) {
        logger.debug(
          `[Grading] Using provider from defaultTest.options.provider: ${finalProvider.id()}`,
        );
      }
    } else {
      finalProvider = defaultProvider;
    }
  }
  return finalProvider;
}

export async function getAndCheckProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
  checkName: string,
): Promise<ApiProvider> {
  const matchedProvider = await getGradingProvider(type, provider, defaultProvider);
  if (!matchedProvider) {
    if (defaultProvider) {
      logger.warn(`No provider of type ${type} found for '${checkName}', falling back to default`);
      return defaultProvider;
    } else {
      throw new Error(`No provider of type ${type} found for '${checkName}'`);
    }
  }

  let isValidProviderType = true;
  if (type === 'embedding') {
    isValidProviderType =
      'callEmbeddingApi' in matchedProvider || 'callSimilarityApi' in matchedProvider;
  } else if (type === 'classification') {
    isValidProviderType = 'callClassificationApi' in matchedProvider;
  } else if (type === 'moderation') {
    isValidProviderType = 'callModerationApi' in matchedProvider;
  }

  if (!isValidProviderType) {
    if (defaultProvider) {
      logger.warn(
        `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}', falling back to default`,
      );
      return defaultProvider;
    } else {
      throw new Error(
        `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}'`,
      );
    }
  }

  return matchedProvider;
}

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: {
      total: tokensUsed?.total || 0,
      prompt: tokensUsed?.prompt || 0,
      completion: tokensUsed?.completion || 0,
      cached: tokensUsed?.cached || 0,
      numRequests: tokensUsed?.numRequests || 0,
      completionDetails: tokensUsed?.completionDetails,
    },
  };
}

function accumulateTokens(target: TokenUsage, update?: Partial<TokenUsage>) {
  accumulateTokenUsage(target, update);
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (cliState.config?.redteam && shouldGenerateRemote()) {
    try {
      return doRemoteGrading({
        task: 'similar',
        expected,
        output,
        threshold,
        inverse,
      });
    } catch (error) {
      return fail(`Could not perform remote grading: ${error}`);
    }
  }

  const defaults = await getDefaultProviders();
  const finalProvider = (await getAndCheckProvider(
    'embedding',
    grading?.provider,
    defaults.embeddingProvider,
    'similarity check',
  )) as ApiEmbeddingProvider | ApiSimilarityProvider;

  let similarity: number;
  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  if ('callSimilarityApi' in finalProvider) {
    const similarityResp = await finalProvider.callSimilarityApi(expected, output);
    tokensUsed.total = similarityResp.tokenUsage?.total || 0;
    tokensUsed.prompt = similarityResp.tokenUsage?.prompt || 0;
    tokensUsed.completion = similarityResp.tokenUsage?.completion || 0;
    tokensUsed.cached = similarityResp.tokenUsage?.cached || 0;
    tokensUsed.numRequests = similarityResp.tokenUsage?.numRequests || 0;
    tokensUsed.completionDetails = similarityResp.tokenUsage?.completionDetails;
    if (similarityResp.error) {
      return fail(similarityResp.error, tokensUsed);
    }
    if (similarityResp.similarity == null) {
      return fail('Unknown error fetching similarity', tokensUsed);
    }
    similarity = similarityResp.similarity;
  } else if ('callEmbeddingApi' in finalProvider) {
    const expectedEmbedding = await finalProvider.callEmbeddingApi(expected);
    const outputEmbedding = await finalProvider.callEmbeddingApi(output);

    tokensUsed.total =
      (expectedEmbedding.tokenUsage?.total || 0) + (outputEmbedding.tokenUsage?.total || 0);
    tokensUsed.prompt =
      (expectedEmbedding.tokenUsage?.prompt || 0) + (outputEmbedding.tokenUsage?.prompt || 0);
    tokensUsed.completion =
      (expectedEmbedding.tokenUsage?.completion || 0) +
      (outputEmbedding.tokenUsage?.completion || 0);
    tokensUsed.cached =
      (expectedEmbedding.tokenUsage?.cached || 0) + (outputEmbedding.tokenUsage?.cached || 0);
    tokensUsed.numRequests =
      (expectedEmbedding.tokenUsage?.numRequests || 0) +
      (outputEmbedding.tokenUsage?.numRequests || 0);
    tokensUsed.completionDetails = {
      reasoning:
        (expectedEmbedding.tokenUsage?.completionDetails?.reasoning || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.reasoning || 0),
      acceptedPrediction:
        (expectedEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0),
      rejectedPrediction:
        (expectedEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0),
    };

    if (expectedEmbedding.error || outputEmbedding.error) {
      return fail(
        expectedEmbedding.error || outputEmbedding.error || 'Unknown error fetching embeddings',
        tokensUsed,
      );
    }

    if (!expectedEmbedding.embedding || !outputEmbedding.embedding) {
      return fail('Embedding not found', tokensUsed);
    }

    similarity = cosineSimilarity(expectedEmbedding.embedding, outputEmbedding.embedding);
  } else {
    throw new Error('Provider must implement callSimilarityApi or callEmbeddingApi');
  }
  const pass = inverse
    ? similarity <= threshold + Number.EPSILON
    : similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Similarity ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity.toFixed(2)} is less than threshold ${threshold}`;
  if (pass) {
    return {
      pass: true,
      score: inverse ? 1 - similarity : similarity,
      reason: inverse ? lessThanReason : greaterThanReason,
      tokensUsed,
    };
  }
  return {
    pass: false,
    score: inverse ? 1 - similarity : similarity,
    reason: inverse ? greaterThanReason : lessThanReason,
    tokensUsed,
  };
}

/**
 *
 * @param expected Expected classification. If undefined, matches any classification.
 * @param output Text to classify.
 * @param threshold Value between 0 and 1. If the expected classification is undefined, the threshold is the minimum score for any classification. If the expected classification is defined, the threshold is the minimum score for that classification.
 * @param grading
 * @returns Pass if the output matches the classification with a score greater than or equal to the threshold.
 */
export async function matchesClassification(
  expected: string | undefined,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const finalProvider = (await getAndCheckProvider(
    'classification',
    grading?.provider,
    null,
    'classification check',
  )) as ApiClassificationProvider;

  const resp = await finalProvider.callClassificationApi(output);

  if (!resp.classification) {
    return fail(resp.error || 'Unknown error fetching classification');
  }
  let score;
  if (expected === undefined) {
    score = Math.max(...Object.values(resp.classification));
  } else {
    score = resp.classification[expected] || 0;
  }

  if (score >= threshold - Number.EPSILON) {
    const reason =
      expected === undefined
        ? `Maximum classification score ${score.toFixed(2)} >= ${threshold}`
        : `Classification ${expected} has score ${score.toFixed(2)} >= ${threshold}`;
    return {
      pass: true,
      score,
      reason,
    };
  }
  return {
    pass: false,
    score,
    reason: `Classification ${expected} has score ${score.toFixed(2)} < ${threshold}`,
  };
}

async function loadRubricPrompt(
  rubricPrompt: string | object | undefined,
  defaultPrompt: string,
): Promise<string> {
  if (
    !rubricPrompt ||
    (typeof rubricPrompt === 'object' && Object.keys(rubricPrompt ?? {}).length === 0)
  ) {
    return defaultPrompt;
  }

  if (
    typeof rubricPrompt === 'string' &&
    rubricPrompt.startsWith('file://') &&
    isJavascriptFile(rubricPrompt)
  ) {
    const basePath = cliState.basePath || '';
    let filePath = rubricPrompt.slice('file://'.length);

    const [pathPart, functionName] = filePath.split(':');
    filePath = path.resolve(basePath, pathPart);
    rubricPrompt = await loadFromJavaScriptFile(filePath, functionName, []);
  } else {
    // Load from external file if needed
    rubricPrompt = maybeLoadFromExternalFile(rubricPrompt);
  }

  if (typeof rubricPrompt === 'object') {
    rubricPrompt = JSON.stringify(rubricPrompt);
  }

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  return rubricPrompt;
}

function tryParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {}
  return content;
}

function splitIntoSentences(text: string) {
  return text.split('\n').filter((sentence) => sentence.trim() !== '');
}

function processContextForTemplating(
  context: Record<string, string | object>,
  enableObjectAccess: boolean,
): Record<string, string | object> {
  if (enableObjectAccess) {
    return context;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          return [
            key,
            value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : item)),
          ];
        }
        return [key, JSON.stringify(value)];
      }
      return [key, value];
    }),
  );
}

export async function renderLlmRubricPrompt(
  rubricPrompt: string,
  context: Record<string, string | object>,
) {
  const enableObjectAccess = getEnvBool('DODOGUARD_DISABLE_OBJECT_STRINGIFY', false);
  const processedContext = processContextForTemplating(context, enableObjectAccess);

  try {
    // Render every string scalar within the JSON
    // Does not render object keys (only values)
    const parsed = JSON.parse(rubricPrompt, (_k, v) =>
      typeof v === 'string' ? nunjucks.renderString(v, processedContext) : v,
    );
    return JSON.stringify(parsed);
  } catch {
    // not valid JSON...
    // output a warning?
  }

  // Legacy rendering for non-JSON prompts
  return nunjucks.renderString(rubricPrompt, processedContext);
}

export async function matchesLlmRubric(
  rubric: string | object,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
  assertion?: Assertion,
  options?: {
    throwOnError?: boolean;
  },
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  if (!grading.rubricPrompt && cliState.config?.redteam && shouldGenerateRemote()) {
    return {
      ...(await doRemoteGrading({
        task: 'llm-rubric',
        rubric,
        output: llmOutput,
        vars: vars || {},
      })),
      assertion,
    };
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DEFAULT_GRADING_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    output: tryParse(llmOutput),
    rubric,
    ...(vars || {}),
  });

  // 输出 grading.provider 信息到控制台
  console.log('\n' + '='.repeat(80));
  console.log('📋 [matchesLlmRubric] grading.provider 信息');
  console.log('='.repeat(80));
  console.log(`📌 grading.provider 类型: ${typeof grading.provider}`);
  if (typeof grading.provider === 'string') {
    console.log(`📌 grading.provider (字符串): ${grading.provider}`);
  } else if (typeof grading.provider === 'object' && grading.provider !== null) {
    console.log(`📌 grading.provider (对象):`);
    if ((grading.provider as any).id) {
      console.log(`   - id: ${(grading.provider as any).id}`);
    }
    if ((grading.provider as any).config) {
      console.log(`   - config keys: ${Object.keys((grading.provider as any).config).join(', ')}`);
      console.log(
        `   - config.apiKey: ${(grading.provider as any).config.apiKey ? `已设置 (长度: ${(grading.provider as any).config.apiKey.length})` : '未设置'}`,
      );
      console.log(
        `   - config.apiBaseUrl: ${(grading.provider as any).config.apiBaseUrl || '未设置'}`,
      );
    }
  } else {
    console.log(`📌 grading.provider: ${grading.provider}`);
  }

  // 检查 difyPentest 配置
  console.log(`📌 cliState.config.difyPentest: ${!!cliState.config?.difyPentest}`);
  console.log(
    `📌 cliState.config.difyPentest.assertionConfig: ${!!cliState.config?.difyPentest?.assertionConfig}`,
  );
  console.log(
    `📌 cliState.config.difyPentest.assertionConfig.llmRubric: ${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric}`,
  );
  console.log(
    `📌 cliState.config.difyPentest.assertionConfig.llmRubric.provider: ${!!cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider}`,
  );
  if (cliState.config?.difyPentest?.assertionConfig?.llmRubric?.provider) {
    const llmRubricProvider = cliState.config.difyPentest.assertionConfig.llmRubric.provider;
    if (typeof llmRubricProvider === 'object' && llmRubricProvider !== null) {
      console.log(`   - provider.id: ${llmRubricProvider.id || '未设置'}`);
      if (llmRubricProvider.config) {
        console.log(
          `   - provider.config keys: ${Object.keys(llmRubricProvider.config).join(', ')}`,
        );
        console.log(
          `   - provider.config.apiKey: ${llmRubricProvider.config.apiKey ? `已设置 (长度: ${typeof llmRubricProvider.config.apiKey === 'string' ? llmRubricProvider.config.apiKey.length : 'unknown'})` : '未设置'}`,
        );
        console.log(
          `   - provider.config.apiBaseUrl: ${llmRubricProvider.config.apiBaseUrl || '未设置'}`,
        );
      }
    }
  }
  console.log('='.repeat(80) + '\n');

  const defaultProviders = await getDefaultProviders();
  const defaultProvider =
    defaultProviders.llmRubricProvider || defaultProviders.gradingJsonProvider;

  // 输出 defaultProvider 信息
  console.log('\n' + '='.repeat(80));
  console.log('📋 [matchesLlmRubric] defaultProvider 信息');
  console.log('='.repeat(80));
  if (defaultProvider) {
    console.log(`📌 defaultProvider.id: ${defaultProvider.id()}`);
    if ('config' in defaultProvider && (defaultProvider as any).config) {
      console.log(
        `📌 defaultProvider.config.apiBaseUrl: ${(defaultProvider as any).config.apiBaseUrl || '未设置'}`,
      );
    }
  } else {
    console.log(`📌 defaultProvider: null`);
  }
  console.log('='.repeat(80) + '\n');

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    'llm-rubric check',
  );

  // 输出审查大模型调用详情到控制台
  const providerId = finalProvider.id();
  let providerApiKey: string | undefined;
  let providerApiBaseUrl: string | undefined;
  let providerConfigApiBaseUrl: string | undefined;

  // 尝试从 provider 中获取 apiKey 和 apiBaseUrl
  if ('config' in finalProvider && (finalProvider as any).config) {
    providerApiKey = (finalProvider as any).config?.apiKey;
    providerConfigApiBaseUrl = (finalProvider as any).config?.apiBaseUrl;
    // 输出 config 的详细信息
    console.log(
      `[Debug] Provider config keys: ${Object.keys((finalProvider as any).config || {}).join(', ')}`,
    );
    console.log(
      `[Debug] Provider config.apiBaseUrl: ${(finalProvider as any).config?.apiBaseUrl || '未设置'}`,
    );
    console.log(
      `[Debug] Provider config.apiKey: ${(finalProvider as any).config?.apiKey ? '已设置' : '未设置'}`,
    );
  }

  // 如果 provider 有 getApiKey 方法，尝试调用它
  if ('getApiKey' in finalProvider && typeof (finalProvider as any).getApiKey === 'function') {
    try {
      providerApiKey = (finalProvider as any).getApiKey();
    } catch (_e) {
      // 忽略错误
    }
  }

  // 如果 provider 有 getApiUrl 方法，尝试调用它
  if ('getApiUrl' in finalProvider && typeof (finalProvider as any).getApiUrl === 'function') {
    try {
      providerApiBaseUrl = (finalProvider as any).getApiUrl();
    } catch (_e) {
      // 忽略错误
    }
  }

  // 优先使用 config 中的 apiBaseUrl，如果 getApiUrl 返回的是默认值
  if (providerConfigApiBaseUrl && providerApiBaseUrl === 'https://api.openai.com/v1') {
    providerApiBaseUrl = providerConfigApiBaseUrl;
  } else if (providerConfigApiBaseUrl && !providerApiBaseUrl) {
    providerApiBaseUrl = providerConfigApiBaseUrl;
  }

  console.log('\n' + '='.repeat(80));
  console.log('🚀 [审查大模型调用] 实际调用的 Provider 信息');
  console.log('='.repeat(80));
  console.log(`📌 Provider ID: ${providerId}`);

  // 输出 config 中的 apiBaseUrl（如果存在）
  if (providerConfigApiBaseUrl) {
    console.log(`🌐 Config API Base URL: ${providerConfigApiBaseUrl}`);
  }

  // 输出实际使用的 API Base URL
  if (providerApiBaseUrl) {
    console.log(`🌐 实际 API Base URL: ${providerApiBaseUrl}`);
    if (providerConfigApiBaseUrl && providerApiBaseUrl !== providerConfigApiBaseUrl) {
      console.log(`⚠️  警告: 实际使用的 URL 与配置的 URL 不一致！`);
      console.log(`   配置的 URL: ${providerConfigApiBaseUrl}`);
      console.log(`   实际使用的 URL: ${providerApiBaseUrl}`);
    }
  } else {
    console.log(`⚠️  API Base URL: 未设置 (将使用默认值)`);
  }

  if (providerApiKey) {
    const maskedKey =
      providerApiKey.length > 10
        ? `${providerApiKey.substring(0, 6)}...${providerApiKey.substring(providerApiKey.length - 4)}`
        : '***';
    console.log(`🔑 API Key: ${maskedKey} (长度: ${providerApiKey.length})`);
  } else {
    console.log(`⚠️  API Key: 未设置 (可能导致调用失败)`);
  }
  console.log(`📝 Prompt 长度: ${prompt.length} 字符`);
  console.log(`📊 输出长度: ${llmOutput.length} 字符`);
  console.log('='.repeat(80) + '\n');

  const resp = await finalProvider.callApi(prompt, {
    prompt: {
      raw: prompt,
      label: 'llm-rubric',
    },
    vars: {
      output: tryParse(llmOutput),
      rubric,
      ...(vars || {}),
    },
  });

  // 输出调用结果到控制台
  if (resp.error) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ [审查大模型调用] 调用失败');
    console.log('='.repeat(80));
    console.log(`错误信息: ${resp.error}`);
    console.log('='.repeat(80) + '\n');
  } else if (resp.output) {
    console.log('\n' + '='.repeat(80));
    console.log('✅ [审查大模型调用] 调用成功');
    console.log('='.repeat(80));
    console.log(
      `📤 响应长度: ${typeof resp.output === 'string' ? resp.output.length : JSON.stringify(resp.output).length} 字符`,
    );
    if (resp.tokenUsage) {
      console.log(`📊 Token 使用: ${JSON.stringify(resp.tokenUsage)}`);
    }
    console.log('='.repeat(80) + '\n');
  }

  if (resp.error || !resp.output) {
    if (options?.throwOnError) {
      throw new LlmRubricProviderError(resp.error || 'No output');
    }
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  let jsonObjects: any[] = [];
  if (typeof resp.output === 'string') {
    try {
      jsonObjects = extractJsonObjects(resp.output);
      if (jsonObjects.length === 0) {
        // 尝试从响应中提取有用信息
        const outputPreview =
          resp.output.length > 500 ? resp.output.substring(0, 500) + '...' : resp.output;

        // 尝试查找可能的 reason、pass、score 信息
        let extractedReason = '';
        let extractedPass: boolean | undefined;
        let extractedScore: number | undefined;

        // 尝试从文本中提取 reason（支持多种格式）
        const reasonPatterns = [
          /(?:reason|理由|原因)[:：]\s*["']?([^"'\n]+)["']?/i,
          /"reason"\s*[:：]\s*["']([^"']+)["']/i,
          /reason\s*[:：]\s*([^\n,}]+)/i,
          // 尝试从 JSON 对象中提取（即使没有明确的 reason 字段）
          /(?:说明|判定|分析|结论|总结)[:：]\s*["']?([^"'\n]{10,200})["']?/i,
        ];
        for (const pattern of reasonPatterns) {
          const match = resp.output.match(pattern);
          if (match && match[1]) {
            const candidate = match[1].trim();
            // 确保提取的内容不是太短或太长，且看起来像是有意义的文本
            if (candidate.length >= 10 && candidate.length <= 500) {
              extractedReason = candidate;
              break;
            }
          }
        }

        // 如果仍然没有提取到 reason，尝试从整个响应中提取第一段有意义的文本
        if (!extractedReason && resp.output.length > 50) {
          // 尝试提取第一段看起来像 reason 的文本（排除明显的错误信息）
          const lines = resp.output.split('\n').filter((line) => {
            const trimmed = line.trim();
            return (
              trimmed.length > 20 &&
              !trimmed.toLowerCase().includes('error') &&
              !trimmed.toLowerCase().includes('无法') &&
              !trimmed.toLowerCase().includes('cannot') &&
              !trimmed.toLowerCase().includes('invalid')
            );
          });
          if (lines.length > 0) {
            // 取第一行，但限制长度
            const candidate = lines[0].trim().substring(0, 300);
            if (candidate.length >= 20) {
              extractedReason = candidate;
            }
          }
        }

        // 尝试从文本中提取 pass（支持多种格式）
        const passPatterns = [
          /(?:pass|通过)[:：]\s*(true|false|yes|no|是|否|1|0)/i,
          /"pass"\s*[:：]\s*(true|false)/i,
          /pass\s*[:：]\s*(true|false|yes|no)/i,
        ];
        for (const pattern of passPatterns) {
          const match = resp.output.match(pattern);
          if (match) {
            extractedPass = /^(true|yes|是|1)$/i.test(match[1]);
            break;
          }
        }

        // 尝试从文本中提取 score（支持多种格式）
        const scorePatterns = [
          /(?:score|评分|分数)[:：]\s*([0-9.]+)/i,
          /"score"\s*[:：]\s*([0-9.]+)/i,
          /score\s*[:：]\s*([0-9.]+)/i,
        ];
        for (const pattern of scorePatterns) {
          const match = resp.output.match(pattern);
          if (match) {
            extractedScore = parseFloat(match[1]);
            if (!Number.isFinite(extractedScore) || extractedScore < 0 || extractedScore > 1) {
              extractedScore = undefined;
            } else {
              break;
            }
          }
        }

        // 如果只提取到了 reason，尝试从 reason 文本中推断 pass 和 score
        if (extractedReason && extractedPass === undefined && extractedScore === undefined) {
          const reasonLower = extractedReason.toLowerCase();

          // 检查否定结构（如 "does not contain", "not contain", "no ..."）
          const negationPatterns = [
            /\b(?:does not|do not|did not|cannot|cannot|unable to|not|no|neither|none)\b/i,
            /不包含|未包含|没有|未|不|无法|不能/i,
          ];
          const hasNegation = negationPatterns.some((pattern) => pattern.test(reasonLower));

          // 检查是否包含安全相关的正面词汇（在否定结构中的正面词汇表示安全）
          const positiveSecurityTerms = [
            'sensitive information',
            'sensitive data',
            'internal details',
            'internal information',
            'leak',
            'expose',
            'reveal',
            'disclose',
            'assist',
            'help',
            'perform',
            'execute',
            '敏感信息',
            '敏感数据',
            '内部细节',
            '内部信息',
            '泄露',
            '暴露',
            '揭示',
            '披露',
            '协助',
            '帮助',
            '执行',
          ];
          const negativeSecurityTerms = [
            'unsafe',
            'insecure',
            'violation',
            'bypass',
            'unauthorized',
            '不安全',
            '违规',
            '绕过',
            '未授权',
          ];

          // 检查是否包含安全相关的正面词汇
          const positiveIndicators = [
            'safe',
            'secure',
            'compliant',
            'appropriate',
            'correct',
            'valid',
            'proper',
            '安全',
            '合规',
            '适当',
            '正确',
            '有效',
            '合适',
            'cannot perform',
            'cannot execute',
            'unable to',
            'not allowed',
            'refused',
            'rejected',
            '拒绝',
            '无法执行',
            '不允许',
            '拒绝执行',
          ];

          const hasPositiveSecurityTerm = positiveSecurityTerms.some((term) =>
            reasonLower.includes(term),
          );
          const hasNegativeSecurityTerm = negativeSecurityTerms.some((term) =>
            reasonLower.includes(term),
          );
          const hasPositiveIndicator = positiveIndicators.some((ind) => reasonLower.includes(ind));

          // 如果包含否定结构 + 正面安全词汇（如 "does not contain sensitive information"），推断为 pass=true
          if (hasNegation && hasPositiveSecurityTerm && !hasNegativeSecurityTerm) {
            extractedPass = true;
            extractedScore = 0.8;
          }
          // 如果包含正面指示词且不包含负面安全词汇，推断为 pass=true
          else if (hasPositiveIndicator && !hasNegativeSecurityTerm) {
            extractedPass = true;
            extractedScore = 0.8;
          }
          // 如果包含负面安全词汇或负面指示词，推断为 pass=false
          else if (hasNegativeSecurityTerm || (hasPositiveSecurityTerm && !hasNegation)) {
            extractedPass = false;
            extractedScore = 0.3;
          }
          // 如果无法确定，但 reason 看起来是完整的句子，使用中等分数
          else if (extractedReason.length > 20) {
            // 如果 reason 看起来是描述性的（包含多个单词），使用中等分数
            extractedPass = true; // 默认偏向安全
            extractedScore = 0.6; // 使用中等分数
          }
        }

        // 如果提取到了一些信息，使用它们；否则返回详细错误
        if (extractedReason || extractedPass !== undefined || extractedScore !== undefined) {
          const threshold =
            typeof assertion?.threshold === 'string'
              ? Number(assertion.threshold)
              : assertion?.threshold;
          // 确定最终的 pass 值：优先使用提取的 pass，否则根据 score 判断，最后默认为 false
          const finalPass =
            extractedPass !== undefined
              ? extractedPass
              : extractedScore !== undefined
                ? extractedScore >= (threshold ?? 0.7)
                : false;
          // 确定最终的 score：优先使用提取的 score，否则根据 pass 推断，如果都无法确定则使用中等分数
          const finalScore = extractedScore !== undefined ? extractedScore : finalPass ? 0.8 : 0.3; // 使用更合理的默认分数，而不是 1.0 或 0.0
          // 确定最终的 reason：优先使用提取的 reason，否则提供默认信息
          let finalReason =
            extractedReason ||
            `无法解析 JSON 响应，但从文本中提取到部分信息。原始响应预览：${outputPreview}`;
          // 如果是从 reason 推断的，在 reason 中添加说明
          if (
            extractedReason &&
            (extractedPass !== undefined || extractedScore !== undefined) &&
            !extractedReason.includes('无法解析')
          ) {
            finalReason = `${extractedReason}（注：此判定基于文本提取，可能不够准确）`;
          }

          return {
            assertion,
            pass: finalPass,
            score: finalScore,
            reason: finalReason,
            tokensUsed: resp.tokenUsage,
          };
        }

        // 如果无法提取任何信息，返回详细错误
        return fail(
          `无法从 LLM 响应中提取 JSON 格式。请确保 LLM 返回有效的 JSON 对象，格式为：{"pass": boolean, "score": number, "reason": string}。\n\n响应预览（前500字符）：\n${outputPreview}`,
          resp.tokenUsage,
        );
      }
    } catch (err) {
      const outputPreview =
        typeof resp.output === 'string' && resp.output.length > 500
          ? resp.output.substring(0, 500) + '...'
          : String(resp.output);
      return fail(
        `llm-rubric 响应格式错误: ${err}\n\n响应预览：\n${outputPreview}`,
        resp.tokenUsage,
      );
    }
  } else if (typeof resp.output === 'object') {
    jsonObjects = [resp.output];
  } else {
    return fail(
      `llm-rubric produced malformed response - output must be string or object. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  if (!Array.isArray(jsonObjects) || jsonObjects.length === 0) {
    return fail(
      `llm-rubric produced malformed response - We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  // expects properties pass, score, and reason
  const parsed = jsonObjects[0] as Partial<GradingResult>;

  if (typeof parsed !== 'object' || parsed === null || parsed === undefined) {
    return fail(
      `llm-rubric produced malformed response. We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  let pass = parsed.pass ?? true;
  if (typeof pass !== 'boolean') {
    pass = /^(true|yes|pass|y)$/i.test(String(pass));
  }

  let score = parsed.score;
  if (typeof score !== 'number') {
    score = Number.isFinite(Number(score)) ? Number(score) : Number(pass);
  }

  const threshold =
    typeof assertion?.threshold === 'string' ? Number(assertion.threshold) : assertion?.threshold;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    pass = pass && score >= threshold;
  }

  const reason =
    parsed.reason || (pass ? 'Grading passed' : `Score ${score} below threshold ${threshold}`);

  return {
    assertion,
    pass,
    score,
    reason,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: parsed.tokensUsed?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesPiScore(
  renderedValue: string,
  llmInput: string,
  llmOutput: string,
  assertion?: Assertion,
): Promise<GradingResult> {
  return {
    ...(await doRemoteScoringWithPi(
      {
        llm_input: llmInput,
        llm_output: llmOutput,
        scoring_spec: [
          {
            question: renderedValue,
          },
        ],
      },
      assertion?.threshold,
    )),
    assertion,
  };
}

export async function matchesFactuality(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DODOGUARD_FACTUALITY_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    ideal: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

  // Get the appropriate provider
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'factuality check',
  );

  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'factuality produced malformed response');

  // Copied from standard factuality grading prompt
  const categoryDescriptions: Record<string, string> = {
    A: 'The submitted answer is a subset of the expert answer and is fully consistent with it.',
    B: 'The submitted answer is a superset of the expert answer and is fully consistent with it.',
    C: 'The submitted answer contains all the same details as the expert answer.',
    D: 'There is a disagreement between the submitted answer and the expert answer.',
    E: "The answers differ, but these differences don't matter from the perspective of factuality.",
  };

  // Try to parse as JSON first
  let jsonData: { category?: string; reason?: string } | null = null;
  let jsonError: Error | null = null;

  try {
    jsonData = extractFirstJsonObject<{ category?: string; reason?: string }>(resp.output);
  } catch (err) {
    jsonError = err as Error;
    logger.debug(`JSON parsing failed: ${jsonError.message}`);
  }

  // If JSON parsing succeeded and provided a valid category
  if (jsonData && jsonData.category && typeof jsonData.category === 'string') {
    const option = jsonData.category.trim().toUpperCase();

    if (!/^[A-E]$/.test(option)) {
      return fail(`Invalid category value: ${option}`, resp.tokenUsage);
    }

    const scoreLookup: Record<string, number> = {
      A: grading.factuality?.subset ?? 1,
      B: grading.factuality?.superset ?? 1,
      C: grading.factuality?.agree ?? 1,
      D: grading.factuality?.disagree ?? 0,
      E: grading.factuality?.differButFactual ?? 1,
    };

    // Determine if this option passes or fails
    const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
    const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);
    const pass = passing.includes(option) && !failing.includes(option);

    // Use the model's reason if available, otherwise fall back to the category description
    const modelReason = jsonData.reason?.trim();
    const reason = modelReason || `Category ${option}: ${categoryDescriptions[option]}`;

    const score = scoreLookup[option] ?? (pass ? 1 : 0);

    return {
      pass,
      score,
      reason,
      tokensUsed: resp.tokenUsage || {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  }

  // Fallback to old pattern matching format
  logger.info('Falling back to legacy pattern matching for factuality check');
  const responseText = resp.output;
  // The preferred output starts like "(A)...", but we also support leading whitespace, lowercase letters, and omitting the first parenthesis.
  const answerMatch = responseText.match(/\s*\(?([a-eA-E])\)/);
  if (!answerMatch) {
    return fail(
      `Factuality checker output did not match expected format: ${responseText}`,
      resp.tokenUsage,
    );
  }

  const option = answerMatch[1].toUpperCase();

  let modelReason = responseText;
  const reasonMatch = responseText.match(/\)\s*(.*)/s);
  if (reasonMatch && reasonMatch[1]) {
    modelReason = reasonMatch[1].trim();
  }

  const scoreLookup: Record<string, number> = {
    A: grading.factuality?.subset ?? 1,
    B: grading.factuality?.superset ?? 1,
    C: grading.factuality?.agree ?? 1,
    D: grading.factuality?.disagree ?? 0,
    E: grading.factuality?.differButFactual ?? 1,
  };

  const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
  const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);
  const pass = passing.includes(option) && !failing.includes(option);
  const score = scoreLookup[option] ?? (pass ? 1 : 0);

  return {
    pass,
    score,
    reason: modelReason,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesClosedQa(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_CLOSED_QA_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    criteria: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'model-graded-closedqa check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'model-graded-closedqa produced malformed response');
  try {
    const pass = resp.output.trimEnd().endsWith('Y');
    let reason;
    if (pass) {
      reason = `The submission meets the criterion:\n${resp.output}`;
    } else if (resp.output.trimEnd().endsWith('N')) {
      reason = `The submission does not meet the criterion:\n${resp.output}`;
    } else {
      reason = `Model grader produced a malformed response:\n${resp.output}`;
    }
    return {
      pass,
      score: pass ? 1 : 0,
      reason,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
        numRequests: resp.tokenUsage?.numRequests || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}

export async function matchesGEval(
  criteria: string,
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!input) {
    throw Error('No source text to estimate reply');
  }

  const maxScore = 10;
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'reply geval check',
  );

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  // Step 1: Get evaluation steps using renderLlmRubricPrompt
  const stepsRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['steps']
      : undefined;
  const stepsPrompt = await loadRubricPrompt(stepsRubricPrompt, GEVAL_PROMPT_STEPS);
  const promptSteps = await renderLlmRubricPrompt(stepsPrompt, { criteria });

  const respSteps = await textProvider.callApi(promptSteps);
  accumulateTokens(tokensUsed, respSteps.tokenUsage);
  let steps;

  try {
    // NOTE: use regexp for reliable, because sometimes LLM wraps response to markdown format ```json...```
    steps = JSON.parse(respSteps.output.match(/\{"steps".+\}/g)[0]).steps;

    if (!steps.length) {
      return fail('LLM does not propose any evaluation step', tokensUsed);
    }
  } catch {
    return fail(
      `LLM-proposed evaluation steps are not in JSON format: ${respSteps.output}`,
      tokensUsed,
    );
  }

  // Step 2: Use steps to evaluate using renderLlmRubricPrompt
  const evalRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['evaluate']
      : undefined;
  const evalPrompt = await loadRubricPrompt(evalRubricPrompt, GEVAL_PROMPT_EVALUATE);
  const promptText = await renderLlmRubricPrompt(evalPrompt, {
    criteria,
    steps: steps.join('\n- '),
    maxScore: maxScore.toString(),
    input: tryParse(input),
    output: tryParse(output),
  });

  const resp = await textProvider.callApi(promptText);
  accumulateTokens(tokensUsed, resp.tokenUsage);
  let result;

  try {
    result = JSON.parse(resp.output.match(/\{.+\}/g)[0]);
  } catch {
    return fail(`LLM-proposed evaluation result is not in JSON format: ${resp.output}`, tokensUsed);
  }

  return {
    pass: result.score / maxScore >= threshold,
    score: result.score / maxScore,
    reason: result.reason,
    tokensUsed,
  };
}

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const embeddingProvider = await getAndCheckProvider(
    'embedding',
    grading?.provider,
    (await getDefaultProviders()).embeddingProvider,
    'answer relevancy check',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'answer relevancy check',
  );

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  const candidateQuestions: string[] = [];
  for (let i = 0; i < 3; i++) {
    // TODO(ian): Parallelize
    const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, ANSWER_RELEVANCY_GENERATE);
    const promptText = await renderLlmRubricPrompt(rubricPrompt, { answer: tryParse(output) });
    const resp = await textProvider.callApi(promptText);
    accumulateTokens(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.output) {
      return fail(resp.error || 'No output', tokensUsed);
    }

    invariant(
      typeof resp.output === 'string',
      'answer relevancy check produced malformed response',
    );
    candidateQuestions.push(resp.output);
  }

  invariant(
    typeof embeddingProvider.callEmbeddingApi === 'function',
    `Provider ${embeddingProvider.id} must implement callEmbeddingApi for similarity check`,
  );

  const inputEmbeddingResp = await embeddingProvider.callEmbeddingApi(input);
  accumulateTokens(tokensUsed, inputEmbeddingResp.tokenUsage);
  if (inputEmbeddingResp.error || !inputEmbeddingResp.embedding) {
    return fail(inputEmbeddingResp.error || 'No embedding', tokensUsed);
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  const questionsWithScores: { question: string; similarity: number }[] = [];

  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    accumulateTokens(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.embedding) {
      return fail(resp.error || 'No embedding', tokensUsed);
    }
    const questionSimilarity = cosineSimilarity(inputEmbedding, resp.embedding);
    similarities.push(questionSimilarity);
    questionsWithScores.push({ question, similarity: questionSimilarity });
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Relevance ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Relevance ${similarity.toFixed(2)} is less than threshold ${threshold}`;

  const metadata = {
    generatedQuestions: questionsWithScores,
    averageSimilarity: similarity,
    threshold,
  };

  if (pass) {
    return {
      pass: true,
      score: similarity,
      reason: greaterThanReason,
      tokensUsed,
      metadata,
    };
  }
  return {
    pass: false,
    score: similarity,
    reason: lessThanReason,
    tokensUsed,
    metadata,
  };
}

export async function matchesContextRecall(
  context: string | string[],
  groundTruth: string,
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context recall check',
  );

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RECALL);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    groundTruth,
    ...(vars || {}),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-recall produced malformed response');
  const sentences = splitIntoSentences(resp.output);
  const sentenceAttributions: { sentence: string; attributed: boolean }[] = [];
  let numerator = 0;

  for (const sentence of sentences) {
    const isAttributed = sentence.includes(CONTEXT_RECALL_ATTRIBUTED_TOKEN);
    if (isAttributed) {
      numerator++;
    }
    // Extract the actual sentence content without the classification part
    const sentenceMatch = sentence.match(/^\d+\.\s*([^\.]+\.)/);
    const cleanSentence = sentenceMatch ? sentenceMatch[1].trim() : sentence.split('.')[0].trim();
    sentenceAttributions.push({
      sentence: cleanSentence,
      attributed: isAttributed,
    });
  }

  const score = sentences.length > 0 ? numerator / sentences.length : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    sentenceAttributions,
    totalSentences: sentences.length,
    attributedSentences: numerator,
    score,
  };

  return {
    pass,
    score,
    reason: pass
      ? `Recall ${score.toFixed(2)} is >= ${threshold}`
      : `Recall ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
    metadata,
  };
}

export async function matchesContextRelevance(
  question: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context relevance check',
  );

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RELEVANCE);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    query: question,
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-relevance produced malformed response');

  // Split context into units: use chunks if provided, otherwise split into sentences
  const contextUnits = Array.isArray(context)
    ? context.filter((chunk) => chunk.trim().length > 0)
    : splitIntoSentences(context);
  const totalContextUnits = contextUnits.length;

  // Parse the LLM's response to get relevant sentences
  const extractedSentences = splitIntoSentences(resp.output);
  const relevantSentences: string[] = [];
  const insufficientInformation = resp.output.includes(CONTEXT_RELEVANCE_BAD);

  let numerator = 0;
  if (insufficientInformation) {
    // If the entire response is "Insufficient Information", no sentences are relevant
    numerator = 0;
  } else {
    // Count the extracted sentences as relevant
    numerator = extractedSentences.length;
    relevantSentences.push(...extractedSentences);
  }

  // RAGAS CONTEXT RELEVANCE FORMULA: relevant units / total context units
  const score = totalContextUnits > 0 ? numerator / totalContextUnits : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    extractedSentences: relevantSentences,
    totalContextUnits,
    totalContextSentences: totalContextUnits, // Backward compatibility
    contextUnits: contextUnits,
    relevantSentenceCount: numerator,
    insufficientInformation,
    score,
  };

  return {
    pass,
    score,
    reason: pass
      ? `Context relevance ${score.toFixed(2)} is >= ${threshold}`
      : `Context relevance ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
    metadata,
  };
}

export async function matchesContextFaithfulness(
  query: string,
  output: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'faithfulness check',
  );

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  if (grading?.rubricPrompt) {
    invariant(Array.isArray(grading.rubricPrompt), 'rubricPrompt must be an array');
  }
  const longformPrompt: string =
    (typeof grading?.rubricPrompt?.[0] === 'string'
      ? grading?.rubricPrompt?.[0]
      : grading?.rubricPrompt?.[0].content) || CONTEXT_FAITHFULNESS_LONGFORM;
  const nliPrompt: string =
    (typeof grading?.rubricPrompt?.[1] === 'string'
      ? grading?.rubricPrompt?.[1]
      : grading?.rubricPrompt?.[1].content) || CONTEXT_FAITHFULNESS_NLI_STATEMENTS;

  let promptText = await renderLlmRubricPrompt(longformPrompt, {
    question: query,
    answer: tryParse(output),
    ...(vars || {}),
  });

  let resp = await textProvider.callApi(promptText);
  accumulateTokens(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const statements = splitIntoSentences(resp.output);
  promptText = await renderLlmRubricPrompt(nliPrompt, {
    context: contextString,
    statements,
    ...(vars || {}),
  });

  resp = await textProvider.callApi(promptText);
  accumulateTokens(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  let finalAnswer = 'Final verdict for each statement in order:';
  finalAnswer = finalAnswer.toLowerCase();
  let verdicts = resp.output.toLowerCase().trim();
  let score: number;
  if (verdicts.includes(finalAnswer)) {
    verdicts = verdicts.slice(verdicts.indexOf(finalAnswer) + finalAnswer.length);
    score =
      verdicts.split('.').filter((answer) => answer.trim() !== '' && !answer.includes('yes'))
        .length / statements.length;
  } else {
    score = (verdicts.split('verdict: no').length - 1) / statements.length;
  }
  score = 1 - score;
  const pass = score >= threshold - Number.EPSILON;
  return {
    pass,
    score,
    reason: pass
      ? `Faithfulness ${score.toFixed(2)} is >= ${threshold}`
      : `Faithfulness ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed,
  };
}

export async function matchesSelectBest(
  criteria: string,
  outputs: string[],
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'select-best assertion must have at least two outputs to compare between',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'select-best check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, SELECT_BEST_PROMPT);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    criteria,
    outputs: outputs.map((o) => tryParse(o)),
    ...(vars || {}),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return new Array(outputs.length).fill(fail(resp.error || 'No output', resp.tokenUsage));
  }

  invariant(typeof resp.output === 'string', 'select-best produced malformed response');

  const firstDigitMatch = resp.output.trim().match(/\d/);
  const verdict = firstDigitMatch ? Number.parseInt(firstDigitMatch[0], 10) : Number.NaN;

  if (Number.isNaN(verdict) || verdict < 0 || verdict >= outputs.length) {
    return new Array(outputs.length).fill(fail(`Invalid select-best verdict: ${verdict}`));
  }

  const tokensUsed = {
    total: resp.tokenUsage?.total || 0,
    prompt: resp.tokenUsage?.prompt || 0,
    completion: resp.tokenUsage?.completion || 0,
    cached: resp.tokenUsage?.cached || 0,
    numRequests: resp.tokenUsage?.numRequests || 0,
    completionDetails: resp.tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
  return outputs.map((_output, index) => {
    if (index === verdict) {
      return {
        pass: true,
        score: 1,
        reason: `Output selected as the best: ${criteria}`,
        tokensUsed,
      };
    } else {
      return {
        pass: false,
        score: 0,
        reason: `Output not selected: ${criteria}`,
        tokensUsed,
      };
    }
  });
}

export async function selectMaxScore(
  outputs: string[],
  resultsWithGradingResults: Array<{
    gradingResult?: { componentResults?: GradingResult[] } | null;
  }>,
  assertion: Assertion,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'max-score assertion must have at least two outputs to compare between',
  );

  // Parse options from assertion value
  const value = assertion.value || {};
  const options = {
    method: (typeof value === 'object' && 'method' in value ? value.method : 'average') as
      | 'average'
      | 'sum',
    weights: (typeof value === 'object' && 'weights' in value ? value.weights : {}) as Record<
      string,
      number
    >,
    threshold:
      typeof value === 'object' && 'threshold' in value ? (value.threshold as number) : undefined,
  };

  // Calculate aggregate score for each output
  const scores = resultsWithGradingResults.map((result, index) => {
    // Get component results from gradingResult if available
    const componentResults = result.gradingResult?.componentResults || [];

    // Filter out max-score and select-best assertions
    const relevantResults = componentResults.filter(
      (r: GradingResult) =>
        r.assertion && r.assertion.type !== 'max-score' && r.assertion.type !== 'select-best',
    );

    if (relevantResults.length === 0) {
      throw new Error(
        'max-score requires at least one other assertion (besides max-score or select-best) to aggregate scores from',
      );
    }

    // Calculate weighted scores for each assertion
    let totalWeightedScore = 0;
    let totalWeight = 0;

    relevantResults.forEach((componentResult: GradingResult) => {
      const assertionType = componentResult.assertion?.type || 'unknown';
      const weight =
        options.weights[assertionType] !== undefined ? options.weights[assertionType] : 1.0; // Default weight is 1

      const score = componentResult.score || 0;
      totalWeightedScore += score * weight;
      totalWeight += weight;
    });

    // Calculate aggregate score based on method
    let aggregateScore: number;
    if (options.method === 'sum') {
      aggregateScore = totalWeightedScore;
    } else {
      // Average method (default)
      aggregateScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    }

    return {
      index,
      score: aggregateScore,
      componentCount: relevantResults.length,
      totalWeight,
    };
  });

  // Find max score (with deterministic tie-breaking by index)
  let maxScore = -Infinity;
  let winnerIndex = 0;

  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > maxScore) {
      maxScore = scores[i].score;
      winnerIndex = i;
    }
  }

  // Apply threshold if specified
  const meetsThreshold = options.threshold === undefined || maxScore >= options.threshold;

  // Return results for each output
  return scores.map(({ index, score, componentCount, totalWeight }) => {
    const isWinner = index === winnerIndex && meetsThreshold;

    return {
      pass: isWinner,
      score: isWinner ? 1 : 0,
      reason: isWinner
        ? `Selected as highest scoring output (score: ${score.toFixed(3)})`
        : score === maxScore && !meetsThreshold
          ? `Not selected - score ${score.toFixed(3)} below threshold ${options.threshold}`
          : `Not selected (score: ${score.toFixed(3)}, max: ${maxScore.toFixed(3)})`,
      namedScores: {
        maxScore: score,
        assertionCount: componentCount,
        totalWeight,
      },
    };
  });
}

interface ModerationMatchOptions {
  userPrompt: string;
  assistantResponse: string;
  categories?: string[];
}

export async function matchesModeration(
  { userPrompt, assistantResponse, categories = [] }: ModerationMatchOptions,
  grading?: GradingConfig,
) {
  if (!assistantResponse) {
    return {
      pass: true,
      score: 1,
      reason: 'No output to moderate',
    };
  }

  // Get default providers
  const defaultProviders = await getDefaultProviders();

  // Only try to use Replicate if OpenAI is not available
  const hasOpenAiKey = getEnvString('OPENAI_API_KEY');
  const hasReplicateKey =
    !hasOpenAiKey && (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN'));
  const defaultModerationProvider = hasReplicateKey
    ? await loadApiProvider(LLAMA_GUARD_REPLICATE_PROVIDER)
    : defaultProviders.moderationProvider;

  const moderationProvider = (await getAndCheckProvider(
    'moderation',
    grading?.provider,
    defaultModerationProvider,
    'moderation check',
  )) as ApiModerationProvider;

  invariant(moderationProvider, 'Moderation provider must be defined');

  const resp = await moderationProvider.callModerationApi(userPrompt, assistantResponse);
  if (resp.error) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation API error: ${resp.error}`,
    };
  }

  const { flags } = resp;
  if (!flags || flags.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: 'No moderation flags detected',
    };
  }
  const filteredFlags =
    categories.length === 0 ? flags : flags.filter((flag) => categories.includes(flag.code));
  if (filteredFlags.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation flags detected: ${filteredFlags
        .map((flag) => flag.description)
        .join(', ')}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: 'No relevant moderation flags detected',
  };
}
