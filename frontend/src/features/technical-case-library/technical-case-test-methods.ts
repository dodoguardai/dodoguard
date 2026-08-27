import type { SecurityTestCase } from '@/types/entities';

export type TechnicalTestMethodSlug = 'direct' | 'multi_turn' | 'custom';

export const TECHNICAL_TEST_METHODS: Array<{
  slug: TechnicalTestMethodSlug;
  label: string;
}> = [
  { slug: 'direct', label: '单轮对话测试' },
  { slug: 'multi_turn', label: '多轮对话测试' },
  { slug: 'custom', label: '自定义' },
];

export const TECHNICAL_TEST_METHOD_LABELS: Record<TechnicalTestMethodSlug, string> =
  Object.fromEntries(
    TECHNICAL_TEST_METHODS.map((item) => [item.slug, item.label]),
  ) as Record<TechnicalTestMethodSlug, string>;

const LEGACY_ATTACK_TYPE_MAP: Record<string, TechnicalTestMethodSlug> = {
  direct: 'direct',
  prompt_injection: 'direct',
  multi_turn: 'multi_turn',
};

export type TurnStep = {
  userInput: string;
  expectedSafe: string;
};

export type TechnicalCaseMetadata = {
  testMethod?: string;
  attackScene?: string;
  riskSubclass?: string;
  caseBasis?: string;
  turnSteps?: TurnStep[];
};

function isBuiltinTestMethodLabel(label: string): label is (typeof TECHNICAL_TEST_METHOD_LABELS)[TechnicalTestMethodSlug] {
  return Object.values(TECHNICAL_TEST_METHOD_LABELS).includes(label);
}

export function resolveTestMethodSlug(
  attackType?: string,
  metadata?: Record<string, unknown> | null,
): TechnicalTestMethodSlug {
  const meta = (metadata || {}) as TechnicalCaseMetadata;
  if (meta.testMethod) {
    if (meta.testMethod === TECHNICAL_TEST_METHOD_LABELS.direct) return 'direct';
    if (meta.testMethod === TECHNICAL_TEST_METHOD_LABELS.multi_turn) return 'multi_turn';
    if (meta.testMethod === TECHNICAL_TEST_METHOD_LABELS.custom) return 'custom';
    return 'custom';
  }
  const normalized = String(attackType || 'direct').toLowerCase();
  return LEGACY_ATTACK_TYPE_MAP[normalized] || 'custom';
}

export function resolveTestMethodLabel(
  attackType?: string,
  metadata?: Record<string, unknown> | null,
): string {
  const meta = (metadata || {}) as TechnicalCaseMetadata;
  if (meta.testMethod) return meta.testMethod;
  const slug = resolveTestMethodSlug(attackType, metadata);
  if (slug === 'custom') {
    const custom = resolveCustomTestMethodLabel(attackType, metadata);
    return custom || attackType || TECHNICAL_TEST_METHOD_LABELS.custom;
  }
  return TECHNICAL_TEST_METHOD_LABELS[slug] || attackType || TECHNICAL_TEST_METHOD_LABELS.direct;
}

/** Filter key for tabs: builtin slugs, or the custom method label itself. */
export function resolveTestMethodFilterKey(
  attackType?: string,
  metadata?: Record<string, unknown> | null,
): string {
  const slug = resolveTestMethodSlug(attackType, metadata);
  if (slug === 'direct' || slug === 'multi_turn') {
    return slug;
  }
  const label = resolveTestMethodLabel(attackType, metadata);
  if (label && label !== TECHNICAL_TEST_METHOD_LABELS.custom) {
    return label;
  }
  return TECHNICAL_TEST_METHOD_LABELS.custom;
}

export type TestMethodFilterTab = {
  key: string;
  label: string;
  count: number;
};

export function buildTestMethodFilterTabs(cases: SecurityTestCase[]): TestMethodFilterTab[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const item of cases) {
    const key = resolveTestMethodFilterKey(item.attackType, item.metadata);
    const label = resolveTestMethodLabel(item.attackType, item.metadata);
    counts.set(key, (counts.get(key) || 0) + 1);
    labels.set(key, label);
  }

  const tabs: TestMethodFilterTab[] = [];
  for (const method of TECHNICAL_TEST_METHODS) {
    if (method.slug === 'custom') continue;
    const count = counts.get(method.slug) || 0;
    if (count > 0) {
      tabs.push({ key: method.slug, label: method.label, count });
    }
  }

  const customKeys = [...counts.keys()].filter(
    (key) => key !== 'direct' && key !== 'multi_turn' && key !== TECHNICAL_TEST_METHOD_LABELS.custom,
  );
  customKeys.sort((a, b) => (labels.get(a) || a).localeCompare(labels.get(b) || b, 'zh-CN'));

  for (const key of customKeys) {
    tabs.push({
      key,
      label: labels.get(key) || key,
      count: counts.get(key) || 0,
    });
  }

  const genericCustomCount = counts.get(TECHNICAL_TEST_METHOD_LABELS.custom) || 0;
  if (genericCustomCount > 0) {
    tabs.push({
      key: TECHNICAL_TEST_METHOD_LABELS.custom,
      label: TECHNICAL_TEST_METHOD_LABELS.custom,
      count: genericCustomCount,
    });
  }

  return tabs;
}

export function resolveCustomTestMethodLabel(
  attackType?: string,
  metadata?: Record<string, unknown> | null,
): string {
  const meta = (metadata || {}) as TechnicalCaseMetadata;
  if (meta.testMethod && !isBuiltinTestMethodLabel(meta.testMethod)) {
    return meta.testMethod;
  }
  const normalized = String(attackType || '').toLowerCase();
  if (normalized && normalized !== 'direct' && normalized !== 'multi_turn' && normalized !== 'custom') {
    return attackType || '';
  }
  return '';
}

export function normalizeTurnSteps(
  metadata?: Record<string, unknown> | null,
  prompt?: string | null,
): TurnStep[] {
  const meta = metadata || {};

  if (Array.isArray(meta.turnSteps)) {
    return meta.turnSteps
      .map((step) => {
        if (!step || typeof step !== 'object') return null;
        const record = step as Record<string, unknown>;
        return {
          userInput: String(record.userInput || record.content || ''),
          expectedSafe: String(record.expectedSafe || ''),
        };
      })
      .filter((step): step is TurnStep => Boolean(step && (step.userInput || step.expectedSafe)));
  }

  if (Array.isArray(meta.turns)) {
    return meta.turns
      .map((step) => {
        if (!step || typeof step !== 'object') return null;
        const record = step as Record<string, unknown>;
        return {
          userInput: String(record.content || record.userInput || record.userPrompt || ''),
          expectedSafe: String(record.expectedSafe || ''),
        };
      })
      .filter((step): step is TurnStep => Boolean(step && (step.userInput || step.expectedSafe)));
  }

  const text = prompt?.trim() || '';
  if (!text) return [];

  const segments = text.split(/\n\n+(?=\[轮次 \d+\])/).filter(Boolean);
  if (segments.length > 1 || /^\[轮次 \d+\]/.test(text)) {
    return segments
      .map((segment) => {
        const match = segment.match(/^\[轮次 \d+\]\s*([\s\S]*)$/);
        return {
          userInput: (match ? match[1] : segment).trim(),
          expectedSafe: '',
        };
      })
      .filter((step) => step.userInput);
  }

  return [];
}

export function readTechnicalCaseMetadata(metadata?: Record<string, unknown> | null) {
  const meta = (metadata || {}) as TechnicalCaseMetadata;
  return {
    testMethod: meta.testMethod || '',
    attackScene: meta.attackScene || '',
    riskSubclass: meta.riskSubclass || '',
    caseBasis: meta.caseBasis || '',
    turnSteps: normalizeTurnSteps(metadata),
  };
}

export function renderTechnicalPayloadPreview(item: SecurityTestCase, maxLen = 56): string {
  const slug = resolveTestMethodSlug(item.attackType, item.metadata);
  const turnSteps = normalizeTurnSteps(item.metadata, item.prompt);

  if (slug === 'multi_turn' && turnSteps.length > 0) {
    const first = turnSteps[0]?.userInput || '';
    const prefix = `${turnSteps.length} 轮 · `;
    const text = prefix + first;
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  }

  const prompt = item.prompt?.trim() || '';
  if (!prompt) return '暂无测试输入';
  return prompt.length > maxLen ? `${prompt.slice(0, maxLen)}…` : prompt;
}

export function buildTechnicalCaseMetadata(input: {
  testMethodSlug: TechnicalTestMethodSlug;
  customTestMethod?: string;
  attackScene?: string;
  riskSubclass?: string;
  caseBasis?: string;
  turnSteps?: TurnStep[];
}): Record<string, unknown> {
  const testMethod =
    input.testMethodSlug === 'custom'
      ? input.customTestMethod?.trim() || TECHNICAL_TEST_METHOD_LABELS.custom
      : TECHNICAL_TEST_METHOD_LABELS[input.testMethodSlug];

  const metadata: TechnicalCaseMetadata = {
    testMethod,
    attackScene: input.attackScene,
    riskSubclass: input.riskSubclass,
    caseBasis: input.caseBasis,
  };
  if (input.testMethodSlug === 'multi_turn' && input.turnSteps?.length) {
    metadata.turnSteps = input.turnSteps;
  }
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value);
    }),
  );
}
