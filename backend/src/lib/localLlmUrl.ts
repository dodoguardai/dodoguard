/** Ollama default port or URL hints */
export function isOllamaCompatibleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const isLocal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return (isLocal && u.port === '11434') || url.toLowerCase().includes('ollama');
  } catch {
    return url.includes('11434') || url.toLowerCase().includes('ollama');
  }
}

/** LM Studio default port 1234 or URL hints. */
export function isLmStudioCompatibleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isDockerHost = host === 'host.docker.internal';
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    return (
      u.port === '1234' ||
      (isDockerHost && u.port === '1234') ||
      (isLoopback && u.port === '1234') ||
      url.toLowerCase().includes('lmstudio')
    );
  } catch {
    return url.includes(':1234') || url.toLowerCase().includes('lmstudio');
  }
}

/** SGLang's default OpenAI-compatible server port or URL hints. */
export function isSglangCompatibleUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.port === '30000' || url.toLowerCase().includes('sglang');
  } catch {
    return url.includes(':30000') || url.toLowerCase().includes('sglang');
  }
}

/**
 * OpenAI `response_format: { type: 'json_object' }` — not supported consistently by local
 * OpenAI-compatible runtimes such as LM Studio and SGLang.
 */
export function supportsOpenAiJsonObjectResponseFormat(apiBaseUrl: string): boolean {
  return !isLmStudioCompatibleUrl(apiBaseUrl) && !isSglangCompatibleUrl(apiBaseUrl);
}

/** Use when calling OpenAI-compatible chat APIs that may be LM Studio. */
export function openAiJsonObjectResponseFormat(
  apiBaseUrl: string,
): { type: 'json_object' } | undefined {
  return supportsOpenAiJsonObjectResponseFormat(apiBaseUrl) ? { type: 'json_object' } : undefined;
}

/**
 * Default YAML/JSON excerpt length for config-static LLM judge when using LM Studio.
 * Full judge prompt + 120k YAML can exceed a 4096-token context window (~26k tokens observed).
 */
export const LM_STUDIO_CONFIG_STATIC_YAML_MAX_CHARS = 4000;

/** Local LLMs that typically do not require a real API key. */
export function isOptionalApiKeyLocalLlm(url: string, providerId?: string): boolean {
  const id = (providerId ?? '').toLowerCase();
  if (id.startsWith('ollama:')) {
    return true;
  }
  if (!url) {
    return false;
  }
  return isOllamaCompatibleUrl(url) || isLmStudioCompatibleUrl(url) || isSglangCompatibleUrl(url);
}
