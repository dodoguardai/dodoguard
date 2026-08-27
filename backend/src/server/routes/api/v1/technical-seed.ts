import seedData from './technical-seed-data.json';

export type TechnicalSeedTurn = {
  role: string;
  content: string;
  expectedSafe?: string;
};

export type TechnicalSeedSample = {
  caseCode: string;
  name: string;
  attackType: string;
  prompt: string;
  expectedPass: string;
  expectedFail: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  testMethod?: string;
  caseBasis?: string;
  riskSubclass?: string;
  turns?: TechnicalSeedTurn[];
  indirectPayload?: string;
  contextSource?: string;
};

export type TechnicalSeedLibrary = {
  key: string;
  title: string;
  domain: string;
  description: string;
  defaultLevel: 'critical' | 'high' | 'medium' | 'low';
  detectMethod: string;
  standards: string[];
  enabled: boolean;
  icon: string;
  tag: string;
  basis: string;
  scope: string;
  category: string;
  samples: TechnicalSeedSample[];
};

export const technicalDomainSeeds = [
  {
    key: 'domain-system-instruction-leakage-bypass',
    domain: '系统指令泄露与绕过风险',
    title: '系统指令泄露与绕过风险',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 1,
    icon: '⚠',
  },
  {
    key: 'domain-malicious-input-dialogue-attack',
    domain: '恶意输入与对话攻击风险',
    title: '恶意输入与对话攻击风险',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 2,
    icon: '⚔',
  },
  {
    key: 'domain-output-content-risk',
    domain: '输出内容风险',
    title: '输出内容风险',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 3,
    icon: '📤',
  },
  {
    key: 'domain-knowledge-query-access-risk',
    domain: '知识库查询与信息访问风险',
    title: '知识库查询与信息访问风险',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 4,
    icon: '📚',
  },
  {
    key: 'domain-prompt-injection-risk',
    domain: '提示注入风险',
    title: '提示注入风险',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 5,
    icon: '⚠',
  },
  {
    key: 'domain-data-leakage-privacy-risk',
    domain: '数据外泄与隐私',
    title: '数据外泄与隐私',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 6,
    icon: '🔒',
  },
  {
    key: 'domain-jailbreak-bypass-risk',
    domain: '越狱与绕过',
    title: '越狱与绕过',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 7,
    icon: '⚔',
  },
  {
    key: 'domain-evasion-obfuscation-risk',
    domain: '规避与混淆',
    title: '规避与混淆',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 8,
    icon: '🧩',
  },
  {
    key: 'domain-low-quality-adversarial-noise-risk',
    domain: '低质/垃圾/对抗噪声',
    title: '低质/垃圾/对抗噪声',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 9,
    icon: '🧹',
  },
  {
    key: 'domain-resource-billing-attack-risk',
    domain: '资源消耗/账单攻击',
    title: '资源消耗/账单攻击',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 10,
    icon: '⏱',
  },
  {
    key: 'domain-sensitive-content-risk',
    domain: '敏感内容',
    title: '敏感内容',
    description: '一级分类占位，用于对话安全测试用例库分类展示。',
    order: 11,
    icon: '📤',
  },
] as const;

export const technicalSeedLibraries = seedData.libraries as TechnicalSeedLibrary[];

export const LEGACY_TECHNICAL_LIBRARY_KEYS = [
  'prompt-injection',
  'session-adversarial',
  'rag-permission',
  'model-output-harmful',
] as const;

export function technicalLibraryMetadata(item: TechnicalSeedLibrary): Record<string, unknown> {
  return {
    seeded: true,
    libraryCategory: 'technical',
    icon: item.icon,
    tag: item.tag,
    category: item.category,
    basis: item.basis,
    scope: item.scope,
  };
}

export function buildTechnicalSampleMetadata(sample: TechnicalSeedSample): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    seeded: true,
    testMethod: sample.testMethod,
    caseBasis: sample.caseBasis,
    riskSubclass: sample.riskSubclass,
  };
  if (sample.turns?.length) {
    metadata.turns = sample.turns;
  }
  if (sample.indirectPayload) {
    metadata.indirectPayload = sample.indirectPayload;
  }
  if (sample.contextSource) {
    metadata.contextSource = sample.contextSource;
  }
  return metadata;
}
