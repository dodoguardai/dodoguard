import path from 'path';

import { fetchWithCache } from '../../cache';
import cliState from '../../cliState';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { isJavascriptFile } from '../../util/fileExtensions';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util/index';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from './';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';
import { calculateOpenAICost, getTokenUsage, OPENAI_CHAT_MODELS } from './util';

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  declare config: OpenAiCompletionOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown chat model: ${modelName}`);
    }
    // Debug: Log options before calling super
    logger.debug(
      `[OpenAiChatCompletionProvider] Constructor: modelName=${modelName}, has options.config=${!!options.config}, has apiKey=${!!options.config?.apiKey}, has apiBaseUrl=${!!options.config?.apiBaseUrl}`,
    );
    if (options.config?.apiKey) {
      logger.debug(
        `[OpenAiChatCompletionProvider] Constructor: apiKey=${(options.config.apiKey as string).substring(0, 10)}...`,
      );
    }
    if (options.config?.apiBaseUrl) {
      logger.debug(
        `[OpenAiChatCompletionProvider] Constructor: apiBaseUrl=${options.config.apiBaseUrl}`,
      );
      console.log(
        `[OpenAiChatCompletionProvider] Constructor: 接收到的 apiBaseUrl=${options.config.apiBaseUrl}`,
      );
    } else {
      console.log(`[OpenAiChatCompletionProvider] Constructor: ⚠️  未接收到 apiBaseUrl`);
    }
    super(modelName, options);
    // Merge options.config with parent's config to ensure apiKey and apiBaseUrl are preserved
    // Parent class already sets this.config = config ? { ...config } : {}, so we need to merge options.config
    // to ensure any apiKey and apiBaseUrl from options.config are not lost
    // 重要：确保 options.config 中的所有属性（特别是 apiKey 和 apiBaseUrl）被正确合并
    // 父类已经复制了 config，但为了确保所有属性都被保留，我们再次合并
    // 即使 options.config 存在，也要确保所有属性都被正确合并
    if (options.config) {
      // 合并 options.config 到 this.config，确保 apiKey 和 apiBaseUrl 被保留
      // 使用展开运算符确保所有属性都被复制
      this.config = {
        ...this.config,
        ...options.config,
      };
      logger.debug(
        `[OpenAiChatCompletionProvider] Merged config: keys=${Object.keys(this.config).join(', ')}, has apiKey=${!!this.config.apiKey}, has apiBaseUrl=${!!this.config.apiBaseUrl}`,
      );
      if (this.config.apiKey) {
        logger.debug(
          `[OpenAiChatCompletionProvider] Merged config apiKey=${(this.config.apiKey as string).substring(0, 10)}...`,
        );
      }
      if (this.config.apiBaseUrl) {
        logger.debug(
          `[OpenAiChatCompletionProvider] Merged config apiBaseUrl=${this.config.apiBaseUrl}`,
        );
      }
    } else {
      logger.debug(
        `[OpenAiChatCompletionProvider] No options.config to merge: this.config keys=${Object.keys(this.config).join(', ')}, has apiKey=${!!this.config.apiKey}, has apiBaseUrl=${!!this.config.apiBaseUrl}`,
      );
    }
    // Debug: Log merged config
    logger.debug(
      `[OpenAiChatCompletionProvider] After merge: has apiKey=${!!this.config.apiKey}, has apiBaseUrl=${!!this.config.apiBaseUrl}`,
    );
    if (this.config.apiKey) {
      logger.debug(
        `[OpenAiChatCompletionProvider] After merge: apiKey=${(this.config.apiKey as string).substring(0, 10)}...`,
      );
    }

    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();
  }

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    config: OpenAiCompletionOptions,
  ): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      // Format the result
      if (result === undefined || result === null) {
        return '';
      } else if (typeof result === 'object') {
        try {
          return JSON.stringify(result);
        } catch (error) {
          logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
          return String(result);
        }
      } else {
        return String(result);
      }
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error; // Re-throw so caller can handle fallback behavior
    }
  }

  protected isReasoningModel(): boolean {
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4') ||
      this.modelName.startsWith('gpt-5')
    );
  }

  protected supportsTemperature(): boolean {
    // OpenAI's o1 and o3 models don't support temperature but some 3rd
    // party reasoning models do.
    return !this.isReasoningModel();
  }

  getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const isReasoningModel = this.isReasoningModel();
    const isGPT5Model = this.modelName.startsWith('gpt-5');
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokens =
      isReasoningModel || isGPT5Model
        ? undefined
        : (config.max_tokens ??
          getEnvInt('OPENAI_MAX_TOKENS') ??
          (config.omitDefaultMaxTokens ? undefined : 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const fileTools = config.tools
      ? maybeLoadToolsFromExternalFile(config.tools, context?.vars) || []
      : [];
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature ? { temperature } : {}),
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.presence_penalty !== undefined || getEnvString('OPENAI_PRESENCE_PENALTY')
        ? {
            presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
          }
        : {}),
      ...(config.frequency_penalty !== undefined || getEnvString('OPENAI_FREQUENCY_PENALTY')
        ? {
            frequency_penalty:
              config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
          }
        : {}),
      ...(config.functions
        ? {
            functions: maybeLoadFromExternalFile(
              renderVarsInObject(config.functions, context?.vars),
            ),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.tool_resources ? { tool_resources: config.tool_resources } : {}),
      ...(config.response_format
        ? {
            response_format: maybeLoadFromExternalFile(
              renderVarsInObject(config.response_format, context?.vars),
            ),
          }
        : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
      ...(this.modelName.includes('audio')
        ? {
            modalities: config.modalities || ['text', 'audio'],
            audio: config.audio || { voice: 'alloy', format: 'wav' },
          }
        : {}),
      // GPT-5 only: attach verbosity if provided
      ...(this.modelName.startsWith('gpt-5') && config.verbosity
        ? { verbosity: config.verbosity }
        : {}),
    };

    // Handle reasoning_effort and reasoning parameters for reasoning models
    if (
      config.reasoning_effort &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.startsWith('gpt-5'))
    ) {
      body.reasoning_effort = config.reasoning_effort;
    }

    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4'))
    ) {
      body.reasoning = config.reasoning;
    }

    // Add other basic parameters
    if (config.service_tier) {
      body.service_tier = config.service_tier;
    }
    if (config.user) {
      body.user = config.user;
    }
    if (config.metadata) {
      body.metadata = config.metadata;
    }
    if (config.store !== undefined) {
      body.store = config.store;
    }

    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    // Debug: Log config state before checking API key
    logger.debug(
      `[OpenAiChatCompletionProvider] callApi: has this.config=${!!this.config}, config keys=${this.config ? Object.keys(this.config).join(', ') : 'none'}, has apiKey=${!!this.config?.apiKey}`,
    );
    if (this.config?.apiKey) {
      logger.debug(
        `[OpenAiChatCompletionProvider] callApi: apiKey=${(this.config.apiKey as string).substring(0, 10)}...`,
      );
    }
    const apiKey = this.getApiKey();
    logger.debug(
      `[OpenAiChatCompletionProvider] callApi: requiresApiKey=${this.requiresApiKey()}, getApiKey() result=${!!apiKey}`,
    );
    if (this.requiresApiKey() && !apiKey) {
      logger.debug(
        `[OpenAiChatCompletionProvider] callApi: API key check failed. this.config.apiKey=${!!this.config?.apiKey}, this.env=${!!this.env}, OPENAI_API_KEY env=${!!process.env.OPENAI_API_KEY}`,
      );
      throw new Error(
        `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`,
      );
    }

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);

    // 获取实际使用的 API URL
    const apiUrl = this.getApiUrl();
    const fullUrl = `${apiUrl}/chat/completions`;

    // 输出 API 调用信息到控制台
    console.log('\n' + '='.repeat(80));
    console.log('📡 [审查大模型 API 调用] 准备发送请求');
    console.log('='.repeat(80));
    console.log(`🌐 API URL: ${fullUrl}`);
    console.log(`📌 模型: ${this.modelName}`);
    console.log(`🔧 Config.apiBaseUrl: ${this.config.apiBaseUrl || '未设置'}`);
    console.log(`🔧 Config.apiKey: ${this.config.apiKey ? '已设置' : '未设置'}`);
    if (this.config.apiKey) {
      const maskedKey =
        this.config.apiKey.length > 10
          ? `${this.config.apiKey.substring(0, 6)}...${this.config.apiKey.substring(this.config.apiKey.length - 4)}`
          : '***';
      console.log(`🔑 使用的 API Key: ${maskedKey} (长度: ${this.config.apiKey.length})`);
    }
    console.log('='.repeat(80) + '\n');

    let data, status, statusText;
    let cached = false;
    let latencyMs: number | undefined;
    try {
      ({ data, cached, status, statusText, latencyMs } = await fetchWithCache(
        fullUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        const errorMessage = `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`;

        // Check if this is an invalid_prompt error code (indicates refusal)
        if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
          return {
            output: errorMessage,
            tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
            latencyMs,
            isRefusal: true,
            guardrails: {
              flagged: true,
              flaggedInput: true, // This error specifically indicates input was rejected
            },
          };
        }

        return {
          error: errorMessage,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      const message = data.choices[0].message;
      const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

      // Track content filtering for guardrails
      const contentFiltered = finishReason === FINISH_REASON_MAP.content_filter;

      if (message.refusal) {
        return {
          output: message.refusal,
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          ...(finishReason && { finishReason }),
          guardrails: { flagged: true }, // Refusal is ALWAYS a guardrail violation
        };
      }

      // Check if content was filtered
      if (contentFiltered) {
        return {
          output: message.content || 'Content filtered by provider',
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          finishReason: FINISH_REASON_MAP.content_filter,
          guardrails: {
            flagged: true,
          },
        };
      }

      let output = '';
      if (message.reasoning) {
        // Prefer final assistant text when present: some reasoning models put chain-of-thought in
        // `reasoning` and the user-visible JSON answer in `content`. Using only `reasoning`
        // breaks JSON-mode and structured audits (e.g. Dify config audit).
        const contentStr =
          typeof message.content === 'string'
            ? message.content
            : Array.isArray(message.content)
              ? (message.content as Array<{ text?: string; type?: string }>)
                  .map((p) => (typeof p?.text === 'string' ? p.text : ''))
                  .filter(Boolean)
                  .join('\n')
              : '';
        output = contentStr.trim() ? contentStr : message.reasoning;
      } else if (message.content && (message.function_call || message.tool_calls)) {
        if (Array.isArray(message.tool_calls) && message.tool_calls.length === 0) {
          output = message.content;
        } else {
          output = message;
        }
      } else if (
        message.content === null ||
        message.content === undefined ||
        (message.content === '' && message.tool_calls)
      ) {
        output = message.function_call || message.tool_calls;
      } else {
        output = message.content;
      }
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      // Handle structured output
      if (config.response_format?.type === 'json_schema' && typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }

      // Handle function tool callbacks
      const functionCalls = message.function_call ? [message.function_call] : message.tool_calls;
      if (functionCalls && (config.functionToolCallbacks || this.mcpClient)) {
        const results = [];
        let hasSuccessfulCallback = false;
        for (const functionCall of functionCalls) {
          const functionName = functionCall.name || functionCall.function?.name;

          // Try MCP first if available
          if (this.mcpClient) {
            const mcpTools = this.mcpClient.getAllTools();
            const mcpTool = mcpTools.find((tool) => tool.name === functionName);
            if (mcpTool) {
              try {
                const args = functionCall.arguments || functionCall.function?.arguments || '{}';
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const mcpResult = await this.mcpClient.callTool(functionName, parsedArgs);

                if (mcpResult?.error) {
                  results.push(`MCP Tool Error (${functionName}): ${mcpResult.error}`);
                } else {
                  // Normalize MCP content to a readable string
                  const normalizeContent = (content: any): string => {
                    if (content == null) {
                      return '';
                    }
                    if (typeof content === 'string') {
                      return content;
                    }
                    if (Array.isArray(content)) {
                      return content
                        .map((part) => {
                          if (typeof part === 'string') {
                            return part;
                          }
                          if (part && typeof part === 'object') {
                            if ('text' in part && (part as any).text != null) {
                              return String((part as any).text);
                            }
                            if ('json' in part) {
                              return JSON.stringify((part as any).json);
                            }
                            if ('data' in part) {
                              return JSON.stringify((part as any).data);
                            }
                            return JSON.stringify(part);
                          }
                          return String(part);
                        })
                        .join('\n');
                    }
                    return JSON.stringify(content);
                  };

                  const content = normalizeContent(mcpResult?.content);
                  results.push(`MCP Tool Result (${functionName}): ${content}`);
                }
                hasSuccessfulCallback = true;
                continue; // Skip to next function call
              } catch (error) {
                logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
                results.push(`MCP Tool Error (${functionName}): ${error}`);
                hasSuccessfulCallback = true;
                continue; // Skip to next function call
              }
            }
          }

          // Fall back to regular function callbacks
          if (config.functionToolCallbacks && config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await this.executeFunctionCallback(
                functionName,
                functionCall.arguments || functionCall.function?.arguments,
                config,
              );
              results.push(functionResult);
              hasSuccessfulCallback = true;
            } catch (error) {
              // If callback fails, fall back to original behavior (return the function call)
              logger.debug(
                `Function callback failed for ${functionName} with error ${error}, falling back to original output`,
              );
              hasSuccessfulCallback = false;
              break;
            }
          }
        }
        if (hasSuccessfulCallback && results.length > 0) {
          return {
            output: results.join('\n'),
            tokenUsage: getTokenUsage(data, cached),
            cached,
            latencyMs,
            logProbs,
            ...(finishReason && { finishReason }),
            cost: calculateOpenAICost(
              this.modelName,
              config,
              data.usage?.prompt_tokens,
              data.usage?.completion_tokens,
              data.usage?.audio_prompt_tokens,
              data.usage?.audio_completion_tokens,
            ),
            guardrails: { flagged: contentFiltered },
          };
        }
      }

      // DashScope / LM Studio (Qwen3): `message.content` is empty but the model output lives in
      // `reasoning_content` (especially when max_tokens is consumed by thinking).
      if (
        typeof output === 'string' &&
        !output.trim() &&
        message.reasoning_content &&
        typeof message.reasoning_content === 'string' &&
        message.reasoning_content.trim()
      ) {
        output = message.reasoning_content;
      }

      // DeepSeek / DashScope: reasoning_content is chain-of-thought; real answer stays in `output`.
      // Prepending "Thinking: ..." breaks JSON parsing for response_format json_object / json_schema.
      const isStructuredJsonOutput =
        config.response_format?.type === 'json_object' ||
        config.response_format?.type === 'json_schema';

      if (
        message.reasoning_content &&
        typeof message.reasoning_content === 'string' &&
        typeof output === 'string' &&
        output.trim() &&
        output.trim() !== message.reasoning_content.trim() &&
        (this.config.showThinking ?? true) &&
        !isStructuredJsonOutput
      ) {
        output = `Thinking: ${message.reasoning_content}\n\n${output}`;
      }

      if (message.audio) {
        return {
          output: message.audio.transcript || '',
          audio: {
            id: message.audio.id,
            expiresAt: message.audio.expires_at,
            data: message.audio.data,
            transcript: message.audio.transcript,
            format: message.audio.format || 'wav',
          },
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          logProbs,
          ...(finishReason && { finishReason }),
          cost: calculateOpenAICost(
            this.modelName,
            config,
            data.usage?.prompt_tokens,
            data.usage?.completion_tokens,
            data.usage?.audio_prompt_tokens,
            data.usage?.audio_completion_tokens,
          ),
          guardrails: { flagged: contentFiltered },
        };
      }

      return {
        output,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        logProbs,
        ...(finishReason && { finishReason }),
        cost: calculateOpenAICost(
          this.modelName,
          config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
          data.usage?.audio_prompt_tokens,
          data.usage?.audio_completion_tokens,
        ),
        guardrails: { flagged: contentFiltered },
      };
    } catch (err) {
      await data?.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
