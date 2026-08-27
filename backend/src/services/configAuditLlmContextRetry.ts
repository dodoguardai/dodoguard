import type { ApiProvider, ProviderResponse } from '../types';
import { loadApiProviders } from '../providers/index';

export const CONFIG_AUDIT_CONTEXT_RETRY_PAYLOAD_CHARS = 4000;
export const CONFIG_AUDIT_CONTEXT_RETRY_MAX_OUTPUT_TOKENS = 1024;

export function isConfigAuditContextLengthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('context length') ||
    normalized.includes('maximum context') ||
    normalized.includes('maximum context length') ||
    normalized.includes('requested token count exceeds') ||
    normalized.includes('longer than the model') ||
    normalized.includes('too many tokens') ||
    normalized.includes('tokens is longer')
  );
}

export function compactConfigAuditPayloadForContextRetry(payloadJson: string): string {
  if (payloadJson.length <= CONFIG_AUDIT_CONTEXT_RETRY_PAYLOAD_CHARS) {
    return payloadJson;
  }
  return `${payloadJson.slice(
    0,
    CONFIG_AUDIT_CONTEXT_RETRY_PAYLOAD_CHARS,
  )}\n...[truncated after model context-length error]`;
}

export function buildConfigAuditContextRetryProviderConfig(
  providerConfig: Record<string, unknown>,
) {
  return {
    ...providerConfig,
    max_tokens: CONFIG_AUDIT_CONTEXT_RETRY_MAX_OUTPUT_TOKENS,
    max_completion_tokens: CONFIG_AUDIT_CONTEXT_RETRY_MAX_OUTPUT_TOKENS,
  };
}

export async function callConfigAuditWithContextRetry(args: {
  provider: ApiProvider;
  providerId: string;
  providerConfig: Record<string, unknown>;
  prompt: string;
  buildPrompt: (payloadJson: string, truncated: boolean) => string;
  payloadJson: string;
  truncated: boolean;
  logger: {
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
  logPrefix: string;
}): Promise<{
  response: ProviderResponse;
  payloadJson: string;
  truncated: boolean;
}> {
  let response = await args.provider.callApi(args.prompt);
  let effectivePayloadJson = args.payloadJson;
  let effectiveTruncated = args.truncated;

  if (response.error && isConfigAuditContextLengthError(response.error)) {
    effectivePayloadJson = compactConfigAuditPayloadForContextRetry(args.payloadJson);
    effectiveTruncated = effectiveTruncated || effectivePayloadJson !== args.payloadJson;
    const retryPrompt = args.buildPrompt(effectivePayloadJson, effectiveTruncated);

    args.logger.warn(
      `${args.logPrefix} Retrying with reduced token budget after context-length error`,
      {
        providerId: args.providerId,
        originalPayloadChars: args.payloadJson.length,
        retryPayloadChars: effectivePayloadJson.length,
        retryMaxOutputTokens: CONFIG_AUDIT_CONTEXT_RETRY_MAX_OUTPUT_TOKENS,
      },
    );

    const [contextRetryProviderLoaded] = await loadApiProviders([
      {
        id: args.providerId,
        config: buildConfigAuditContextRetryProviderConfig(args.providerConfig),
      },
    ]);
    const contextRetryProvider = contextRetryProviderLoaded?.callApi
      ? contextRetryProviderLoaded
      : args.provider;
    response = await contextRetryProvider.callApi(retryPrompt);
  }

  return {
    response,
    payloadJson: effectivePayloadJson,
    truncated: effectiveTruncated,
  };
}
