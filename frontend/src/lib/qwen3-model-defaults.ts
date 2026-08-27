/** Qwen3 family models default to thinking mode, which breaks non-streaming API calls. */
export function isQwen3ModelName(modelName: string): boolean {
  return /qwen3/i.test(String(modelName).trim());
}

/** Merge passthrough fields that disable Qwen3 "thinking" for non-streaming requests. */
export function mergeQwen3ThinkingDisablePassthrough(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const existingPassthrough =
    typeof config.passthrough === 'object' &&
    config.passthrough &&
    !Array.isArray(config.passthrough)
      ? (config.passthrough as Record<string, unknown>)
      : {};

  const existingTemplateKwargs =
    typeof existingPassthrough.chat_template_kwargs === 'object' &&
    existingPassthrough.chat_template_kwargs &&
    !Array.isArray(existingPassthrough.chat_template_kwargs)
      ? (existingPassthrough.chat_template_kwargs as Record<string, unknown>)
      : {};

  return {
    ...config,
    passthrough: {
      ...existingPassthrough,
      // DashScope / Qwen3 OpenAI-compatible API: top-level snake_case for non-streaming calls
      enable_thinking: existingPassthrough.enable_thinking ?? false,
      enableThinking: existingPassthrough.enableThinking ?? false,
      chat_template_kwargs: {
        ...existingTemplateKwargs,
        enable_thinking: existingTemplateKwargs.enable_thinking ?? false,
      },
    },
  };
}
