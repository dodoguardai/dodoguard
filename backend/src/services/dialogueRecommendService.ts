/**
 * Dialogue security library recommend plan (rules + optional Agent Skill LLM).
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { runAgentSkillJson } from '../agent/chat/runAgentSkillJson';
import { db, getDbType } from '../database';
import logger from '../logger';
import {
  BASELINE_DOMAINS,
  buildIncludeReason,
  deriveCapabilitySignals,
  isSameDialogueDomain,
  isToolOrientedLibrary,
  pickLibrariesByScore,
  portraitTextFromAsset,
} from './dialogueRecommendSignals';

const DIALOGUE_SKILL_SLUG = 'dialogue-security-recommender';

export type DialogueRecommendLibraryItem = {
  libraryId: string;
  libraryKey?: string;
  title: string;
  domain: string;
  caseCount: number;
  reason: string;
};

export type DialogueRecommendPlanResult = {
  source: 'llm' | 'rules';
  confidence: number;
  include: DialogueRecommendLibraryItem[];
  exclude: DialogueRecommendLibraryItem[];
  estimatedCaseCount: number;
  focusDomains: string[];
  missingPortraitFields: string[];
  rationaleSummary: string;
};

type AssetRecord = {
  id: string;
  name: string;
  assetCode?: string;
  agentType: string;
  platformFamily: string;
  businessScene?: string | null;
  businessSystem?: string | null;
  functionIntro?: string | null;
  sensitiveData: boolean;
  exposureLevel: string;
  environment?: string;
  riskLevel?: string;
  defaultModel?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  owners?: Array<{ department?: string | null; isPrimary?: boolean }>;
  components?: Array<{
    componentType: string;
    componentName: string;
    componentKey?: string | null;
    highRisk?: boolean;
    enabled?: boolean;
  }>;
};

type LibraryRow = {
  id: string;
  libraryKey: string;
  title: string;
  domain: string;
  description: string;
  caseCount: number;
  enabled: boolean;
  status: string;
  standards?: unknown;
  metadata?: Record<string, unknown> | null;
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

function technicalLibraryWhere() {
  const { caseLibraries } = tables();
  if (getDbType() === 'mysql') {
    return sql`(
      JSON_EXTRACT(${caseLibraries.metadata}, '$.libraryCategory') IS NULL
      OR JSON_UNQUOTE(JSON_EXTRACT(${caseLibraries.metadata}, '$.libraryCategory')) = 'technical'
    )`;
  }
  return sql`(
    ${caseLibraries.metadata}->>'libraryCategory' IS NULL
    OR ${caseLibraries.metadata}->>'libraryCategory' = 'technical'
  )`;
}

function libraryScope(lib: LibraryRow): string | null {
  const meta = lib.metadata;
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const scope = meta.scope;
  return typeof scope === 'string' ? scope : null;
}

function libraryMetaString(lib: LibraryRow, key: string): string | null {
  const meta = lib.metadata;
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const value = meta[key];
  return typeof value === 'string' ? value : null;
}

function missingPortraitFields(asset: AssetRecord): string[] {
  const missing: string[] = [];
  if (!asset.functionIntro?.trim()) {
    missing.push('functionIntro');
  }
  if (!asset.businessScene?.trim()) {
    missing.push('businessScene');
  }
  if (!asset.components?.length) {
    missing.push('components');
  }
  if (!asset.exposureLevel?.trim()) {
    missing.push('exposureLevel');
  }
  return missing;
}

function portraitScore(asset: AssetRecord): number {
  const checks = [
    Boolean(asset.functionIntro?.trim()),
    Boolean(asset.businessScene?.trim()),
    Boolean(asset.agentType),
    Boolean(asset.platformFamily),
    Boolean(asset.environment),
    Boolean(asset.exposureLevel),
    typeof asset.sensitiveData === 'boolean',
    Boolean(asset.components?.length),
  ];
  return checks.filter(Boolean).length / checks.length;
}

async function loadAssetDetail(
  organizationId: string,
  assetId: string,
): Promise<AssetRecord | null> {
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
  return {
    ...(asset as AssetRecord),
    owners: ownerRows,
    components: componentRows,
  };
}

async function loadTechnicalLibraries(
  organizationId: string,
  candidateLibraryIds?: string[],
): Promise<LibraryRow[]> {
  const { caseLibraries } = tables();
  const where = [
    eq(caseLibraries.organizationId, organizationId),
    isNull(caseLibraries.deletedAt),
    technicalLibraryWhere(),
  ];
  if (candidateLibraryIds?.length) {
    where.push(inArray(caseLibraries.id, candidateLibraryIds));
  }
  const rows = await db
    .select({
      id: caseLibraries.id,
      libraryKey: caseLibraries.libraryKey,
      title: caseLibraries.title,
      domain: caseLibraries.domain,
      description: caseLibraries.description,
      caseCount: caseLibraries.caseCount,
      enabled: caseLibraries.enabled,
      status: caseLibraries.status,
      standards: caseLibraries.standards,
      metadata: caseLibraries.metadata,
    })
    .from(caseLibraries)
    .where(and(...where));
  return rows as LibraryRow[];
}

/** Exported for unit tests */
export function buildRulesPlan(
  asset: AssetRecord,
  libraries: LibraryRow[],
  assessScenario: string,
): DialogueRecommendPlanResult {
  const enabled = libraries.filter((lib) => lib.enabled);
  const signals = deriveCapabilitySignals(asset);
  const portraitText = portraitTextFromAsset(asset);
  const missing = missingPortraitFields(asset);

  const scoreInputs = enabled.map((lib) => ({
    id: lib.id,
    libraryKey: lib.libraryKey,
    title: lib.title,
    domain: lib.domain,
    description: lib.description,
    caseCount: lib.caseCount,
    standards: lib.standards,
    scope: libraryScope(lib),
    category: libraryMetaString(lib, 'category'),
    tag: libraryMetaString(lib, 'tag'),
  }));

  const { include: picks, excludeMeta } = pickLibrariesByScore({
    libraries: scoreInputs,
    signals,
    portraitText,
    assessScenario,
  });

  const includeIds = new Set(picks.map((p) => p.lib.id));
  const byId = new Map(enabled.map((lib) => [lib.id, lib]));

  const include: DialogueRecommendLibraryItem[] = picks.map((pick) => {
    const lib = byId.get(pick.lib.id)!;
    return {
      libraryId: lib.id,
      libraryKey: lib.libraryKey,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason: buildIncludeReason(
        assessScenario,
        pick.lib,
        { score: pick.score, excluded: false, reasonHints: pick.reasonHints },
        pick.asBaseline,
      ),
    };
  });

  const exclude: DialogueRecommendLibraryItem[] = enabled
    .filter((lib) => !includeIds.has(lib.id))
    .map((lib) => {
      const meta = excludeMeta.get(lib.id);
      let reason = meta?.excludeReason || '非本评估场景优先域或相关性较低';
      if (!meta?.excludeReason) {
        if (!signals.hasRag && lib.domain === '知识库') {
          reason = '画像无知识库/RAG 信号，排除知识库域';
        } else if (!signals.hasTools && isToolOrientedLibrary(lib)) {
          reason = '画像无 tool/mcp 挂载，排除工具向用例库';
        } else if (meta && meta.score < 20) {
          reason = '与智能体功能相关性较低，未进入 Top 推荐';
        }
      }
      return {
        libraryId: lib.id,
        libraryKey: lib.libraryKey,
        title: lib.title,
        domain: lib.domain,
        caseCount: lib.caseCount,
        reason,
      };
    });

  const functionHint = asset.functionIntro?.trim()
    ? '已结合功能介绍加权'
    : '功能介绍缺失，以降权规则兜底';

  return {
    source: 'rules',
    confidence: Math.max(0.35, portraitScore(asset) * 0.75),
    include,
    exclude,
    estimatedCaseCount: include.reduce((sum, item) => sum + item.caseCount, 0),
    focusDomains: Array.from(new Set(include.map((i) => i.domain))),
    missingPortraitFields: missing,
    rationaleSummary: `规则推荐 ${include.length} 个用例库（${functionHint}），排除 ${exclude.length} 个场景/能力不适用项`,
  };
}

function catalogForPrompt(libraries: LibraryRow[]) {
  return libraries
    .filter((lib) => lib.enabled)
    .map((lib) => ({
      id: lib.id,
      libraryKey: lib.libraryKey,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      description: String(lib.description || '').slice(0, 120),
      scope: libraryScope(lib),
      standards: Array.isArray(lib.standards) ? lib.standards.slice(0, 4) : [],
    }));
}

function portraitForPrompt(asset: AssetRecord) {
  const signals = deriveCapabilitySignals(asset);
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
    riskLevel: asset.riskLevel,
    defaultModel: asset.defaultModel,
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
    signals: {
      hasRag: signals.hasRag,
      hasTools: signals.hasTools,
    },
  };
}

function mergeLlmPlan(
  asset: AssetRecord,
  libraries: LibraryRow[],
  rulesPlan: DialogueRecommendPlanResult,
  llmJson: unknown,
): DialogueRecommendPlanResult | null {
  if (!llmJson || typeof llmJson !== 'object' || Array.isArray(llmJson)) {
    return null;
  }
  const raw = llmJson as Record<string, unknown>;
  const byId = new Map(libraries.map((lib) => [lib.id, lib]));
  const byKey = new Map(libraries.map((lib) => [lib.libraryKey, lib]));

  const resolveId = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }
    if (byId.has(value)) {
      return value;
    }
    const viaKey = byKey.get(value);
    return viaKey?.id || null;
  };

  const includeIds = new Set<string>();
  const recommended = Array.isArray(raw.recommendedLibraryIds) ? raw.recommendedLibraryIds : [];
  for (const item of recommended) {
    const id = resolveId(item);
    if (id && byId.get(id)?.enabled) {
      includeIds.add(id);
    }
  }

  // Enforce baseline domains from enabled libs
  for (const domain of BASELINE_DOMAINS) {
    const hasDomain = Array.from(includeIds).some((id) => {
      const lib = byId.get(id);
      return lib ? isSameDialogueDomain(lib.domain, domain) : false;
    });
    if (hasDomain) {
      continue;
    }
    const fallback = libraries
      .filter((lib) => lib.enabled && isSameDialogueDomain(lib.domain, domain))
      .sort((a, b) => b.caseCount - a.caseCount)[0];
    if (fallback) {
      includeIds.add(fallback.id);
    }
  }

  if (includeIds.size === 0) {
    return null;
  }

  const rationaleRows = Array.isArray(raw.rationale) ? raw.rationale : [];
  const reasonById = new Map<string, string>();
  for (const row of rationaleRows) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const rec = row as Record<string, unknown>;
    const id = resolveId(rec.libraryId);
    if (id && typeof rec.reason === 'string') {
      reasonById.set(id, rec.reason);
    }
  }

  const excludeHint = new Set<string>();
  const excludeRaw = Array.isArray(raw.excludeLibraryIds) ? raw.excludeLibraryIds : [];
  for (const item of excludeRaw) {
    const id = resolveId(item);
    if (id) {
      excludeHint.add(id);
    }
  }

  const enabled = libraries.filter((lib) => lib.enabled);
  const include: DialogueRecommendLibraryItem[] = Array.from(includeIds).map((id) => {
    const lib = byId.get(id)!;
    return {
      libraryId: lib.id,
      libraryKey: lib.libraryKey,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason: reasonById.get(id) || 'AI 推荐纳入本次评估',
    };
  });

  const exclude: DialogueRecommendLibraryItem[] = enabled
    .filter((lib) => !includeIds.has(lib.id))
    .map((lib) => ({
      libraryId: lib.id,
      libraryKey: lib.libraryKey,
      title: lib.title,
      domain: lib.domain,
      caseCount: lib.caseCount,
      reason:
        reasonById.get(lib.id) ||
        (excludeHint.has(lib.id)
          ? 'AI 判定场景/能力不适用'
          : rulesPlan.exclude.find((e) => e.libraryId === lib.id)?.reason || '未纳入本次推荐'),
    }));

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.7;
  const missing = Array.isArray(raw.missingPortraitFields)
    ? raw.missingPortraitFields.filter((x): x is string => typeof x === 'string')
    : missingPortraitFields(asset);
  const focusDomains = Array.isArray(raw.focusDomains)
    ? raw.focusDomains.filter((x): x is string => typeof x === 'string')
    : Array.from(new Set(include.map((i) => i.domain)));
  const rationaleSummary =
    typeof raw.rationaleSummary === 'string' && raw.rationaleSummary.trim()
      ? raw.rationaleSummary.trim()
      : `AI 推荐 ${include.length} 个用例库，排除 ${exclude.length} 个`;

  const estimatedCaseCount =
    typeof raw.estimatedCaseCount === 'number' && Number.isFinite(raw.estimatedCaseCount)
      ? Math.max(0, Math.round(raw.estimatedCaseCount))
      : include.reduce((sum, item) => sum + item.caseCount, 0);

  return {
    source: 'llm',
    confidence,
    include,
    exclude,
    estimatedCaseCount,
    focusDomains,
    missingPortraitFields: missing,
    rationaleSummary,
  };
}

export async function recommendDialoguePlan(params: {
  organizationId: string;
  assetId: string;
  assessScenario?: string;
  candidateLibraryIds?: string[];
}): Promise<DialogueRecommendPlanResult> {
  const assessScenario = params.assessScenario || 'launch';
  const asset = await loadAssetDetail(params.organizationId, params.assetId);
  if (!asset) {
    throw new Error('Agent 资产不存在');
  }

  const libraries = await loadTechnicalLibraries(params.organizationId, params.candidateLibraryIds);
  const rulesPlan = buildRulesPlan(asset, libraries, assessScenario);
  const score = portraitScore(asset);

  if (score < 0.5) {
    return {
      ...rulesPlan,
      rationaleSummary: `${rulesPlan.rationaleSummary}（画像完整度偏低，已使用规则推荐）`,
    };
  }

  try {
    const contextBlock = [
      '## Assess scenario',
      assessScenario,
      '',
      '## Agent portrait',
      JSON.stringify(portraitForPrompt(asset), null, 2),
      '',
      '## Candidate technical libraries',
      JSON.stringify(catalogForPrompt(libraries), null, 2),
    ].join('\n');

    const { json } = await runAgentSkillJson({
      pinnedSkillSlug: DIALOGUE_SKILL_SLUG,
      skillOnly: true,
      contextBlock,
      userMessage:
        '请根据画像（尤其是 functionIntro / capabilitySignals）与候选库输出对话安全评估方案 JSON（include/exclude）。每条 rationale 必须点名功能或信号。',
    });

    const merged = mergeLlmPlan(asset, libraries, rulesPlan, json);
    if (merged) {
      return merged;
    }
    logger.warn('[dialogueRecommend] LLM plan invalid after merge; using rules');
  } catch (error) {
    logger.warn('[dialogueRecommend] LLM recommend failed; using rules', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return rulesPlan;
}
