import type { MappedTechnicalLibrary } from './shared';

export type TechnicalDomainMeta = {
  id?: string;
  libraryKey?: string;
  domainKey: string;
  tabLabel: string;
  kpiLibLabel: string;
  listTitle: string;
  listSub: string;
  icon: string;
  order: number;
  isDomainOnly?: boolean;
  deletable?: boolean;
};

export const ALL_DOMAIN_TAB = 'all';

const LEGACY_DOMAIN_ALIASES: Record<string, string> = {
  基础攻击: '系统指令泄露与绕过风险',
  会话对抗: '恶意输入与对话攻击风险',
  企业自定义: '输出内容风险',
  知识库: '知识库查询与信息访问风险',
  会话诱导与对抗攻击: '恶意输入与对话攻击风险',
  模型输出内容风险: '输出内容风险',
  '知识检索与 RAG 越权风险': '知识库查询与信息访问风险',
};

function domainLabel(domainKey: string) {
  return domainKey === ALL_DOMAIN_TAB ? '全部' : domainKey;
}

function domainListSub(domainKey: string, description?: string) {
  return (
    description || `覆盖 ${domainKey} 相关攻击场景 · 供安全评估任务选用 · 场景库与检测样本可维护`
  );
}

export function normalizeTechnicalDomainKey(domainKey: string) {
  return LEGACY_DOMAIN_ALIASES[domainKey] || domainKey;
}

export function isSameTechnicalDomain(left: string, right: string) {
  return normalizeTechnicalDomainKey(left) === normalizeTechnicalDomainKey(right);
}

export function buildTechnicalDomainMetas(
  libraries: MappedTechnicalLibrary[],
): TechnicalDomainMeta[] {
  const metas = new Map<string, TechnicalDomainMeta>();

  for (const library of libraries) {
    const domainKey = normalizeTechnicalDomainKey(library.domain);
    if (!domainKey || domainKey === ALL_DOMAIN_TAB) {
      continue;
    }
    const existing = metas.get(domainKey);
    if (library.isDomainOnly) {
      metas.set(domainKey, {
        id: library.id,
        libraryKey: library.libraryKey,
        domainKey,
        tabLabel: library.title || domainKey,
        kpiLibLabel: library.title || domainKey,
        listTitle: `${library.title || domainKey} · 风险子场景`,
        listSub: domainListSub(domainKey, library.description),
        icon: library.icon || '📦',
        order: library.domainOrder || existing?.order || 999,
        isDomainOnly: true,
        deletable: library.libraryKey.startsWith('domain-custom-'),
      });
      continue;
    }
    if (!existing) {
      metas.set(domainKey, {
        domainKey,
        tabLabel: domainLabel(domainKey),
        kpiLibLabel: domainLabel(domainKey),
        listTitle: `${domainLabel(domainKey)} · 风险子场景`,
        listSub: domainListSub(domainKey),
        icon: library.icon || '📦',
        order: 999,
      });
    }
  }

  return [...metas.values()].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.domainKey.localeCompare(right.domainKey, 'zh-Hans-CN');
  });
}

export function resolveDomainMeta(
  domainKey: string,
  domainMetas: TechnicalDomainMeta[] = [],
): TechnicalDomainMeta {
  const normalized = normalizeTechnicalDomainKey(domainKey);
  const meta = domainMetas.find((item) => item.domainKey === normalized);
  if (meta) {
    return meta;
  }
  return {
    domainKey: normalized,
    tabLabel: domainLabel(normalized),
    kpiLibLabel: domainLabel(normalized),
    listTitle: `${domainLabel(normalized)} · 风险子场景`,
    listSub: domainListSub(normalized),
    icon: '📦',
    order: 999,
  };
}

export function tabLabelForDomain(domainKey: string, domainMetas: TechnicalDomainMeta[] = []) {
  if (domainKey === ALL_DOMAIN_TAB) {
    return '全部';
  }
  return resolveDomainMeta(domainKey, domainMetas).tabLabel;
}

export function buildDomainTabs(domainMetas: TechnicalDomainMeta[]) {
  return [ALL_DOMAIN_TAB, ...domainMetas.map((item) => item.domainKey)];
}

export function resolveAllListMeta() {
  return {
    listTitle: '全部 · 风险子场景',
    listSub: '总览全部技术安全检查场景库 · 切换分类按攻击场景域筛选 · 每个库含检测依据与可执行样本',
  };
}
