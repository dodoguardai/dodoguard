/**
 * Capability signals + library scoring for compliance recommend (rules path).
 */

export const COMPLIANCE_INCLUDE_TOP_N_MIN = 2;
export const COMPLIANCE_INCLUDE_TOP_N_MAX = 6;

export const COMPLIANCE_DOMAINS = [
  '通用合规',
  '金融合规',
  '政务/国企',
  '个人信息',
  '数据安全',
  '行业模板',
] as const;

export type ComplianceDomainId = (typeof COMPLIANCE_DOMAINS)[number];

export type ComplianceCapabilitySignals = {
  isFinance: boolean;
  isGov: boolean;
  handlesPii: boolean;
  handlesDataSecurity: boolean;
  isCustomerFacing: boolean;
  isIndustrySpecific: boolean;
};

export type CompliancePortraitInput = {
  functionIntro?: string | null;
  businessScene?: string | null;
  businessSystem?: string | null;
  tags?: string[] | null;
  sensitiveData?: boolean;
  exposureLevel?: string | null;
  components?: Array<{
    componentType: string;
    componentName: string;
    componentKey?: string | null;
    enabled?: boolean;
  }> | null;
};

export type ComplianceLibraryScoreInput = {
  id: string;
  title: string;
  domain: string;
  description?: string | null;
  caseCount?: number;
};

export type ComplianceLibraryScoreResult = {
  score: number;
  excluded: boolean;
  excludeReason?: string;
  reasonHints: string[];
};

const FINANCE_RE =
  /金融|财富|证券|银行|保险|基金|信贷|理财|支付|报销|审批|费用|expense|finance|payment|授信|额度/;
const GOV_RE = /政务|国企|政府|公共|机关|事业单位|国资/;
const PII_RE = /个人信息|隐私|证件|身份证|手机号|pii|隐私保护|客户资料|个保|pipl|姓名.*电话/;
const DATA_SEC_RE = /数据安全|数安|出境|分类分级|加密|脱敏|数据泄露|数据保护/;
const CUSTOMER_RE = /客服|对外|客户|用户咨询|呼叫中心|对外暴露|c端|to.?c/;
const INDUSTRY_RE = /医疗|教育|制造|能源|交通|电信|运营商|行业/;

export function normalizeCompliancePortraitText(
  ...parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function portraitTextFromComplianceAsset(asset: CompliancePortraitInput): string {
  return normalizeCompliancePortraitText(
    asset.functionIntro,
    asset.businessScene,
    asset.businessSystem,
    ...(asset.tags || []),
  );
}

export function deriveComplianceCapabilitySignals(
  asset: CompliancePortraitInput,
): ComplianceCapabilitySignals {
  const text = portraitTextFromComplianceAsset(asset);
  const exposure = String(asset.exposureLevel || '').toLowerCase();
  const external =
    exposure === 'external' ||
    exposure === 'external_customer' ||
    exposure === 'public' ||
    CUSTOMER_RE.test(text);

  return {
    isFinance: FINANCE_RE.test(text),
    isGov: GOV_RE.test(text),
    handlesPii: PII_RE.test(text) || asset.sensitiveData === true,
    handlesDataSecurity: DATA_SEC_RE.test(text) || asset.sensitiveData === true,
    isCustomerFacing: external,
    isIndustrySpecific: INDUSTRY_RE.test(text),
  };
}

function libraryBlob(lib: ComplianceLibraryScoreInput): string {
  return normalizeCompliancePortraitText(lib.title, lib.description, lib.domain);
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

export function scoreComplianceLibraryForPortrait(
  lib: ComplianceLibraryScoreInput,
  signals: ComplianceCapabilitySignals,
  portraitText: string,
  recommendedDomain: string,
): ComplianceLibraryScoreResult {
  const libText = libraryBlob(lib);
  const reasonHints: string[] = [];

  if (lib.domain === '金融合规' && !signals.isFinance && recommendedDomain !== '金融合规') {
    return {
      score: -100,
      excluded: true,
      excludeReason: '画像无金融场景证据，排除金融合规库',
      reasonHints: [],
    };
  }
  if (lib.domain === '政务/国企' && !signals.isGov && recommendedDomain !== '政务/国企') {
    return {
      score: -100,
      excluded: true,
      excludeReason: '画像无政务/国企场景证据，排除政务合规库',
      reasonHints: [],
    };
  }
  if (
    lib.domain === '个人信息' &&
    !signals.handlesPii &&
    recommendedDomain !== '个人信息' &&
    recommendedDomain !== '通用合规'
  ) {
    return {
      score: -100,
      excluded: true,
      excludeReason: '画像无明显个保/敏感数据处理信号，排除个人信息专库',
      reasonHints: [],
    };
  }

  let score = 0;

  if (lib.domain === recommendedDomain) {
    score += 28;
    reasonHints.push(`匹配推荐域 ${recommendedDomain}`);
  } else if (lib.domain === '通用合规') {
    score += 14;
    reasonHints.push('通用合规基线');
  } else if (lib.domain === '行业模板' && signals.isIndustrySpecific) {
    score += 12;
    reasonHints.push('命中行业场景');
  }

  score += keywordOverlapBonus(portraitText, libText);

  if (signals.isFinance && (lib.domain === '金融合规' || FINANCE_RE.test(libText))) {
    score += 22;
    reasonHints.push('功能/场景含金融相关能力');
  }
  if (signals.isGov && (lib.domain === '政务/国企' || GOV_RE.test(libText))) {
    score += 20;
    reasonHints.push('功能/场景含政务/国企相关能力');
  }
  if (signals.handlesPii && (lib.domain === '个人信息' || PII_RE.test(libText))) {
    score += 16;
    reasonHints.push('功能涉及个人信息/敏感数据');
  }
  if (signals.handlesDataSecurity && (lib.domain === '数据安全' || DATA_SEC_RE.test(libText))) {
    score += 16;
    reasonHints.push('功能涉及数据安全要求');
  }
  if (signals.isCustomerFacing && CUSTOMER_RE.test(libText)) {
    score += 10;
    reasonHints.push('对外/客服暴露面');
  }

  score += Math.min(5, Math.floor((lib.caseCount || 0) / 20));

  return { score, excluded: false, reasonHints };
}

export function buildComplianceIncludeReason(
  lib: ComplianceLibraryScoreInput,
  scoreResult: ComplianceLibraryScoreResult,
  recommendedDomain: string,
  asDomainAnchor: boolean,
): string {
  if (asDomainAnchor && scoreResult.reasonHints.length === 0) {
    return `规则基线：保留推荐域 ${recommendedDomain}`;
  }
  const hints = scoreResult.reasonHints.slice(0, 2).join('；');
  if (hints) {
    return `规则推荐：${hints}`;
  }
  return `规则推荐：域 ${lib.domain}`;
}

export type ComplianceScoredLibraryPick = {
  lib: ComplianceLibraryScoreInput;
  score: number;
  reasonHints: string[];
  asDomainAnchor: boolean;
};

export function pickComplianceLibrariesByScore(params: {
  libraries: ComplianceLibraryScoreInput[];
  signals: ComplianceCapabilitySignals;
  portraitText: string;
  recommendedDomain: string;
  topN?: number;
}): {
  include: ComplianceScoredLibraryPick[];
  excludeMeta: Map<string, { excluded: boolean; excludeReason?: string; score: number }>;
} {
  const { libraries, signals, portraitText, recommendedDomain } = params;
  const topN = Math.min(
    COMPLIANCE_INCLUDE_TOP_N_MAX,
    Math.max(COMPLIANCE_INCLUDE_TOP_N_MIN, params.topN ?? COMPLIANCE_INCLUDE_TOP_N_MAX),
  );
  const excludeMeta = new Map<
    string,
    { excluded: boolean; excludeReason?: string; score: number }
  >();

  const scored: Array<{
    lib: ComplianceLibraryScoreInput;
    result: ComplianceLibraryScoreResult;
  }> = [];

  for (const lib of libraries) {
    const result = scoreComplianceLibraryForPortrait(lib, signals, portraitText, recommendedDomain);
    excludeMeta.set(lib.id, {
      excluded: result.excluded,
      excludeReason: result.excludeReason,
      score: result.score,
    });
    if (result.excluded) {
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

  const includeMap = new Map<string, ComplianceScoredLibraryPick>();
  for (const row of scored.slice(0, topN)) {
    includeMap.set(row.lib.id, {
      lib: row.lib,
      score: row.result.score,
      reasonHints: row.result.reasonHints,
      asDomainAnchor: false,
    });
  }

  const hasDomainAnchor = Array.from(includeMap.values()).some(
    (p) => p.lib.domain === recommendedDomain,
  );
  if (!hasDomainAnchor) {
    const candidates = libraries
      .filter((lib) => lib.domain === recommendedDomain)
      .map((lib) => ({
        lib,
        result: scoreComplianceLibraryForPortrait(lib, signals, portraitText, recommendedDomain),
      }))
      .filter((row) => !row.result.excluded)
      .sort(
        (a, b) =>
          b.result.score - a.result.score || (b.lib.caseCount || 0) - (a.lib.caseCount || 0),
      );
    if (candidates[0]) {
      includeMap.set(candidates[0].lib.id, {
        lib: candidates[0].lib,
        score: candidates[0].result.score,
        reasonHints: candidates[0].result.reasonHints,
        asDomainAnchor: true,
      });
    }
  }

  // Prefer at least one 通用合规 when available and not already dense
  if (includeMap.size < COMPLIANCE_INCLUDE_TOP_N_MIN) {
    for (const row of scored) {
      if (includeMap.size >= COMPLIANCE_INCLUDE_TOP_N_MIN) {
        break;
      }
      if (!includeMap.has(row.lib.id)) {
        includeMap.set(row.lib.id, {
          lib: row.lib,
          score: row.result.score,
          reasonHints: row.result.reasonHints,
          asDomainAnchor: false,
        });
      }
    }
  }

  return {
    include: Array.from(includeMap.values()).sort((a, b) => b.score - a.score),
    excludeMeta,
  };
}
