import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, getDbType } from '../database';
import logger from '../logger';
import { createTargetAgentClient } from '../server/agents/factory';
import type { TargetAgentRecord, TargetAgentType } from '../server/agents/types';
import { probeApiAgentConnection } from './attackTaskAgentExecution';

const COMPLIANCE_DOMAINS = [
  '通用合规',
  '金融合规',
  '政务/国企',
  '个人信息',
  '数据安全',
  '行业模板',
] as const;

type ComplianceDomain = (typeof COMPLIANCE_DOMAINS)[number];

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

export type CompliancePrecheckStep = {
  key: string;
  title: string;
  description: string;
  status: 'done' | 'failed' | 'skipped';
  detail?: string;
  durationMs?: number;
};

export type CompliancePrecheckResult = {
  steps: CompliancePrecheckStep[];
  apiStatus: 'passed' | 'failed' | 'skipped';
  apiResponseTimeMs?: number;
  apiMessage?: string;
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
  identifiedScenes: string[];
  identifiedDataTypes: string[];
  matchedDomains: string[];
};

const COMPLIANCE_TRIGGERS: ComplianceTrigger[] = [
  { rule: '涉及金融场景', desc: '需要金融合规检测', required: true },
  { rule: '涉及政务 / 国企场景', desc: '需要政务数据和审计检测', required: true },
  { rule: '处理个人信息', desc: '需要个人信息保护合规检测', required: true },
  { rule: '涉及敏感数据', desc: '需要数据安全合规检测', required: true },
  { rule: '对外暴露', desc: '需要加强授权与敏感信息保护检测', required: false },
];

type AssetRecord = {
  id: string;
  name: string;
  agentType: string;
  platformFamily: string;
  legacyId?: string | null;
  businessScene?: string | null;
  businessSystem?: string | null;
  functionIntro?: string | null;
  sensitiveData: boolean;
  exposureLevel: string;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  owners?: Array<{ department?: string | null; isPrimary?: boolean; ownerName?: string | null }>;
  components?: Array<{
    componentType: string;
    componentName: string;
    sensitiveLevel?: string | null;
    highRisk?: boolean;
    configSnapshot?: Record<string, unknown> | null;
  }>;
};

type CaseLibraryRow = {
  id: string;
  title: string;
  domain: string;
  caseCount: number;
  enabled: boolean;
  status: string;
};

type MappingRow = {
  law: string;
  libraryId?: string | null;
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
    complianceMappings: module.complianceRegulationMappingsTable,
    targetAgents: module.targetAgentsTable,
  };
}

function getTargetAgentsTable() {
  return tables().targetAgents;
}

function complianceLibraryWhere() {
  const { caseLibraries } = tables();
  if (getDbType() === 'mysql') {
    return sql`JSON_UNQUOTE(JSON_EXTRACT(${caseLibraries.metadata}, '$.libraryCategory')) = 'compliance'`;
  }
  return sql`${caseLibraries.metadata}->>'libraryCategory' = 'compliance'`;
}

function normalizeText(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function agentDepartment(asset: AssetRecord): string {
  const primary = asset.owners?.find((owner) => owner.isPrimary);
  return primary?.department?.trim() || '未分配部门';
}

function agentScene(asset: AssetRecord): string {
  if (asset.businessScene?.trim()) {
    return asset.businessScene.trim();
  }
  if (asset.tags?.length) {
    return asset.tags[0];
  }
  return '办公';
}

function inferComplianceDomain(asset: AssetRecord): ComplianceDomain {
  const text = normalizeText(asset.businessScene, asset.businessSystem, ...(asset.tags || []));
  if (/金融|财富|证券|银行|保险|基金/.test(text)) {
    return '金融合规';
  }
  if (/政务|国企|政府|公共/.test(text)) {
    return '政务/国企';
  }
  if (asset.sensitiveData || /个人|隐私|pipl|个保/.test(text)) {
    return '个人信息';
  }
  if (/数据安全|数安|出境|分类分级/.test(text)) {
    return '数据安全';
  }
  return '通用合规';
}

function matchTriggers(asset: AssetRecord): ComplianceTrigger[] {
  const domain = inferComplianceDomain(asset);
  const text = normalizeText(asset.businessScene, asset.businessSystem, ...(asset.tags || []));
  const matched: ComplianceTrigger[] = [];

  if (domain === '金融合规' || /金融|财富|证券/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[0]);
  }
  if (domain === '政务/国企' || /政务|国企|政府/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[1]);
  }
  if (asset.sensitiveData || domain === '个人信息' || /个人|隐私/.test(text)) {
    matched.push(COMPLIANCE_TRIGGERS[2]);
  }
  if (domain === '数据安全' || asset.sensitiveData) {
    matched.push(COMPLIANCE_TRIGGERS[3]);
  }
  if (
    asset.exposureLevel === 'external' ||
    asset.exposureLevel === 'external_customer' ||
    asset.exposureLevel === 'public'
  ) {
    matched.push(COMPLIANCE_TRIGGERS[4]);
  }
  return matched;
}

function isPublishedComplianceLibrary(lib: CaseLibraryRow): boolean {
  return lib.enabled;
}

function recommendLibraries(
  libraries: CaseLibraryRow[],
  domain: ComplianceDomain,
  limit = 5,
): RecommendedLibrary[] {
  const published = libraries.filter(isPublishedComplianceLibrary);
  const domainMatch = published.filter((lib) => lib.domain === domain);
  const generalMatch = published.filter((lib) => lib.domain === '通用合规');
  const pool = domainMatch.length ? [...domainMatch, ...generalMatch] : published;
  const seen = new Set<string>();
  const ordered: CaseLibraryRow[] = [];
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

function resolveApplicableLaws(mappings: MappingRow[], libraryIds: string[]): string[] {
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

function dataTypeLabel(asset: AssetRecord): string {
  if (asset.sensitiveData) {
    return '个人信息 / 敏感数据';
  }
  const domain = inferComplianceDomain(asset);
  if (domain === '金融合规') {
    return '金融客户数据';
  }
  if (domain === '政务/国企') {
    return '政务数据';
  }
  return '一般业务数据';
}

function identifyScenes(asset: AssetRecord): string[] {
  const scenes = new Set<string>();
  const primary = agentScene(asset);
  if (primary) {
    scenes.add(primary);
  }
  if (asset.businessSystem?.trim()) {
    scenes.add(asset.businessSystem.trim());
  }
  for (const tag of asset.tags || []) {
    if (tag.trim()) {
      scenes.add(tag.trim());
    }
  }
  if (asset.functionIntro?.trim()) {
    const intro = asset.functionIntro.trim().slice(0, 40);
    if (intro.length >= 4) {
      scenes.add(intro);
    }
  }
  return Array.from(scenes).slice(0, 5);
}

function identifyDataTypes(asset: AssetRecord): string[] {
  const types = new Set<string>();
  if (asset.sensitiveData) {
    types.add('个人信息');
    types.add('敏感数据');
  }
  const domain = inferComplianceDomain(asset);
  if (domain === '金融合规') {
    types.add('金融客户数据');
  }
  if (domain === '政务/国企') {
    types.add('政务数据');
  }
  for (const component of asset.components || []) {
    if (component.sensitiveLevel && component.sensitiveLevel !== 'none') {
      types.add(`${component.componentName}（${component.sensitiveLevel}）`);
    }
    if (component.highRisk) {
      types.add(`高危组件：${component.componentName}`);
    }
  }
  if (types.size === 0) {
    types.add('一般业务数据');
    types.add('非涉敏场景');
  }
  return Array.from(types).slice(0, 6);
}

function mapPlatformFamilyToAgentType(platformFamily: string): TargetAgentType {
  const normalized = platformFamily.toLowerCase();
  if (normalized.includes('dify')) {
    return 'dify';
  }
  if (normalized.includes('coze')) {
    return 'coze';
  }
  if (normalized.includes('fastgpt')) {
    return 'fastgpt';
  }
  if (normalized.includes('n8n')) {
    return 'n8n';
  }
  if (normalized.includes('tencent') || normalized.includes('adp') || normalized.includes('腾讯')) {
    return 'tencent-adp';
  }
  if (normalized.includes('langchain')) {
    return 'langchain';
  }
  return 'custom';
}

const RUNTIME_AGENT_TYPES = new Set<TargetAgentType>([
  'dify',
  'coze',
  'n8n',
  'fastgpt',
  'tencent-adp',
  'api',
  'api-stream',
  'langchain',
  'custom',
  'other',
]);

function resolveAssetAgentType(
  asset: AssetRecord,
  config?: Record<string, unknown> | null,
): TargetAgentType {
  const fromConfig = config?.agentType;
  if (typeof fromConfig === 'string' && RUNTIME_AGENT_TYPES.has(fromConfig as TargetAgentType)) {
    return fromConfig as TargetAgentType;
  }
  if (asset.agentType === 'api-stream' || asset.agentType === 'api') {
    return asset.agentType as TargetAgentType;
  }
  return mapPlatformFamilyToAgentType(asset.platformFamily);
}

function readAssetMetadata(asset: AssetRecord): Record<string, unknown> {
  if (asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)) {
    return asset.metadata;
  }
  return {};
}

function hasRuntimeConnectionFields(config: Record<string, unknown>): boolean {
  return (
    Boolean(String(config.apiBaseUrl ?? '').trim()) ||
    Boolean(String(config.apiKey ?? '').trim()) ||
    Boolean(String(config.webhookUrl ?? '').trim()) ||
    Boolean(String(config.botId ?? '').trim()) ||
    Boolean(String(config.connectorId ?? '').trim())
  );
}

/** Asset intake stores probe config in metadata.runtimeConfig */
function extractRuntimeConfigConnection(asset: AssetRecord): {
  type: TargetAgentType;
  config: Record<string, unknown>;
} | null {
  const meta = readAssetMetadata(asset);
  const runtimeConfig = meta.runtimeConfig;
  if (!runtimeConfig || typeof runtimeConfig !== 'object' || Array.isArray(runtimeConfig)) {
    return null;
  }
  const config = runtimeConfig as Record<string, unknown>;
  if (config.enabled === false || !hasRuntimeConnectionFields(config)) {
    return null;
  }
  return {
    type: resolveAssetAgentType(asset, config),
    config,
  };
}

const PRECHECK_PROBE_TIMEOUT_MS = 20_000;

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

async function resolveTargetAgent(organizationId: string, asset: AssetRecord) {
  const table = getTargetAgentsTable();
  if (!table) {
    return null;
  }
  const meta =
    asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
      ? asset.metadata
      : {};
  const candidateIds = [asset.legacyId, meta.targetAgentId, meta.agentId]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  for (const id of candidateIds) {
    const [agent] = await db
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);
    if (agent) {
      return agent as TargetAgentRecord & { type: string; config: Record<string, unknown> | null };
    }
  }
  return null;
}

function extractConnectionFromMetadata(asset: AssetRecord): {
  type: TargetAgentType;
  config: Record<string, unknown>;
} | null {
  const runtimeConnection = extractRuntimeConfigConnection(asset);
  if (runtimeConnection) {
    return runtimeConnection;
  }

  const meta = readAssetMetadata(asset);
  if (!Object.keys(meta).length) {
    return null;
  }
  const nested = meta.connectionConfig || meta.connection || meta.agentConfig || meta.targetConfig;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const config = nested as Record<string, unknown>;
    if (hasRuntimeConnectionFields(config)) {
      return {
        type: resolveAssetAgentType(asset, config),
        config,
      };
    }
  }
  if (typeof meta.apiBaseUrl === 'string' && meta.apiBaseUrl.trim()) {
    return {
      type: resolveAssetAgentType(asset, meta),
      config: meta,
    };
  }
  for (const component of asset.components || []) {
    const snapshot = component.configSnapshot;
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      const config = snapshot as Record<string, unknown>;
      if (hasRuntimeConnectionFields(config)) {
        return {
          type: resolveAssetAgentType(asset, config),
          config,
        };
      }
    }
  }
  return null;
}

async function executeAgentConnectionProbe(
  organizationId: string,
  asset: AssetRecord,
  type: TargetAgentType,
  config: Record<string, unknown> | null,
  name: string,
  agentId?: string,
): Promise<{
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  responseTimeMs?: number;
}> {
  if (type === 'api' || type === 'api-stream') {
    const result = await probeApiAgentConnection({
      agentType: type,
      agentConfig: config || {},
    });
    return {
      status: result.status === 'success' ? 'passed' : 'failed',
      message: result.message,
      responseTimeMs: result.durationMs,
    };
  }

  const client = createTargetAgentClient(
    {
      id: agentId || asset.id,
      type,
      config,
      name,
    },
    { organizationId },
  );
  const result = await client.testConnection();
  return {
    status: result.status === 'success' ? 'passed' : 'failed',
    message: result.message,
    responseTimeMs: result.responseTime,
  };
}

async function probeAgentApi(
  organizationId: string,
  asset: AssetRecord,
): Promise<{
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  responseTimeMs?: number;
}> {
  const runtimeConnection = extractRuntimeConfigConnection(asset);
  if (runtimeConnection) {
    return executeAgentConnectionProbe(
      organizationId,
      asset,
      runtimeConnection.type,
      runtimeConnection.config,
      asset.name,
    );
  }

  const targetAgent = await resolveTargetAgent(organizationId, asset);
  if (targetAgent) {
    return executeAgentConnectionProbe(
      organizationId,
      asset,
      targetAgent.type as TargetAgentType,
      targetAgent.config,
      targetAgent.name,
      targetAgent.id,
    );
  }

  const connection = extractConnectionFromMetadata(asset);
  if (!connection) {
    return {
      status: 'skipped',
      message:
        '未配置 Agent API 连接（请在资产入库中配置 runtimeConfig，或关联 targetAgentId / connectionConfig）',
    };
  }

  return executeAgentConnectionProbe(
    organizationId,
    asset,
    connection.type,
    connection.config,
    asset.name,
  );
}

async function probeAgentApiWithTimeout(
  organizationId: string,
  asset: AssetRecord,
): Promise<{
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  responseTimeMs?: number;
}> {
  try {
    return await Promise.race([
      probeAgentApi(organizationId, asset),
      new Promise<{
        status: 'skipped';
        message: string;
      }>((resolve) => {
        setTimeout(() => {
          resolve({
            status: 'skipped',
            message: 'API 连通性检测超时，已自动跳过（可在资产入库页单独验证连接）',
          });
        }, PRECHECK_PROBE_TIMEOUT_MS);
      }),
    ]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Agent API 检测失败';
    return {
      status: 'failed',
      message,
    };
  }
}

async function loadComplianceLibraries(organizationId: string): Promise<CaseLibraryRow[]> {
  const { caseLibraries } = tables();
  const categoryFilter = complianceLibraryWhere();
  return db
    .select({
      id: caseLibraries.id,
      title: caseLibraries.title,
      domain: caseLibraries.domain,
      caseCount: caseLibraries.caseCount,
      enabled: caseLibraries.enabled,
      status: caseLibraries.status,
    })
    .from(caseLibraries)
    .where(
      and(
        eq(caseLibraries.organizationId, organizationId),
        isNull(caseLibraries.deletedAt),
        categoryFilter,
      ),
    )
    .orderBy(desc(caseLibraries.caseCount))
    .limit(100);
}

async function loadComplianceMappings(organizationId: string): Promise<MappingRow[]> {
  const { complianceMappings } = tables();
  return db
    .select({
      law: complianceMappings.law,
      libraryId: complianceMappings.libraryId,
    })
    .from(complianceMappings)
    .where(
      and(
        eq(complianceMappings.organizationId, organizationId),
        isNull(complianceMappings.deletedAt),
      ),
    )
    .orderBy(desc(complianceMappings.updatedAt))
    .limit(200);
}

function buildWarnings(
  asset: AssetRecord,
  recommendedLibraries: RecommendedLibrary[],
  allLibraries: CaseLibraryRow[],
): string[] {
  const warnings: string[] = [];
  if (!asset.owners?.some((owner) => owner.isPrimary)) {
    warnings.push('Agent 未配置主责负责人，创建任务后将使用默认安全负责人');
  }
  if (recommendedLibraries.length === 0) {
    warnings.push('暂无已启用的合规控制库，请先在合规用例库中启用控制库');
  }
  const disabledCount = allLibraries.filter((lib) => !lib.enabled).length;
  if (disabledCount > 0 && recommendedLibraries.length < 3) {
    warnings.push(`有 ${disabledCount} 个合规控制库未启用，可能遗漏检测范围`);
  }
  if (recommendedLibraries.length > 0 && recommendedLibraries.every((lib) => lib.caseCount === 0)) {
    warnings.push('推荐控制库暂无已发布用例，执行后可能无法产生有效结论');
  }
  return warnings;
}

export async function runCompliancePrecheck(params: {
  organizationId: string;
  assetId: string;
  domainOverride?: ComplianceDomain;
}): Promise<CompliancePrecheckResult> {
  const { organizationId, assetId, domainOverride } = params;
  const steps: CompliancePrecheckStep[] = [];

  const asset = await loadAssetDetail(organizationId, assetId);
  if (!asset) {
    throw new Error('Agent 资产不存在');
  }

  const apiStart = Date.now();
  const apiProbe = await probeAgentApiWithTimeout(organizationId, asset);
  steps.push({
    key: 'api_connect',
    title: '连接 Agent API',
    description: '校验接口联通、鉴权、响应时延',
    status:
      apiProbe.status === 'passed' ? 'done' : apiProbe.status === 'skipped' ? 'skipped' : 'failed',
    detail: apiProbe.message,
    durationMs: apiProbe.responseTimeMs ?? Date.now() - apiStart,
  });

  const scenes = identifyScenes(asset);
  steps.push({
    key: 'scene_identify',
    title: '识别业务场景',
    description: scenes.join('、') || agentScene(asset),
    status: 'done',
    detail: `基于 businessScene / tags / businessSystem 识别 ${scenes.length} 项场景`,
  });

  const dataTypes = identifyDataTypes(asset);
  steps.push({
    key: 'data_type',
    title: '识别数据类型',
    description: dataTypes.join('、'),
    status: 'done',
    detail: asset.sensitiveData ? 'Agent 标记为涉敏' : '未标记涉敏，结合 domain 推断',
  });

  const recommendedDomain = domainOverride ?? inferComplianceDomain(asset);
  const libraries = await loadComplianceLibraries(organizationId);
  const matchedDomains = [
    '总览',
    ...COMPLIANCE_DOMAINS.filter((domain) => {
      if (domain === recommendedDomain) {
        return true;
      }
      return libraries.some((lib) => lib.domain === domain && lib.enabled);
    }),
  ];
  steps.push({
    key: 'library_match',
    title: '匹配合规库分类',
    description: matchedDomains.join('、'),
    status: 'done',
    detail: `推荐 domain：${recommendedDomain}`,
  });

  const recommendedLibraries = recommendLibraries(libraries, recommendedDomain);
  const libraryIds = recommendedLibraries.map((lib) => lib.id);
  const mappings = await loadComplianceMappings(organizationId);
  const applicableLaws = resolveApplicableLaws(mappings, libraryIds);
  steps.push({
    key: 'regulation_expand',
    title: '展开子法规与控制项',
    description: applicableLaws.slice(0, 6).join('、') || '暂无映射法规',
    status: applicableLaws.length > 0 ? 'done' : 'skipped',
    detail: `共 ${applicableLaws.length} 条法规映射`,
  });

  const estimatedCaseCount = recommendedLibraries.reduce((sum, lib) => sum + lib.caseCount, 0);
  steps.push({
    key: 'case_recommend',
    title: '推荐检测用例',
    description:
      recommendedLibraries.length > 0
        ? recommendedLibraries.map((lib) => `${lib.title}（${lib.caseCount}）`).join('、')
        : '暂无可用合规库',
    status: recommendedLibraries.length > 0 ? 'done' : 'skipped',
    detail: `推荐 ${recommendedLibraries.length} 个合规库，约 ${estimatedCaseCount} 条用例`,
  });

  const warnings = buildWarnings(asset, recommendedLibraries, libraries);
  if (apiProbe.status === 'failed') {
    warnings.unshift(`Agent API 连通性检测未通过：${apiProbe.message}`);
  }

  logger.info('[compliancePrecheck] completed', {
    assetId,
    organizationId,
    apiStatus: apiProbe.status,
    recommendedDomain,
    libraryCount: recommendedLibraries.length,
  });

  return {
    steps,
    apiStatus: apiProbe.status,
    apiResponseTimeMs: apiProbe.responseTimeMs,
    apiMessage: apiProbe.message,
    agent: {
      name: asset.name,
      department: agentDepartment(asset),
      scene: agentScene(asset),
      sensitiveData: asset.sensitiveData,
      exposureLevel: asset.exposureLevel,
      dataTypeLabel: dataTypeLabel(asset),
    },
    recommendedDomain,
    triggers: matchTriggers(asset),
    recommendedLibraries,
    applicableLaws,
    warnings,
    estimatedCaseCount,
    identifiedScenes: scenes,
    identifiedDataTypes: dataTypes,
    matchedDomains,
  };
}
