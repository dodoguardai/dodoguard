/**
 * Lightweight capability signals for dialogue wizard precheck (aligned with backend
 * dialogueRecommendSignals — keep keyword sets in sync when changing either side).
 */
import {
  isSameTechnicalDomain,
  normalizeTechnicalDomainKey,
} from '@/features/technical-case-library/technical-case-domains';

export type DialogueCapabilitySignals = {
  hasRag: boolean;
  hasTools: boolean;
  handlesFinance: boolean;
  handlesPii: boolean;
  isCustomerService: boolean;
  isCodeAssistant: boolean;
  isContentGen: boolean;
  isDataQuery: boolean;
};

type PortraitLike = {
  functionIntro?: string | null;
  businessScene?: string | null;
  businessSystem?: string | null;
  tags?: string[] | null;
  sensitiveData?: boolean;
  components?: Array<{
    componentType: string;
    componentName: string;
    componentKey?: string | null;
    enabled?: boolean;
  }> | null;
};

type LibraryLike = {
  id: string;
  title: string;
  domain: string;
  description?: string | null;
  caseCount: number;
  libraryKey?: string;
  standards?: string[];
  metadata?: Record<string, unknown>;
};

const SYSTEM_INSTRUCTION_DOMAIN = '系统指令泄露与绕过风险';
const DIALOGUE_ATTACK_DOMAIN = '恶意输入与对话攻击风险';
const OUTPUT_DOMAIN = '输出内容风险';
const RAG_DOMAIN = '知识库查询与信息访问风险';
const TOOL_DOMAIN = '工具调用与执行安全';
const BASELINE_DOMAINS = [SYSTEM_INSTRUCTION_DOMAIN, DIALOGUE_ATTACK_DOMAIN] as const;
const INCLUDE_TOP_N = 8;

const RAG_RE = /rag|知识库|检索|向量|embedding|文档问答|doc.?qa/;
const FINANCE_RE =
  /报销|支付|付款|收款|转账|金融|银行|信贷|保险|理财|审批|费用|expense|payment|finance|invoice|账单|额度|授信/;
const PII_RE =
  /个人信息|隐私|证件|身份证|手机号|pii|隐私保护|客户资料|敏感数据|姓名.*电话|户籍/;
const CS_RE = /客服|售后|工单|投诉|咨询|呼叫中心|customer.?service|helpdesk|座席/;
const CODE_RE = /代码|编程|开发助手|ide|code.?assist|调试|重构|sql.?生成|写代码/;
const CONTENT_RE = /文案|写作|生成内容|营销文|稿件|创作|content.?gen|写诗|作文/;
const DATA_RE = /查数|查询|报表|数据导出|数仓|bi|数据分析|数据库|导出.*csv|sql.?查询/;
const TOOL_LIB_RE = /工具|tool.?misuse|tool.?abuse|mcp|函数调用|tool.?call|tool.?invocation/;
const FINANCE_LIB_RE = /报销|支付|审批|越权|金融|费用|额度|转账|支付工具|资金/;
const PII_LIB_RE = /pii|隐私|个人信息|敏感|证件|数据泄露|越权.*查/;
const CS_LIB_RE = /客服|话术|工单|角色扮演|诱导/;
const CODE_LIB_RE = /代码|注入|jailbreak|越狱|指令/;
const CONTENT_LIB_RE = /有害|幻觉|有毒|仇恨|违禁|harmful|hallucin/;
const DATA_LIB_RE = /导出|越权|数据|上下文劫持|间接提示/;
const RAG_LIB_RE = /知识库|rag|检索|间接提示|文档/;

function isPatrolScenario(assessScenario: string): boolean {
  return assessScenario === 'patrol' || assessScenario === 'periodic';
}

function normalizeText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function portraitTextFromAgent(agent: PortraitLike): string {
  return normalizeText(
    agent.functionIntro,
    agent.businessScene,
    agent.businessSystem,
    ...(agent.tags || []),
  );
}

export function deriveCapabilitySignals(agent: PortraitLike): DialogueCapabilitySignals {
  const text = portraitTextFromAgent(agent);
  const hasRag =
    RAG_RE.test(text) ||
    (agent.components || []).some((c) =>
      /knowledge|rag|retriev|vector|index/i.test(
        `${c.componentType} ${c.componentName} ${c.componentKey || ''}`,
      ),
    );
  const hasTools =
    (agent.components || []).some((c) => /^(tool|mcp)$/i.test(c.componentType || '')) ||
    /tool|mcp|函数调用|function.?call/.test(text);

  return {
    hasRag,
    hasTools,
    handlesFinance: FINANCE_RE.test(text),
    handlesPii: PII_RE.test(text) || agent.sensitiveData === true,
    isCustomerService: CS_RE.test(text),
    isCodeAssistant: CODE_RE.test(text),
    isContentGen: CONTENT_RE.test(text),
    isDataQuery: DATA_RE.test(text),
  };
}

function isToolOrientedLibrary(lib: LibraryLike): boolean {
  const meta = lib.metadata || {};
  return TOOL_LIB_RE.test(
    normalizeText(
      lib.title,
      lib.description,
      lib.libraryKey,
      typeof meta.scope === 'string' ? meta.scope : undefined,
      typeof meta.category === 'string' ? meta.category : undefined,
      typeof meta.tag === 'string' ? meta.tag : undefined,
    ),
  );
}

function scoreLibrary(
  lib: LibraryLike,
  signals: DialogueCapabilitySignals,
  portraitText: string,
): { score: number; excluded: boolean } {
  const meta = lib.metadata || {};
  const libText = normalizeText(
    lib.title,
    lib.description,
    lib.libraryKey,
    lib.domain,
    typeof meta.scope === 'string' ? meta.scope : undefined,
    typeof meta.category === 'string' ? meta.category : undefined,
    typeof meta.tag === 'string' ? meta.tag : undefined,
    ...(Array.isArray(lib.standards) ? lib.standards : []),
  );

  if (!signals.hasRag && isSameTechnicalDomain(lib.domain, RAG_DOMAIN)) {
    return { score: -100, excluded: true };
  }
  if (!signals.hasTools && isToolOrientedLibrary(lib)) {
    return { score: -100, excluded: true };
  }

  let score = 0;
  if (BASELINE_DOMAINS.some((domain) => isSameTechnicalDomain(lib.domain, domain))) {
    score += 20;
  }
  if (isSameTechnicalDomain(lib.domain, OUTPUT_DOMAIN)) {
    score += 8;
  }
  if (isSameTechnicalDomain(lib.domain, RAG_DOMAIN) && signals.hasRag) {
    score += 18;
  }

  const tokens = portraitText
    .split(/[\s,，、;；|/\\]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  let hits = 0;
  for (const token of tokens) {
    if (libText.includes(token)) {
      hits += 1;
    }
  }
  score += Math.min(12, hits * 2);

  if (signals.hasTools && TOOL_LIB_RE.test(libText)) {
    score += 16;
  }
  if (signals.handlesFinance && FINANCE_LIB_RE.test(libText)) {
    score += 22;
  }
  if (signals.handlesPii && PII_LIB_RE.test(libText)) {
    score += 14;
  }
  if (signals.isCustomerService && CS_LIB_RE.test(libText)) {
    score += 12;
  }
  if (signals.isCodeAssistant && CODE_LIB_RE.test(libText)) {
    score += 12;
  }
  if (signals.isContentGen && CONTENT_LIB_RE.test(libText)) {
    score += 16;
  }
  if (signals.isDataQuery && DATA_LIB_RE.test(libText)) {
    score += 14;
  }
  if (signals.hasRag && RAG_LIB_RE.test(libText)) {
    score += 10;
  }
  score += Math.min(5, Math.floor(lib.caseCount / 20));
  return { score, excluded: false };
}

function targetDomains(assessScenario: string, hasRag: boolean, hasTools: boolean): Set<string> {
  const normalizeDomains = (domains: string[]) => new Set(domains.map(normalizeTechnicalDomainKey));

  if (assessScenario === 'launch') {
    return normalizeDomains([
      SYSTEM_INSTRUCTION_DOMAIN,
      DIALOGUE_ATTACK_DOMAIN,
      OUTPUT_DOMAIN,
      ...(hasRag ? [RAG_DOMAIN] : []),
      ...(hasTools ? [TOOL_DOMAIN] : []),
    ]);
  }
  if (assessScenario === 'regression') {
    return normalizeDomains([
      DIALOGUE_ATTACK_DOMAIN,
      SYSTEM_INSTRUCTION_DOMAIN,
      ...(hasRag ? [RAG_DOMAIN] : []),
      ...(hasTools ? [TOOL_DOMAIN] : []),
    ]);
  }
  if (isPatrolScenario(assessScenario)) {
    return normalizeDomains([
      SYSTEM_INSTRUCTION_DOMAIN,
      DIALOGUE_ATTACK_DOMAIN,
      OUTPUT_DOMAIN,
      ...(hasRag ? [RAG_DOMAIN] : []),
      ...(hasTools ? [TOOL_DOMAIN] : []),
    ]);
  }
  return normalizeDomains([SYSTEM_INSTRUCTION_DOMAIN, DIALOGUE_ATTACK_DOMAIN]);
}

export type RecommendedLibraryPick<T extends LibraryLike> = {
  library: T;
  reason: string;
};

function recommendationReason(
  lib: LibraryLike,
  signals: DialogueCapabilitySignals,
  assessScenario: string,
  asBaseline = false,
): string {
  const reasons: string[] = [];
  if (asBaseline || BASELINE_DOMAINS.some((domain) => isSameTechnicalDomain(lib.domain, domain))) {
    reasons.push(
      isPatrolScenario(assessScenario) ? '周期巡检默认覆盖基础攻击面' : '默认覆盖基础攻击面',
    );
  }
  if (isPatrolScenario(assessScenario) && isSameTechnicalDomain(lib.domain, OUTPUT_DOMAIN)) {
    reasons.push('周期巡检覆盖输出风险');
  }
  if (signals.hasRag && isSameTechnicalDomain(lib.domain, RAG_DOMAIN)) {
    reasons.push('资产含知识库/RAG');
  }
  if (signals.hasTools && isToolOrientedLibrary(lib)) {
    reasons.push('资产含工具/MCP/Skill');
  }
  if (signals.handlesFinance && FINANCE_LIB_RE.test(normalizeText(lib.title, lib.description))) {
    reasons.push('业务涉及金融/审批');
  }
  if (signals.handlesPii && PII_LIB_RE.test(normalizeText(lib.title, lib.description))) {
    reasons.push('涉及敏感/个人信息');
  }
  return reasons.length ? reasons.slice(0, 2).join('；') : `匹配 ${lib.domain} 持续检测场景`;
}

/** Score-based library pick for wizard precheck (mirrors backend rules path). */
export function pickRecommendedLibrariesForAgent<T extends LibraryLike>(
  agent: PortraitLike,
  libraries: T[],
  assessScenario: string,
): T[] {
  return pickRecommendedLibraryEntriesForAgent(agent, libraries, assessScenario).map(
    (entry) => entry.library,
  );
}

export function pickRecommendedLibraryEntriesForAgent<T extends LibraryLike>(
  agent: PortraitLike,
  libraries: T[],
  assessScenario: string,
): Array<RecommendedLibraryPick<T>> {
  const enabled = libraries.filter((lib) => (lib as { enabled?: boolean }).enabled !== false);
  if (enabled.length === 0) {
    return [];
  }

  const signals = deriveCapabilitySignals(agent);
  const portraitText = portraitTextFromAgent(agent);
  const domains = targetDomains(assessScenario, signals.hasRag, signals.hasTools);

  const scored = enabled
    .map((lib) => ({ lib, ...scoreLibrary(lib, signals, portraitText) }))
    .filter((row) => !row.excluded && domains.has(normalizeTechnicalDomainKey(row.lib.domain)))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.lib.caseCount - a.lib.caseCount;
    });

  const include = new Map<string, RecommendedLibraryPick<T>>();
  for (const row of scored.slice(0, INCLUDE_TOP_N)) {
    include.set(row.lib.id, {
      library: row.lib,
      reason: recommendationReason(row.lib, signals, assessScenario),
    });
  }

  for (const domain of BASELINE_DOMAINS) {
    if (
      Array.from(include.values()).some((entry) =>
        isSameTechnicalDomain(entry.library.domain, domain),
      )
    ) {
      continue;
    }
    const fallback = enabled
      .map((lib) => ({ lib, ...scoreLibrary(lib, signals, portraitText) }))
      .filter((row) => !row.excluded && isSameTechnicalDomain(row.lib.domain, domain))
      .sort((a, b) => b.score - a.score || b.lib.caseCount - a.lib.caseCount)[0];
    if (fallback) {
      include.set(fallback.lib.id, {
        library: fallback.lib,
        reason: recommendationReason(fallback.lib, signals, assessScenario, true),
      });
    }
  }

  return Array.from(include.values());
}
