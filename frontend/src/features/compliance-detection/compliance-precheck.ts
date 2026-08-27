import { COMPLIANCE_DOMAINS } from '@/features/compliance-case-library/shared';
import type {
  AgentAsset,
  ComplianceRegulationMapping,
  SecurityCaseLibrary,
} from '@/types/entities';

export type ComplianceDomain = (typeof COMPLIANCE_DOMAINS)[number];
export type CreationMode = 'ai' | 'manual';

export type ComplianceTrigger = {
  rule: string;
  desc: string;
  required: boolean;
};

export type RecommendedLibrary = {
  id: string;
  title: string;
  domain: string;
  caseCount: number;
  enabled: boolean;
};

export type CompliancePrecheckResult = {
  agent: {
    name: string;
    department: string;
    scene: string;
    sensitiveData: boolean;
    exposureLevel: string;
    dataTypeLabel: string;
  };
  recommendedDomain: ComplianceDomain;
  triggers: ComplianceTrigger[];
  recommendedLibraries: RecommendedLibrary[];
  applicableLaws: string[];
  warnings: string[];
  estimatedCaseCount: number;
};

const COMPLIANCE_TRIGGERS: ComplianceTrigger[] = [
  { rule: '涉及金融场景', desc: '需要金融合规检测', required: true },
  { rule: '涉及政务 / 国企场景', desc: '需要政务数据和审计检测', required: true },
  { rule: '处理个人信息', desc: '需要个人信息保护合规检测', required: true },
  { rule: '涉及敏感数据', desc: '需要数据安全合规检测', required: true },
  { rule: '对外暴露', desc: '需要加强授权与敏感信息保护检测', required: false },
];

function normalizeText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function agentDepartment(agent: AgentAsset): string {
  const primary = agent.owners?.find((owner) => owner.isPrimary);
  return primary?.department?.trim() || '未分配部门';
}

export function agentScene(agent: AgentAsset): string {
  if (agent.businessScene?.trim()) {
    return agent.businessScene.trim();
  }
  if (agent.tags?.length) {
    return agent.tags[0];
  }
  return '办公';
}

export function formatAgentOptionLabel(agent: AgentAsset): string {
  return `${agent.name} · ${agentDepartment(agent)} · ${agentScene(agent)}`;
}

export function inferComplianceDomain(agent: AgentAsset): ComplianceDomain {
  const text = normalizeText(agent.businessScene, agent.businessSystem, ...(agent.tags || []));
  if (/金融|财富|证券|银行|保险|基金/.test(text)) {
    return '金融合规';
  }
  if (/政务|国企|政府|公共/.test(text)) {
    return '政务/国企';
  }
  if (agent.sensitiveData || /个人|隐私|pipl|个保/.test(text)) {
    return '个人信息';
  }
  if (/数据安全|数安|出境|分类分级/.test(text)) {
    return '数据安全';
  }
  return '通用合规';
}

export function matchTriggers(agent: AgentAsset): ComplianceTrigger[] {
  const domain = inferComplianceDomain(agent);
  const text = normalizeText(agent.businessScene, agent.businessSystem, ...(agent.tags || []));
  const matched: ComplianceTrigger[] = [];

  if (domain === '金融合规' || /金融|财富|证券/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[0]);
  }
  if (domain === '政务/国企' || /政务|国企|政府/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[1]);
  }
  if (agent.sensitiveData || domain === '个人信息' || /个人|隐私/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[2]);
  }
  if (domain === '数据安全' || agent.sensitiveData) {
    matched.push(COMPLIANCE_TRIGGERS[3]);
  }
  if (agent.exposureLevel === 'external' || agent.exposureLevel === 'public') {
    matched.push(COMPLIANCE_TRIGGERS[4]);
  }
  return matched;
}

function isPublishedComplianceLibrary(lib: SecurityCaseLibrary): boolean {
  return lib.enabled;
}

export function recommendLibraries(
  libraries: SecurityCaseLibrary[],
  domain: ComplianceDomain,
  limit = 5,
): RecommendedLibrary[] {
  const published = libraries.filter(isPublishedComplianceLibrary);
  const domainMatch = published.filter((lib) => lib.domain === domain);
  const generalMatch = published.filter((lib) => lib.domain === '通用合规');
  const pool = domainMatch.length ? [...domainMatch, ...generalMatch] : published;
  const seen = new Set<string>();
  const ordered: SecurityCaseLibrary[] = [];
  for (const lib of pool.sort((a, b) => b.caseCount - a.caseCount)) {
    if (seen.has(lib.id)) {
      continue;
    }
    seen.add(lib.id);
    ordered.push(lib);
  }
  return ordered.slice(0, limit).map((lib) => ({
    id: lib.id,
    title: lib.title,
    domain: lib.domain,
    caseCount: lib.caseCount,
    enabled: lib.enabled,
  }));
}

export function resolveApplicableLaws(
  mappings: ComplianceRegulationMapping[],
  libraryIds: string[],
): string[] {
  const idSet = new Set(libraryIds);
  const laws = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.libraryId && idSet.has(mapping.libraryId)) {
      laws.add(mapping.law);
    }
  }
  if (laws.size === 0) {
    for (const mapping of mappings.slice(0, 20)) {
      laws.add(mapping.law);
    }
  }
  return Array.from(laws);
}

export function dataTypeLabel(agent: AgentAsset): string {
  if (agent.sensitiveData) {
    return '个人信息 / 敏感数据';
  }
  const domain = inferComplianceDomain(agent);
  if (domain === '金融合规') {
    return '金融客户数据';
  }
  if (domain === '政务/国企') {
    return '政务数据';
  }
  return '一般业务数据';
}

export function domainStrategy(domain: ComplianceDomain): string {
  if (domain === '金融合规') {
    return '金融场景模板';
  }
  if (domain === '政务/国企') {
    return '政务数据边界模板';
  }
  if (domain === '行业模板') {
    return '行业模板包';
  }
  return '合规准入与策略核验';
}

export function buildCompliancePrecheck(
  agent: AgentAsset,
  libraries: SecurityCaseLibrary[],
  mappings: ComplianceRegulationMapping[],
  domainOverride?: ComplianceDomain,
): CompliancePrecheckResult {
  const recommendedDomain = domainOverride ?? inferComplianceDomain(agent);
  const recommendedLibraries = recommendLibraries(libraries, recommendedDomain);
  const libraryIds = recommendedLibraries.map((lib) => lib.id);
  const applicableLaws = resolveApplicableLaws(mappings, libraryIds);
  const warnings: string[] = [];

  if (!agent.owners?.some((owner) => owner.isPrimary)) {
    warnings.push('Agent 未配置主责负责人，创建任务后将使用默认安全负责人');
  }
  if (recommendedLibraries.length === 0) {
    warnings.push('暂无已启用的合规控制库，请先在合规用例库中启用控制库');
  }
  const disabledCount = libraries.filter((lib) => !lib.enabled).length;
  if (disabledCount > 0 && recommendedLibraries.length < 3) {
    warnings.push(`有 ${disabledCount} 个合规控制库未启用，可能遗漏检测范围`);
  }
  if (recommendedLibraries.length > 0 && recommendedLibraries.every((lib) => lib.caseCount === 0)) {
    warnings.push('推荐控制库暂无已发布用例，执行后可能无法产生有效结论');
  }

  return {
    agent: {
      name: agent.name,
      department: agentDepartment(agent),
      scene: agentScene(agent),
      sensitiveData: agent.sensitiveData,
      exposureLevel: agent.exposureLevel,
      dataTypeLabel: dataTypeLabel(agent),
    },
    recommendedDomain,
    triggers: matchTriggers(agent),
    recommendedLibraries,
    applicableLaws,
    warnings,
    estimatedCaseCount: recommendedLibraries.reduce((sum, lib) => sum + lib.caseCount, 0),
  };
}

export function buildPrecheckScanItems(
  agent: AgentAsset,
): Array<{ title: string; description: string }> {
  const scene = agentScene(agent);
  const sensitive = agent.sensitiveData;
  return [
    { title: '连接 Agent API', description: '校验接口联通、鉴权、响应时延' },
    { title: '识别业务场景', description: `${scene}、金融咨询、用户资料查询` },
    {
      title: '识别数据类型',
      description: sensitive ? '身份证号、手机号、银行卡、地址、客户资料' : '业务数据、非涉敏场景',
    },
    {
      title: '匹配合规库分类',
      description: '总览、通用合规、金融合规、政务/国企、个人信息、数据安全、行业模板',
    },
    {
      title: '展开子法规与控制项',
      description: '个保法、金融销售规则、GB/T 22239、数据安全规则',
    },
    { title: '推荐检测用例', description: '从合规检测用例库中推荐本次评估用例' },
  ];
}

export type ComplianceTaskMetrics = {
  libs: number;
  laws: number;
  cases: number;
  must: number;
  reqs: number;
  mins: number;
};

export function computeTaskMetrics(
  libraries: SecurityCaseLibrary[],
  selectedLibIds: string[],
  applicableLaws: string[],
): ComplianceTaskMetrics {
  const selected = libraries.filter((lib) => selectedLibIds.includes(lib.id));
  const cases = selected.reduce((sum, lib) => sum + lib.caseCount, 0);
  const must = selected.reduce(
    (sum, lib) =>
      sum + (lib.defaultLevel === 'high' ? lib.caseCount : Math.ceil(lib.caseCount * 0.6)),
    0,
  );
  const libs = selected.length;
  const laws = applicableLaws.length || Math.max(4, Math.round(libs * 1.1));
  const reqs = Math.round(Math.max(cases, 1) * 1.7);
  const mins = Math.max(8, Math.round(Math.max(cases, 1) * 0.24));
  return { libs, laws, cases, must, reqs, mins };
}

export function resolveLibrariesForMode(
  mode: CreationMode,
  precheck: CompliancePrecheckResult,
): string[] {
  if (mode === 'ai') {
    return precheck.recommendedLibraries.map((lib) => lib.id);
  }
  return [];
}

export function sumCaseCount(libraries: SecurityCaseLibrary[], ids: string[]): number {
  const idSet = new Set(ids);
  return libraries.filter((lib) => idSet.has(lib.id)).reduce((sum, lib) => sum + lib.caseCount, 0);
}
