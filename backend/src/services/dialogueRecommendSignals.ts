/**
 * Capability signals + library scoring for dialogue security recommend (rules path).
 */

const SYSTEM_INSTRUCTION_DOMAIN = '系统指令泄露与绕过风险';
const DIALOGUE_ATTACK_DOMAIN = '恶意输入与对话攻击风险';
const OUTPUT_DOMAIN = '输出内容风险';
const RAG_DOMAIN = '知识库查询与信息访问风险';
const TOOL_DOMAIN = '工具调用与执行安全';
export const BASELINE_DOMAINS = [SYSTEM_INSTRUCTION_DOMAIN, DIALOGUE_ATTACK_DOMAIN] as const;

const DOMAIN_ALIAS_MAP = new Map<string, string>([
  ['基础攻击', '系统指令泄露与绕过风险'],
  ['会话对抗', DIALOGUE_ATTACK_DOMAIN],
  ['会话诱导与对抗攻击', DIALOGUE_ATTACK_DOMAIN],
  ['企业自定义', OUTPUT_DOMAIN],
  ['模型输出内容风险', OUTPUT_DOMAIN],
  ['知识库', RAG_DOMAIN],
  ['知识检索与 RAG 越权风险', RAG_DOMAIN],
  ['工具安全', '工具调用与执行安全'],
  ['工具调用', '工具调用与执行安全'],
]);

export function normalizeDialogueDomain(domain: string): string {
  return DOMAIN_ALIAS_MAP.get(domain) || domain;
}

export function isSameDialogueDomain(left: string, right: string): boolean {
  return normalizeDialogueDomain(left) === normalizeDialogueDomain(right);
}

export const INCLUDE_TOP_N_MIN = 3;
export const INCLUDE_TOP_N_MAX = 8;

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

export type DialoguePortraitInput = {
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

export type DialogueLibraryScoreInput = {
  id: string;
  libraryKey?: string;
  title: string;
  domain: string;
  description?: string | null;
  caseCount?: number;
  standards?: unknown;
  scope?: string | null;
  category?: string | null;
  tag?: string | null;
};

export type LibraryScoreResult = {
  score: number;
  excluded: boolean;
  excludeReason?: string;
  reasonHints: string[];
};

const RAG_RE = /rag|知识库|检索|向量|embedding|文档问答|doc.?qa/;
const FINANCE_RE =
  /报销|支付|付款|收款|转账|金融|银行|信贷|保险|理财|审批|费用|expense|payment|finance|invoice|账单|额度|授信/;
const PII_RE = /个人信息|隐私|证件|身份证|手机号|pii|隐私保护|客户资料|敏感数据|姓名.*电话|户籍/;
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

export function normalizePortraitText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function portraitTextFromAsset(asset: DialoguePortraitInput): string {
  return normalizePortraitText(
    asset.functionIntro,
    asset.businessScene,
    asset.businessSystem,
    ...(asset.tags || []),
  );
}

function componentBlob(asset: DialoguePortraitInput): string {
  return (asset.components || [])
    .filter((c) => c.enabled !== false)
    .map((c) => `${c.componentType} ${c.componentName} ${c.componentKey || ''}`)
    .join(' ')
    .toLowerCase();
}

export function deriveCapabilitySignals(asset: DialoguePortraitInput): DialogueCapabilitySignals {
  const text = portraitTextFromAsset(asset);
  const components = componentBlob(asset);

  const hasRag =
    RAG_RE.test(text) ||
    /knowledge|rag|retriev|vector|index/.test(components) ||
    (asset.components || []).some((c) =>
      /knowledge|rag|retriev|vector|index/i.test(
        `${c.componentType} ${c.componentName} ${c.componentKey || ''}`,
      ),
    );

  const hasTools =
    (asset.components || []).some((c) => /^(tool|mcp)$/i.test(c.componentType || '')) ||
    /tool|mcp|函数调用|function.?call/.test(text);

  const handlesFinance = FINANCE_RE.test(text);
  const handlesPii = PII_RE.test(text) || asset.sensitiveData === true;
  const isCustomerService = CS_RE.test(text);
  const isCodeAssistant = CODE_RE.test(text);
  const isContentGen = CONTENT_RE.test(text);
  const isDataQuery = DATA_RE.test(text);

  return {
    hasRag,
    hasTools,
    handlesFinance,
    handlesPii,
    isCustomerService,
    isCodeAssistant,
    isContentGen,
    isDataQuery,
  };
}

export function isToolOrientedLibrary(lib: DialogueLibraryScoreInput): boolean {
  const text = normalizePortraitText(
    lib.title,
    lib.description,
    lib.libraryKey,
    lib.scope,
    lib.category,
    lib.tag,
  );
  return TOOL_LIB_RE.test(text);
}

function libraryBlob(lib: DialogueLibraryScoreInput): string {
  const standards = Array.isArray(lib.standards)
    ? lib.standards.map(String).join(' ')
    : typeof lib.standards === 'string'
      ? lib.standards
      : '';
  return normalizePortraitText(
    lib.title,
    lib.description,
    lib.libraryKey,
    lib.scope,
    lib.category,
    lib.tag,
    lib.domain,
    standards,
  );
}

function keywordOverlapBonus(portraitText: string, libText: string): number {
  if (!portraitText.trim()) {
    return 0;
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
  return Math.min(12, hits * 2);
}

export function scoreLibraryForPortrait(
  lib: DialogueLibraryScoreInput,
  signals: DialogueCapabilitySignals,
  portraitText: string,
): LibraryScoreResult {
  const libText = libraryBlob(lib);
  const reasonHints: string[] = [];

  if (!signals.hasRag && isSameDialogueDomain(lib.domain, RAG_DOMAIN)) {
    return {
      score: -100,
      excluded: true,
      excludeReason: '画像无知识库/RAG 信号，排除知识库域',
      reasonHints: [],
    };
  }
  if (!signals.hasTools && isToolOrientedLibrary(lib)) {
    return {
      score: -100,
      excluded: true,
      excludeReason: '画像无 tool/mcp 挂载，排除工具向用例库',
      reasonHints: [],
    };
  }

  let score = 0;

  if (BASELINE_DOMAINS.some((domain) => isSameDialogueDomain(lib.domain, domain))) {
    score += 20;
    reasonHints.push(`基线域 ${lib.domain}`);
  }
  if (isSameDialogueDomain(lib.domain, OUTPUT_DOMAIN)) {
    score += 8;
    reasonHints.push('覆盖输出内容/企业自定义风险');
  }
  if (isSameDialogueDomain(lib.domain, RAG_DOMAIN) && signals.hasRag) {
    score += 18;
    reasonHints.push('命中 RAG/知识库能力');
  }

  score += keywordOverlapBonus(portraitText, libText);

  if (signals.hasTools && TOOL_LIB_RE.test(libText)) {
    score += 16;
    reasonHints.push('功能含工具/MCP，加权工具向库');
  }
  if (signals.handlesFinance && FINANCE_LIB_RE.test(libText)) {
    score += 22;
    reasonHints.push('功能含金融/报销/审批相关能力');
  }
  if (signals.handlesPii && PII_LIB_RE.test(libText)) {
    score += 14;
    reasonHints.push('功能涉及个人信息/敏感数据');
  }
  if (signals.isCustomerService && CS_LIB_RE.test(libText)) {
    score += 12;
    reasonHints.push('功能偏客服/话术场景');
  }
  if (signals.isCodeAssistant && CODE_LIB_RE.test(libText)) {
    score += 12;
    reasonHints.push('功能偏代码/开发助手');
  }
  if (signals.isContentGen && CONTENT_LIB_RE.test(libText)) {
    score += 16;
    reasonHints.push('功能偏内容生成，加权输出安全库');
  }
  if (signals.isDataQuery && DATA_LIB_RE.test(libText)) {
    score += 14;
    reasonHints.push('功能偏数据查询/导出');
  }
  if (signals.hasRag && RAG_LIB_RE.test(libText)) {
    score += 10;
    reasonHints.push('功能含检索/知识库相关表述');
  }

  // Slight preference for richer libraries when scores tie
  score += Math.min(5, Math.floor((lib.caseCount || 0) / 20));

  return { score, excluded: false, reasonHints };
}

export function targetDomainsForScenario(
  assessScenario: string,
  hasRag: boolean,
  hasTools = false,
): Set<string> {
  const normalizeDomains = (domains: string[]) => new Set(domains.map(normalizeDialogueDomain));

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

export function buildIncludeReason(
  assessScenario: string,
  lib: DialogueLibraryScoreInput,
  scoreResult: LibraryScoreResult,
  asBaseline: boolean,
): string {
  if (asBaseline && scoreResult.reasonHints.length === 0) {
    return `规则基线：保留 ${lib.domain}`;
  }
  const hints = scoreResult.reasonHints.slice(0, 2).join('；');
  if (hints) {
    return `规则推荐：场景 ${assessScenario} · ${hints}`;
  }
  if (isPatrolScenario(assessScenario)) {
    return `周期巡检推荐：覆盖 ${lib.domain} 的持续检测场景`;
  }
  return `规则推荐：评估场景 ${assessScenario} · 域 ${lib.domain}`;
}

export type ScoredLibraryPick = {
  lib: DialogueLibraryScoreInput;
  score: number;
  reasonHints: string[];
  asBaseline: boolean;
};

/**
 * Pick Top-N libraries by capability score within scenario domains,
 * always ensuring baseline domains when available.
 */
export function pickLibrariesByScore(params: {
  libraries: DialogueLibraryScoreInput[];
  signals: DialogueCapabilitySignals;
  portraitText: string;
  assessScenario: string;
  topN?: number;
}): {
  include: ScoredLibraryPick[];
  excludeMeta: Map<string, { excluded: boolean; excludeReason?: string; score: number }>;
} {
  const { libraries, signals, portraitText, assessScenario } = params;
  const topN = Math.min(
    INCLUDE_TOP_N_MAX,
    Math.max(INCLUDE_TOP_N_MIN, params.topN ?? INCLUDE_TOP_N_MAX),
  );
  const domains = targetDomainsForScenario(assessScenario, signals.hasRag, signals.hasTools);
  const excludeMeta = new Map<
    string,
    { excluded: boolean; excludeReason?: string; score: number }
  >();

  const scored: Array<{
    lib: DialogueLibraryScoreInput;
    result: LibraryScoreResult;
  }> = [];

  for (const lib of libraries) {
    const result = scoreLibraryForPortrait(lib, signals, portraitText);
    excludeMeta.set(lib.id, {
      excluded: result.excluded,
      excludeReason: result.excludeReason,
      score: result.score,
    });
    if (result.excluded) {
      continue;
    }
    if (!domains.has(normalizeDialogueDomain(lib.domain))) {
      excludeMeta.set(lib.id, {
        excluded: false,
        excludeReason: `评估场景 ${assessScenario} 未覆盖域 ${lib.domain}`,
        score: result.score,
      });
      continue;
    }
    scored.push({ lib, result });
  }

  scored.sort((a, b) => {
    if (b.result.score !== a.result.score) {
      return b.result.score - a.result.score;
    }
    return (b.lib.caseCount || 0) - (a.lib.caseCount || 0);
  });

  const includeMap = new Map<string, ScoredLibraryPick>();
  for (const row of scored.slice(0, topN)) {
    includeMap.set(row.lib.id, {
      lib: row.lib,
      score: row.result.score,
      reasonHints: row.result.reasonHints,
      asBaseline: false,
    });
  }

  // Ensure baseline domains
  for (const domain of BASELINE_DOMAINS) {
    const already = Array.from(includeMap.values()).some((p) =>
      isSameDialogueDomain(p.lib.domain, domain),
    );
    if (already) {
      continue;
    }
    const candidates = libraries
      .filter((lib) => isSameDialogueDomain(lib.domain, domain))
      .map((lib) => ({ lib, result: scoreLibraryForPortrait(lib, signals, portraitText) }))
      .filter((row) => !row.result.excluded)
      .sort((a, b) => {
        if (b.result.score !== a.result.score) {
          return b.result.score - a.result.score;
        }
        return (b.lib.caseCount || 0) - (a.lib.caseCount || 0);
      });
    if (candidates[0]) {
      includeMap.set(candidates[0].lib.id, {
        lib: candidates[0].lib,
        score: candidates[0].result.score,
        reasonHints: candidates[0].result.reasonHints,
        asBaseline: true,
      });
    }
  }

  // If still empty (edge), take top scored regardless of domain
  if (includeMap.size === 0 && scored.length > 0) {
    for (const row of scored.slice(0, Math.min(topN, scored.length))) {
      includeMap.set(row.lib.id, {
        lib: row.lib,
        score: row.result.score,
        reasonHints: row.result.reasonHints,
        asBaseline: false,
      });
    }
  }

  return {
    include: Array.from(includeMap.values()).sort((a, b) => b.score - a.score),
    excludeMeta,
  };
}
