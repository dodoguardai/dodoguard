import {
  isLmStudioCompatibleUrl,
  isOllamaCompatibleUrl,
  isOptionalApiKeyLocalLlm,
  isSglangCompatibleUrl,
  openAiJsonObjectResponseFormat,
  supportsOpenAiJsonObjectResponseFormat,
} from '../../backend/src/lib/localLlmUrl';

describe('localLlmUrl', () => {
  it('detects Ollama-compatible URLs', () => {
    expect(isOllamaCompatibleUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isOllamaCompatibleUrl('http://127.0.0.1:1234/v1')).toBe(false);
  });

  it('detects LM Studio-compatible URLs', () => {
    expect(isLmStudioCompatibleUrl('http://127.0.0.1:1234/v1')).toBe(true);
    expect(isLmStudioCompatibleUrl('http://host.docker.internal:1234/v1')).toBe(true);
    expect(isLmStudioCompatibleUrl('http://localhost:1234/v1/chat/completions')).toBe(true);
    expect(isLmStudioCompatibleUrl('http://127.0.0.1:30000/v1')).toBe(false);
    expect(isOllamaCompatibleUrl('http://127.0.0.1:11434')).toBe(true);
  });

  it('detects SGLang-compatible URLs', () => {
    expect(isSglangCompatibleUrl('http://127.0.0.1:30000/v1')).toBe(true);
    expect(isSglangCompatibleUrl('http://localhost:1234/v1')).toBe(false);
  });

  it('treats Ollama provider ids and LM Studio URLs as optional-api-key local LLMs', () => {
    expect(isOptionalApiKeyLocalLlm('', 'ollama:chat:llama3')).toBe(true);
    expect(isOptionalApiKeyLocalLlm('http://127.0.0.1:1234/v1', 'openai:chat:qwen/qwen3-8b')).toBe(
      true,
    );
    expect(
      isOptionalApiKeyLocalLlm('http://host.docker.internal:1234/v1', 'openai:chat:qwen/qwen3-8b'),
    ).toBe(true);
    expect(isOptionalApiKeyLocalLlm('http://127.0.0.1:30000/v1', 'openai:chat:qwen2.5-1.5b')).toBe(
      true,
    );
    expect(isOptionalApiKeyLocalLlm('https://api.openai.com/v1', 'openai:chat:gpt-4o-mini')).toBe(
      false,
    );
  });

  it('skips json_object response_format for local OpenAI-compatible endpoints', () => {
    expect(supportsOpenAiJsonObjectResponseFormat('http://host.docker.internal:1234/v1')).toBe(
      false,
    );
    expect(openAiJsonObjectResponseFormat('http://127.0.0.1:1234/v1')).toBeUndefined();
    expect(supportsOpenAiJsonObjectResponseFormat('http://127.0.0.1:30000/v1')).toBe(false);
    expect(openAiJsonObjectResponseFormat('http://127.0.0.1:30000/v1')).toBeUndefined();
    expect(supportsOpenAiJsonObjectResponseFormat('https://api.openai.com/v1')).toBe(true);
    expect(openAiJsonObjectResponseFormat('https://api.openai.com/v1')).toEqual({
      type: 'json_object',
    });
  });
});
