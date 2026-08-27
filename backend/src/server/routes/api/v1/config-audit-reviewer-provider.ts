import { resolveLlmProviderPayloadForRuntime } from '../../../../lib/resolve-llm-provider-runtime';

export type ConfigAuditReviewerProvider = {
  id: string;
  config?: Record<string, unknown>;
};

export async function resolveConfigAuditReviewerProvider(params: {
  provider?: ConfigAuditReviewerProvider;
  organizationId?: string | null;
}): Promise<ConfigAuditReviewerProvider | undefined> {
  const preferredModelId = params.provider?.id;
  const resolved = await resolveLlmProviderPayloadForRuntime({
    preferredModelId,
    organizationId: params.organizationId,
  });

  if (!resolved) {
    return params.provider;
  }

  return {
    id: resolved.id,
    config: {
      ...(params.provider?.config ?? {}),
      ...resolved.config,
    },
  };
}
