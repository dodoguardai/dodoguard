/**
 * Compliance library recommend plan (rules + optional Agent Skill LLM).
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { runAgentSkillJson } from '../agent/chat/runAgentSkillJson';
import { db, getDbType } from '../database';
import logger from '../logger';
import { runCompliancePrecheck } from './compliancePrecheckService';
import {
  buildComplianceIncludeReason,
  deriveComplianceCapabilitySignals,
  pickComplianceLibrariesByScore,
  portraitTextFromComplianceAsset,
} from './complianceRecommendSignals';

const COMPLIANCE_SKILL_SLUG = 'compliance-recommender';

export type ComplianceRecommendLibraryItem = {
  libraryId: string;
  title: string;
  domain: string;
  caseCount: number;
  reason: string;
};

export type ComplianceRecommendPlanResult = {
  source: 'llm' | 'rules';
  confidence: number;
  recommendedDomain: string;
  include: ComplianceRecommendLibraryItem[];
  exclude: ComplianceRecommendLibraryItem[];
  estimatedCaseCount: number;
  missingPortraitFields: string[];
  rationaleSummary: string;
};

type LibraryRow = {
  id: string;
  title: string;
  domain: string;
  caseCount: number;
  enabled: boolean;
  status: string;
  description?: string;
};

type AssetLite = {
  id: string;
  name: string;
  assetCode?: string;
  agentType?: string;
  platformFamily?: string;
  functionIntro?: string | null;
  businessScene?: string | null;
  businessSystem?: string | null;
  environment?: string | null;
  exposureLevel?: string | null;
  sensitiveData?: boolean;
  tags?: string[] | null;
  owners?: Array<{ department?: string | null; isPrimary?: boolean }>;
  components?: Array<{
    componentType: string;
    componentName: string;
    componentKey?: string | null;
    highRisk?: boolean;
    enabled?: boolean;
  }>;
};

function tables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    agentAssets: module.agentAssetsTable,
    ownerships: module.assetOwnershipsTable,
    components: module.agentAssetComponentsTable,
    caseLibraries: module.securityCaseLibrariesTable,
  };
}

function complianceLibraryWhere() {
  const { caseLibraries } = tables();
  if (getDbType() === 'mysql') {
    return sql`JSON_UNQUOTE(JSON_EXTRACT(${caseLibraries.metadata}, '$.libraryCategory')) = 'compliance'`;
  }
  return sql`${caseLibraries.metadata}->>'libraryCategory' = 'compliance'`;
}

function isExecutableLibrary(lib: LibraryRow): boolean {
  return lib.enabled;
}

function missingPortraitFields(asset: AssetLite): string[] {
  const missing: string[] = [];
  if (!String(asset.functionIntro || '').trim()) {
    missing.push('functionIntro');
  }
  if (!String(asset.businessScene || '').trim()) {
    missing.push('businessScene');
  }
  if (!asset.components?.length) {
    missing.push('components');
  }
  if (!String(asset.exposureLevel || '').trim()) {
    missing.push('exposureLevel');
  }
  return missing;
}

function portraitScore(asset: AssetLite): number {
  const checks = [
    Boolean(String(asset.functionIntro || '').trim()),
    Boolean(String(asset.businessScene || '').trim()),
    Boolean(asset.agentType),
    Boolean(asset.platformFamily),
    Boolean(asset.environment),
    Boolean(String(asset.exposureLevel || '').trim()),
    typeof asset.sensitiveData === 'boolean',
    Boolean(asset.components?.length),
  ];
  return checks.filter(Boolean).length / checks.length;
}

async function loadComplianceLibraries(
  organizationId: string,
  candidateLibraryIds?: string[],
): Promise<LibraryRow[]> {
  const { caseLibraries } = tables();
  const where = [
    eq(caseLibraries.organizationId, organizationId),
    isNull(caseLibraries.deletedAt),
    complianceLibraryWhere(),
  ];
  if (candidateLibraryIds?.length) {
    where.push(inArray(caseLibraries.id, candidateLibraryIds));
  }
  const rows = await db
    .select({
      id: caseLibraries.id,
      title: caseLibraries.title,
      domain: caseLibraries.domain,
      caseCount: caseLibraries.caseCount,
      enabled: caseLibraries.enabled,
      status: caseLibraries.status,
      description: caseLibraries.description,
    })
    .from(caseLibraries)
    .where(and(...where));
  return rows as LibraryRow[];
}

async function loadAssetLite(organizationId: string, assetId: string): Promise<AssetLite | null> {
  const { agentAssets, ownerships, components } = tables();
  const [asset] = await db
    .select()
    .from(agentAssets)
    .where(
      and(
        eq(agentAssets.organizationId, organizationId),
        eq(agentAssets.id, assetId),
        isNull(agentAssets.deletedAt),
      ),
    )
    .limit(1);
  if (!asset) {
    return null;
  }
  const [ownerRows, componentRows] = await Promise.all([
    db.select().from(ownerships).where(eq(ownerships.assetId, assetId)),
    db.select().from(components).where(eq(components.assetId, assetId)),
  ]);
  return { ...(asset as AssetLite), owners: ownerRows, components: componentRows };
}

function portraitForPrompt(asset: AssetLite) {
  const signals = deriveComplianceCapabilitySignals(asset);
  return {
    id: asset.id,
    name: asset.name,
    assetCode: asset.assetCode,
    agentType: asset.agentType,
    platformFamily: asset.platformFamily,
    functionIntro: asset.functionIntro,
    businessScene: asset.businessScene,
    businessSystem: asset.businessSystem,
    environment: asset.environment,
    exposureLevel: asset.exposureLevel,
    sensitiveData: asset.sensitiveData,
    tags: asset.tags || [],
    department: asset.owners?.find((o) => o.isPrimary)?.department || null,
    components: (asset.components || [])
      .filter((c) => c.enabled !== false)
      .map((c) => ({
        type: c.componentType,
        name: c.componentName,
        key: c.componentKey,
        highRisk: c.highRisk,
      })),
    capabilitySignals: signals,
  };
}

/** Exported for unit tests */
export function buildComplianceRulesPlan(params: {
  asset: AssetLite;
  libraries: LibraryRow[];
  recommendedDomain: string;
}): ComplianceRecommendPlanResult {
  const { asset, libraries, recommendedDomain } = params;
  const enabled = libraries.filter(isExecutableLibrary);
  const signals = deriveComplianceCapabilitySignals(asset);
  const portraitText = portraitTextFromComplianceAsset(asset);
  const missing = missingPortraitFields(asset);

  const scoreInputs = enabled.map((lib) => ({
    id: lib.id,
    title: lib.title,
    domain: lib.domain,
    description: lib.description,
    caseCount: lib.caseCount,
  }));

  const { include: picks, excludeMeta } = pickComplianceLibrariesByScore({
    libraries: scoreInputs,
    signals,
    portraitText,
    recommendedDomain,
  });

  const includeIds = new Set(picks.map((p) => p.lib.id));
  const byId = new Map(enabled.map((lib) => [lib.id, lib]));

  const include: ComplianceRecommendLibraryItem[] = picks.map((pick) => {
    const lib = byId.get(pick.lib.id)!;
    return {
      libraryId: lib.id,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason: buildComplianceIncludeReason(
        pick.lib,
        { score: pick.score, excluded: false, reasonHints: pick.reasonHints },
        recommendedDomain,
        pick.asDomainAnchor,
      ),
    };
  });

  const exclude: ComplianceRecommendLibraryItem[] = enabled
    .filter((lib) => !includeIds.has(lib.id))
    .map((lib) => {
      const meta = excludeMeta.get(lib.id);
      let reason = meta?.excludeReason || `非优先域或相关性较低（当前推荐 ${recommendedDomain}）`;
      if (!meta?.excludeReason && meta && meta.score < 20) {
        reason = '与智能体功能相关性较低，未进入 Top 推荐';
      }
      return {
        libraryId: lib.id,
        title: lib.title,
        domain: lib.domain,
        caseCount: lib.caseCount,
        reason,
      };
    });

  const functionHint = String(asset.functionIntro || '').trim()
    ? '已结合功能介绍加权'
    : '功能介绍缺失，以降权规则兜底';

  return {
    source: 'rules',
    confidence: Math.max(0.35, portraitScore(asset) * 0.75),
    recommendedDomain,
    include,
    exclude,
    estimatedCaseCount: include.reduce((sum, item) => sum + item.caseCount, 0),
    missingPortraitFields: missing,
    rationaleSummary: `规则推荐 ${include.length} 个合规库（域 ${recommendedDomain}，${functionHint}），排除 ${exclude.length} 个`,
  };
}

function mergeLlmPlan(
  rulesPlan: ComplianceRecommendPlanResult,
  libraries: LibraryRow[],
  llmJson: unknown,
): ComplianceRecommendPlanResult | null {
  if (!llmJson || typeof llmJson !== 'object' || Array.isArray(llmJson)) {
    return null;
  }
  const raw = llmJson as Record<string, unknown>;
  const byId = new Map(libraries.map((lib) => [lib.id, lib]));
  const includeIds = new Set<string>();
  for (const item of Array.isArray(raw.recommendedLibraryIds) ? raw.recommendedLibraryIds : []) {
    if (typeof item === 'string' && byId.has(item) && byId.get(item)?.enabled) {
      includeIds.add(item);
    }
  }
  if (includeIds.size === 0) {
    return null;
  }

  // Ensure recommended domain has at least one library when available
  const domain = rulesPlan.recommendedDomain;
  const hasDomain = Array.from(includeIds).some((id) => byId.get(id)?.domain === domain);
  if (!hasDomain) {
    const fallback = libraries
      .filter((lib) => isExecutableLibrary(lib) && lib.domain === domain)
      .sort((a, b) => b.caseCount - a.caseCount)[0];
    if (fallback) {
      includeIds.add(fallback.id);
    }
  }

  const reasonById = new Map<string, string>();
  for (const row of Array.isArray(raw.rationale) ? raw.rationale : []) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const rec = row as Record<string, unknown>;
    if (typeof rec.libraryId === 'string' && typeof rec.reason === 'string') {
      reasonById.set(rec.libraryId, rec.reason);
    }
  }

  const enabled = libraries.filter(isExecutableLibrary);
  const include: ComplianceRecommendLibraryItem[] = Array.from(includeIds).map((id) => {
    const lib = byId.get(id)!;
    return {
      libraryId: lib.id,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason: reasonById.get(id) || 'AI 推荐纳入本次合规评估',
    };
  });
  const exclude: ComplianceRecommendLibraryItem[] = enabled
    .filter((lib) => !includeIds.has(lib.id))
    .map((lib) => ({
      libraryId: lib.id,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason:
        reasonById.get(lib.id) ||
        rulesPlan.exclude.find((e) => e.libraryId === lib.id)?.reason ||
        '未纳入本次推荐',
    }));

  return {
    source: 'llm',
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.7,
    recommendedDomain:
      typeof raw.recommendedDomain === 'string' && raw.recommendedDomain.trim()
        ? raw.recommendedDomain.trim()
        : rulesPlan.recommendedDomain,
    include,
    exclude,
    estimatedCaseCount: include.reduce((sum, item) => sum + item.caseCount, 0),
    missingPortraitFields: Array.isArray(raw.missingPortraitFields)
      ? raw.missingPortraitFields.filter((x): x is string => typeof x === 'string')
      : rulesPlan.missingPortraitFields,
    rationaleSummary:
      typeof raw.rationaleSummary === 'string' && raw.rationaleSummary.trim()
        ? raw.rationaleSummary.trim()
        : `AI 推荐 ${include.length} 个合规库，排除 ${exclude.length} 个`,
  };
}

export async function recommendCompliancePlan(params: {
  organizationId: string;
  assetId: string;
  domainOverride?: '通用合规' | '金融合规' | '政务/国企' | '个人信息' | '数据安全' | '行业模板';
  candidateLibraryIds?: string[];
}): Promise<ComplianceRecommendPlanResult> {
  const asset = await loadAssetLite(params.organizationId, params.assetId);
  if (!asset) {
    throw new Error('Agent 资产不存在');
  }

  const precheck = await runCompliancePrecheck({
    organizationId: params.organizationId,
    assetId: params.assetId,
    domainOverride: params.domainOverride,
  });

  const libraries = await loadComplianceLibraries(
    params.organizationId,
    params.candidateLibraryIds,
  );
  const rulesPlan = buildComplianceRulesPlan({
    asset,
    libraries,
    recommendedDomain: precheck.recommendedDomain,
  });
  const score = portraitScore(asset);

  if (score < 0.5) {
    return {
      ...rulesPlan,
      rationaleSummary: `${rulesPlan.rationaleSummary}（画像完整度偏低，已使用规则推荐）`,
    };
  }

  try {
    const contextBlock = [
      '## Precheck summary',
      JSON.stringify(
        {
          recommendedDomain: precheck.recommendedDomain,
          identifiedScenes: precheck.identifiedScenes,
          identifiedDataTypes: precheck.identifiedDataTypes,
          triggers: precheck.triggers,
          agent: precheck.agent,
        },
        null,
        2,
      ),
      '',
      '## Agent portrait',
      JSON.stringify(portraitForPrompt(asset), null, 2),
      '',
      '## Candidate compliance libraries',
      JSON.stringify(
        libraries.filter(isExecutableLibrary).map((lib) => ({
          id: lib.id,
          title: lib.title,
          domain: lib.domain,
          caseCount: lib.caseCount,
          description: String(lib.description || '').slice(0, 120),
        })),
        null,
        2,
      ),
    ].join('\n');

    const { json } = await runAgentSkillJson({
      pinnedSkillSlug: COMPLIANCE_SKILL_SLUG,
      skillOnly: true,
      contextBlock,
      userMessage:
        '请根据画像（尤其是 functionIntro / capabilitySignals）与候选库输出合规评估方案 JSON（include/exclude）。每条 rationale 必须点名功能或信号。',
    });
    const merged = mergeLlmPlan(rulesPlan, libraries, json);
    if (merged) {
      return merged;
    }
    logger.warn('[complianceRecommend] LLM plan invalid after merge; using rules');
  } catch (error) {
    logger.warn('[complianceRecommend] LLM recommend failed; using rules', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return rulesPlan;
}
