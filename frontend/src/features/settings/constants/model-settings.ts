/** Model type sections — aligned with admission prototype `modelTypeDefs`. */

export const MODEL_TYPE_DEFS = [
  {
    id: 'chat',
    labelKey: 'pages.settingsModels.types.chat.label',
    descKey: 'pages.settingsModels.types.chat.desc',
  },
  {
    id: 'embedding',
    labelKey: 'pages.settingsModels.types.embedding.label',
    descKey: 'pages.settingsModels.types.embedding.desc',
  },
  {
    id: 'rerank',
    labelKey: 'pages.settingsModels.types.rerank.label',
    descKey: 'pages.settingsModels.types.rerank.desc',
  },
  {
    id: 'vllm',
    labelKey: 'pages.settingsModels.types.vllm.label',
    descKey: 'pages.settingsModels.types.vllm.desc',
  },
  {
    id: 'asr',
    labelKey: 'pages.settingsModels.types.asr.label',
    descKey: 'pages.settingsModels.types.asr.desc',
  },
] as const;

export type ModelTypeId = (typeof MODEL_TYPE_DEFS)[number]['id'];

export const MODEL_TYPE_IDS: ModelTypeId[] = MODEL_TYPE_DEFS.map((def) => def.id);

export const MODEL_PROVIDERS = [
  { id: 'custom_openai', labelKey: 'pages.settingsModels.providers.customOpenai' },
  { id: 'ollama', labelKey: 'pages.settingsModels.providers.ollama' },
  { id: 'sglang', labelKey: 'pages.settingsModels.providers.sglang' },
  { id: 'openai', labelKey: 'pages.settingsModels.providers.openai' },
  { id: 'tiekeyuan', labelKey: 'pages.settingsModels.providers.tiekeyuan' },
] as const;

/** Chat dialog — 服务商 options (cpModelModal prototype). */
export const CHAT_VENDORS = [
  { id: 'custom_openai', labelKey: 'pages.settingsModels.vendors.customOpenai' },
  { id: 'openai', labelKey: 'pages.settingsModels.vendors.openai' },
  { id: 'anthropic', labelKey: 'pages.settingsModels.vendors.anthropic' },
  { id: 'deepseek', labelKey: 'pages.settingsModels.vendors.deepseek' },
  { id: 'azure_openai', labelKey: 'pages.settingsModels.vendors.azureOpenai' },
  { id: 'aliyun', labelKey: 'pages.settingsModels.vendors.aliyun' },
  { id: 'doubao', labelKey: 'pages.settingsModels.vendors.doubao' },
  { id: 'ollama', labelKey: 'pages.settingsModels.vendors.ollama' },
] as const;

export const MODEL_SOURCES = [
  { id: 'ollama', labelKey: 'pages.settingsModels.sources.ollama' },
  { id: 'lmstudio', labelKey: 'pages.settingsModels.sources.lmstudio' },
  { id: 'sglang', labelKey: 'pages.settingsModels.sources.sglang' },
  { id: 'remote', labelKey: 'pages.settingsModels.sources.remote' },
] as const;

export type ModelSourceId = (typeof MODEL_SOURCES)[number]['id'];

export type ModelProviderId = (typeof MODEL_PROVIDERS)[number]['id'];

/** Demo seeds — shown per type when API has no models (matches admission `defaultModels`). */
export const DEFAULT_MODEL_SEEDS: Record<
  ModelTypeId,
  Array<{
    id: string;
    name: string;
    provider: ModelProviderId;
    endpoint: string;
  }>
> = {
  chat: [],
  embedding: [
    {
      id: 'seed-mdl-bge-embed',
      name: 'bge-large-zh-v1.5',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    },
  ],
  rerank: [],
  vllm: [],
  asr: [],
};

export const SEED_MODEL_ID_PREFIX = 'seed-';

export function isSeedModelId(id: string): boolean {
  return id.startsWith(SEED_MODEL_ID_PREFIX);
}

export function slugFromModelName(name: string, provider: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${provider}:${slug || 'model'}`;
}

export function isModelTypeId(value: unknown): value is ModelTypeId {
  return typeof value === 'string' && (MODEL_TYPE_IDS as readonly string[]).includes(value);
}
