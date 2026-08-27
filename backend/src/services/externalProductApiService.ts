/**
 * Shared product operations for /api/v1/external/* (asset → assessment → remediation → report).
 * Keeps SQL out of route handlers; mirrors internal JWT route semantics with org scoping.
 */

import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, getDbType } from '../database';
import logger from '../logger';
import { executePatrolPlanAsRun, executeSecurityScanTask } from './securityScanExecutionService';

function assetTables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    agentAssets: module.agentAssetsTable,
    ownerships: module.assetOwnershipsTable,
    components: module.agentAssetComponentsTable,
    snapshots: module.agentAssetSnapshotsTable,
    lifecycleEvents: module.assetLifecycleEventsTable,
    discovered: module.platformDiscoveredAssetsTable,
    users: module.usersTable,
  };
}

function scanTables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    tasks: module.securityScanTasksTable,
    plans: module.securityScanTaskPlansTable,
    scanFindings: module.securityScanFindingsTable,
    remediationTasks: module.securityRemediationTasksTable,
    remediationEvidence: module.securityRemediationEvidenceTable,
    retestRecords: module.securityRetestRecordsTable,
    assets: module.agentAssetsTable,
    components: module.agentAssetComponentsTable,
    snapshots: module.agentAssetSnapshotsTable,
  };
}

export const externalOwnerSchema = z.object({
  id: z.string().optional(),
  ownerType: z.enum(['business', 'developer', 'security', 'ops']),
  userId: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export const externalComponentSchema = z.object({
  id: z.string().optional(),
  componentType: z.enum(['tool', 'skill', 'mcp', 'model', 'knowledge_base', 'workflow', 'api']),
  componentName: z.string().min(1),
  componentKey: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  sourceType: z.string().optional().nullable(),
  sourceRefId: z.string().optional().nullable(),
  highRisk: z.boolean().optional(),
  sensitiveLevel: z.string().optional().nullable(),
  permissionScope: z.record(z.unknown()).optional(),
  configSnapshot: z.record(z.unknown()).optional(),
  componentFingerprint: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

export const externalCreateAssetSchema = z.object({
  teamId: z.string().optional().nullable(),
  legacyId: z.string().optional().nullable(),
  assetCode: z.string().optional(),
  name: z.string().min(1),
  agentType: z.string().min(1),
  platformFamily: z.string().min(1),
  externalId: z.string().optional().nullable(),
  sourceType: z.string().optional(),
  environment: z.string().min(1),
  runtimeStatus: z.string().optional(),
  lifecycleStatus: z.string().optional(),
  admissionStatus: z.string().optional(),
  businessScene: z.string().optional().nullable(),
  businessSystem: z.string().optional().nullable(),
  functionIntro: z.string().min(1),
  riskLevel: z.string().optional(),
  exposureLevel: z.string().optional(),
  exposureSurface: z.string().optional().nullable(),
  sensitiveData: z.boolean(),
  version: z.string().optional(),
  defaultModel: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  owners: z.array(externalOwnerSchema).optional(),
  components: z.array(externalComponentSchema).optional(),
});

export const externalUpdateAssetSchema = externalCreateAssetSchema.partial().extend({
  name: z.string().min(1).optional(),
  functionIntro: z.string().min(1).optional(),
});

export const externalAssessmentPlanSchema = z.object({
  id: z.string().optional(),
  probeType: z.string().min(1),
  strategy: z.string().min(1),
  enabled: z.boolean().optional(),
  libIds: z.array(z.string()).optional(),
  caseCount: z.number().int().optional(),
  targets: z.array(z.record(z.unknown())).optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const externalCreateAssessmentSchema = z.object({
  assetId: z.string().optional().nullable(),
  assetCode: z.string().optional().nullable(),
  assetName: z.string().optional().nullable(),
  assetVersion: z.string().optional().nullable(),
  assetSnapshotId: z.string().optional().nullable(),
  componentVersions: z.array(z.record(z.unknown())).optional(),
  name: z.string().min(1),
  source: z.string().optional(),
  scanType: z.string().optional(),
  targetKind: z.string().optional(),
  targetSummary: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  runConfig: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  plans: z.array(externalAssessmentPlanSchema).optional(),
  templateId: z.string().optional().nullable(),
  /** When true, execute immediately after create */
  start: z.boolean().optional(),
});

export const externalExecuteAssessmentSchema = z.object({
  mode: z.enum(['simulate', 'manual', 'scheduled']).optional(),
  generateFindings: z.boolean().optional(),
});

export const externalRemediationUpdateSchema = z.object({
  status: z
    .enum([
      'open',
      'assigned',
      'in_progress',
      'evidence_submitted',
      'retesting',
      'closed',
      'reopened',
      'risk_accepted',
    ])
    .optional(),
  ownerName: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  evidenceSummary: z.string().optional().nullable(),
  retestStatus: z.enum(['not_started', 'pending', 'passed', 'failed']).optional(),
  finalDecision: z.enum(['closed', 'rework', 'risk_accepted']).optional().nullable(),
  acceptedReason: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const externalEvidenceSchema = z.object({
  evidenceType: z.string().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  attachments: z.array(z.record(z.unknown())).optional(),
});

export const externalRetestSchema = z.object({
  result: z.enum(['pending', 'passed', 'failed']).optional(),
  conclusion: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
  retestAssetVersion: z.string().optional().nullable(),
  retestSnapshotId: z.string().optional().nullable(),
  retestTaskId: z.string().uuid().optional().nullable(),
});

function parseLimitOffset(
  query: { limit?: unknown; offset?: unknown },
  defaults = { limit: 50, offset: 0 },
) {
  const limit = Math.min(Math.max(Number(query.limit ?? defaults.limit) || defaults.limit, 1), 200);
  const offset = Math.max(Number(query.offset ?? defaults.offset) || 0, 0);
  return { limit, offset };
}

async function resolveActorId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) { return null; }
  const { users } = assetTables();
  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.id || null;
  } catch {
    return null;
  }
}

async function nextAssetCode(organizationId: string): Promise<string> {
  const { agentAssets } = assetTables();
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentAssets)
    .where(eq(agentAssets.organizationId, organizationId));
  const next = Number(countRows[0]?.count ?? 0) + 1001;
  return `AGT-${String(next).padStart(4, '0')}`;
}

async function replaceChildren(
  organizationId: string,
  assetId: string,
  owners: z.infer<typeof externalOwnerSchema>[] | undefined,
  components: z.infer<typeof externalComponentSchema>[] | undefined,
) {
  const { ownerships, components: componentsTable } = assetTables();
  if (owners) {
    await db.delete(ownerships).where(eq(ownerships.assetId, assetId));
    if (owners.length > 0) {
      await db.insert(ownerships).values(
        owners.map((owner) => ({
          id: uuidv4(),
          organizationId,
          assetId,
          ownerType: owner.ownerType,
          userId: owner.userId || null,
          ownerName: owner.ownerName || null,
          department: owner.department || null,
          isPrimary: owner.isPrimary ?? false,
        })),
      );
    }
  }
  if (components) {
    await db.delete(componentsTable).where(eq(componentsTable.assetId, assetId));
    if (components.length > 0) {
      await db.insert(componentsTable).values(
        components.map((component) => ({
          id: uuidv4(),
          organizationId,
          assetId,
          componentType: component.componentType,
          componentName: component.componentName,
          componentKey: component.componentKey || null,
          version: component.version || null,
          sourceType: component.sourceType || 'manual',
          sourceRefId: component.sourceRefId || null,
          highRisk: component.highRisk ?? false,
          sensitiveLevel: component.sensitiveLevel || null,
          permissionScope: component.permissionScope || {},
          configSnapshot: component.configSnapshot || {},
          componentFingerprint: component.componentFingerprint || null,
          enabled: component.enabled ?? true,
        })),
      );
    }
  }
}

export async function loadExternalAssetDetail(organizationId: string, assetId: string) {
  const { agentAssets, ownerships, components, snapshots, lifecycleEvents } = assetTables();
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
  if (!asset) { return null; }
  const [owners, componentRows, snapshotRows, events] = await Promise.all([
    db
      .select()
      .from(ownerships)
      .where(and(eq(ownerships.organizationId, organizationId), eq(ownerships.assetId, assetId))),
    db
      .select()
      .from(components)
      .where(and(eq(components.organizationId, organizationId), eq(components.assetId, assetId))),
    db
      .select()
      .from(snapshots)
      .where(and(eq(snapshots.organizationId, organizationId), eq(snapshots.assetId, assetId)))
      .orderBy(desc(snapshots.createdAt))
      .limit(10),
    db
      .select()
      .from(lifecycleEvents)
      .where(
        and(
          eq(lifecycleEvents.organizationId, organizationId),
          eq(lifecycleEvents.assetId, assetId),
        ),
      )
      .orderBy(desc(lifecycleEvents.createdAt))
      .limit(30),
  ]);
  return { ...asset, owners, components: componentRows, snapshots: snapshotRows, events };
}

async function recordAssetEvent(params: {
  organizationId: string;
  assetId: string;
  eventType: string;
  actorId: string | null;
  toStatus?: string | null;
  detail?: Record<string, unknown>;
}) {
  const { lifecycleEvents } = assetTables();
  try {
    await db.insert(lifecycleEvents).values({
      id: uuidv4(),
      organizationId: params.organizationId,
      assetId: params.assetId,
      eventType: params.eventType,
      fromStatus: null,
      toStatus: params.toStatus || null,
      actorId: params.actorId,
      eventDetail: params.detail || {},
    });
  } catch (error) {
    logger.warn('Failed to record external asset event:', error);
  }
}

export async function listExternalAssets(organizationId: string, query: Record<string, unknown>) {
  const { agentAssets } = assetTables();
  const { limit, offset } = parseLimitOffset(query);
  const whereConditions = [
    eq(agentAssets.organizationId, organizationId),
    isNull(agentAssets.deletedAt),
  ];
  if (query.search) {
    const s = String(query.search);
    whereConditions.push(
      or(like(agentAssets.name, `%${s}%`), like(agentAssets.assetCode, `%${s}%`)) as any,
    );
  }
  if (query.platformFamily) {
    whereConditions.push(eq(agentAssets.platformFamily, String(query.platformFamily)));
  }
  if (query.admissionStatus) {
    whereConditions.push(eq(agentAssets.admissionStatus, String(query.admissionStatus)));
  }
  if (query.environment) {
    whereConditions.push(eq(agentAssets.environment, String(query.environment)));
  }
  const rows = await db
    .select()
    .from(agentAssets)
    .where(and(...whereConditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(agentAssets.updatedAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentAssets)
    .where(and(...whereConditions));
  const total = Number(totalRows[0]?.count ?? 0);
  return { data: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export async function createExternalAsset(
  organizationId: string,
  actorUserId: string | null,
  input: z.infer<typeof externalCreateAssetSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { agentAssets } = assetTables();
  const duplicate = await db
    .select({ id: agentAssets.id })
    .from(agentAssets)
    .where(
      and(
        eq(agentAssets.organizationId, organizationId),
        eq(agentAssets.name, input.name),
        isNull(agentAssets.deletedAt),
      ),
    )
    .limit(1);
  if (duplicate.length > 0) {
    const err = new Error('Agent name already exists');
    (err as Error & { code?: string }).code = 'DUPLICATE_ASSET_NAME';
    throw err;
  }
  const assetId = uuidv4();
  const assetCode = input.assetCode || (await nextAssetCode(organizationId));
  await db.insert(agentAssets).values({
    id: assetId,
    organizationId,
    teamId: input.teamId || null,
    legacyId: input.legacyId || null,
    assetCode,
    name: input.name,
    agentType: input.agentType,
    platformFamily: input.platformFamily,
    externalId: input.externalId || null,
    sourceType: input.sourceType || 'manual',
    environment: input.environment,
    runtimeStatus: input.runtimeStatus || 'not_launched',
    lifecycleStatus: input.lifecycleStatus || 'registered',
    admissionStatus: input.admissionStatus || 'not_checked',
    businessScene: input.businessScene || null,
    businessSystem: input.businessSystem || null,
    functionIntro: input.functionIntro,
    riskLevel: input.riskLevel || 'normal',
    exposureLevel: input.exposureLevel || 'internal',
    exposureSurface: input.exposureSurface || null,
    sensitiveData: input.sensitiveData,
    version: input.version || 'v0.1.0',
    defaultModel: input.defaultModel || null,
    tags: input.tags || [],
    metadata: input.metadata || {},
    createdBy: userId,
    updatedBy: userId,
  });
  await replaceChildren(organizationId, assetId, input.owners || [], input.components || []);
  await recordAssetEvent({
    organizationId,
    assetId,
    eventType: 'created',
    actorId: userId,
    toStatus: 'registered',
    detail: { source: 'external_api' },
  });
  return loadExternalAssetDetail(organizationId, assetId);
}

export async function updateExternalAsset(
  organizationId: string,
  actorUserId: string | null,
  assetId: string,
  input: z.infer<typeof externalUpdateAssetSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { agentAssets } = assetTables();
  const current = await loadExternalAssetDetail(organizationId, assetId);
  if (!current) { return null; }
  const updateData: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  for (const key of [
    'teamId',
    'legacyId',
    'assetCode',
    'name',
    'agentType',
    'platformFamily',
    'externalId',
    'sourceType',
    'environment',
    'runtimeStatus',
    'lifecycleStatus',
    'admissionStatus',
    'businessScene',
    'businessSystem',
    'functionIntro',
    'riskLevel',
    'exposureLevel',
    'exposureSurface',
    'sensitiveData',
    'version',
    'defaultModel',
    'tags',
    'metadata',
  ] as const) {
    if (key in input) {
      updateData[key] = (input as any)[key] ?? null;
    }
  }
  await db
    .update(agentAssets)
    .set(updateData)
    .where(and(eq(agentAssets.organizationId, organizationId), eq(agentAssets.id, assetId)));
  if (input.owners || input.components) {
    await replaceChildren(organizationId, assetId, input.owners, input.components);
  }
  return loadExternalAssetDetail(organizationId, assetId);
}

export async function listExternalDiscovered(
  organizationId: string,
  query: Record<string, unknown>,
) {
  const { discovered } = assetTables();
  const { limit, offset } = parseLimitOffset(query);
  const claimStatus = (query.claimStatus as string) || 'pending';
  const whereConditions = [eq(discovered.organizationId, organizationId)];
  if (claimStatus !== 'all') {
    whereConditions.push(eq(discovered.claimStatus, claimStatus));
  }
  if (query.platformFamily) {
    whereConditions.push(eq(discovered.platformFamily, String(query.platformFamily)));
  }
  const rows = await db
    .select()
    .from(discovered)
    .where(and(...whereConditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(discovered.discoveredAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(discovered)
    .where(and(...whereConditions));
  const total = Number(totalRows[0]?.count ?? 0);
  return { data: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export async function claimExternalDiscovered(
  organizationId: string,
  actorUserId: string | null,
  discoveredId: string,
  body: Partial<z.infer<typeof externalCreateAssetSchema>>,
) {
  const { discovered } = assetTables();
  const [record] = await db
    .select()
    .from(discovered)
    .where(and(eq(discovered.organizationId, organizationId), eq(discovered.id, discoveredId)))
    .limit(1);
  if (!record) {
    const err = new Error('Discovered asset not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  const createInput = externalCreateAssetSchema.parse({
    name: body.name || record.rawName,
    agentType: body.agentType || 'qa',
    platformFamily: body.platformFamily || record.platformFamily,
    externalId: body.externalId || record.externalId,
    sourceType: 'platform_sync',
    environment: body.environment || 'test',
    functionIntro: body.functionIntro || '平台同步发现资产，认领后待补充功能介绍。',
    sensitiveData: body.sensitiveData ?? false,
    exposureLevel: body.exposureLevel || 'internal',
    metadata: { discoveredPayload: record.rawPayload, ...(body.metadata || {}) },
    owners: body.owners || [],
    components: body.components || [],
  });
  const asset = await createExternalAsset(organizationId, actorUserId, createInput);
  await db
    .update(discovered)
    .set({ claimStatus: 'claimed', claimedAssetId: asset!.id, updatedAt: new Date() })
    .where(eq(discovered.id, discoveredId));
  await recordAssetEvent({
    organizationId,
    assetId: asset!.id as string,
    eventType: 'claimed',
    actorId: await resolveActorId(actorUserId),
    toStatus: 'registered',
    detail: { discoveredAssetId: discoveredId },
  });
  return asset;
}

export async function ignoreExternalDiscovered(organizationId: string, discoveredId: string) {
  const { discovered } = assetTables();
  const [record] = await db
    .select({ id: discovered.id })
    .from(discovered)
    .where(and(eq(discovered.organizationId, organizationId), eq(discovered.id, discoveredId)))
    .limit(1);
  if (!record) {
    const err = new Error('Discovered asset not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  await db
    .update(discovered)
    .set({ claimStatus: 'ignored', updatedAt: new Date() })
    .where(eq(discovered.id, discoveredId));
}

async function loadAssessmentDetail(organizationId: string, taskId: string) {
  const { tasks, plans } = scanTables();
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId), isNull(tasks.deletedAt)),
    )
    .limit(1);
  if (!task) { return null; }
  const planRows = await db.select().from(plans).where(eq(plans.taskId, taskId));
  return { ...task, plans: planRows };
}

async function loadAssetVersionContext(organizationId: string, assetId?: string | null) {
  if (!assetId) {
    return {
      assetVersion: null,
      assetSnapshotId: null,
      componentVersions: [] as Record<string, unknown>[],
    };
  }
  const { assets, components, snapshots } = scanTables();
  const [[asset], componentRows, snapshotRows] = await Promise.all([
    db
      .select({ version: assets.version })
      .from(assets)
      .where(and(eq(assets.organizationId, organizationId), eq(assets.id, assetId)))
      .limit(1),
    db
      .select({
        id: components.id,
        componentType: components.componentType,
        componentName: components.componentName,
        componentKey: components.componentKey,
        version: components.version,
        componentFingerprint: components.componentFingerprint,
      })
      .from(components)
      .where(and(eq(components.organizationId, organizationId), eq(components.assetId, assetId))),
    db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(and(eq(snapshots.organizationId, organizationId), eq(snapshots.assetId, assetId)))
      .orderBy(desc(snapshots.createdAt))
      .limit(1),
  ]);
  return {
    assetVersion: asset?.version || null,
    assetSnapshotId: snapshotRows[0]?.id || null,
    componentVersions: componentRows.map((c) => ({
      id: c.id,
      type: c.componentType,
      name: c.componentName,
      key: c.componentKey,
      version: c.version,
      fingerprint: c.componentFingerprint,
    })),
  };
}

function isPatrolPlanTask(task: {
  scanType?: string | null;
  source?: string | null;
  targetKind?: string | null;
  metadata?: unknown;
}): boolean {
  const metadata =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : {};
  return (
    metadata.isPatrolPlan === true ||
    task.scanType === '周期巡检' ||
    task.scanType === '周期检测' ||
    task.source === '定期巡检' ||
    task.targetKind === 'agent_patrol_plan'
  );
}

export async function listExternalAssessments(
  organizationId: string,
  query: Record<string, unknown>,
) {
  const { tasks } = scanTables();
  const { limit, offset } = parseLimitOffset(query);
  const where = [eq(tasks.organizationId, organizationId), isNull(tasks.deletedAt)];
  if (query.status) { where.push(eq(tasks.status, String(query.status))); }
  if (query.scanType) { where.push(eq(tasks.scanType, String(query.scanType))); }
  if (query.targetKind) { where.push(eq(tasks.targetKind, String(query.targetKind))); }
  if (query.search) {
    const s = String(query.search);
    where.push(
      or(
        like(tasks.name, `%${s}%`),
        like(tasks.assetName, `%${s}%`),
        like(tasks.assetCode, `%${s}%`),
      ) as any,
    );
  }
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...where))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(tasks.createdAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(...where));
  const total = Number(totalRows[0]?.count ?? 0);
  return { data: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export async function getExternalAssessment(organizationId: string, taskId: string) {
  return loadAssessmentDetail(organizationId, taskId);
}

export async function createExternalAssessment(
  organizationId: string,
  actorUserId: string | null,
  input: z.infer<typeof externalCreateAssessmentSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { tasks, plans, assets } = scanTables();
  let assetName = input.assetName || null;
  let assetCode = input.assetCode || null;
  let assetVersion = input.assetVersion || null;
  let assetSnapshotId = input.assetSnapshotId || null;
  let componentVersions = input.componentVersions || [];
  if (input.assetId) {
    const [asset] = await db
      .select({ name: assets.name, assetCode: assets.assetCode, version: assets.version })
      .from(assets)
      .where(and(eq(assets.organizationId, organizationId), eq(assets.id, input.assetId)))
      .limit(1);
    assetName = assetName || asset?.name || null;
    assetCode = assetCode || asset?.assetCode || null;
    assetVersion = assetVersion || asset?.version || null;
    const versionContext = await loadAssetVersionContext(organizationId, input.assetId);
    assetSnapshotId = assetSnapshotId || versionContext.assetSnapshotId;
    componentVersions = componentVersions.length
      ? componentVersions
      : versionContext.componentVersions;
  }
  const taskId = uuidv4();
  const metadata: Record<string, unknown> = { ...(input.metadata || {}), source: 'external_api' };
  if (input.templateId) { metadata.templateId = input.templateId; }
  await db.insert(tasks).values({
    id: taskId,
    organizationId,
    assetId: input.assetId || null,
    assetCode,
    assetName,
    assetVersion,
    assetSnapshotId,
    componentVersions,
    name: input.name,
    source: input.source || 'external_api',
    scanType: input.scanType || 'security_baseline',
    targetKind: input.targetKind || 'agent',
    targetSummary: input.targetSummary || null,
    status: 'pending',
    progress: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    ownerName: input.ownerName || null,
    runConfig: input.runConfig || {},
    metadata,
    createdBy: userId,
    updatedBy: userId,
  });
  if (input.plans?.length) {
    await db.insert(plans).values(
      input.plans.map((plan) => ({
        id: uuidv4(),
        organizationId,
        taskId,
        probeType: plan.probeType,
        strategy: plan.strategy,
        enabled: plan.enabled ?? true,
        libIds: plan.libIds || [],
        caseCount: plan.caseCount ?? 0,
        targets: plan.targets || [],
        status: plan.status || 'pending',
        metadata: plan.metadata || {},
      })),
    );
  }
  let detail = await loadAssessmentDetail(organizationId, taskId);
  if (input.start && detail) {
    detail = (await executeExternalAssessment(organizationId, actorUserId, taskId, {
      mode: 'manual',
      generateFindings: true,
    })) as typeof detail;
  }
  return detail;
}

export async function executeExternalAssessment(
  organizationId: string,
  actorUserId: string | null,
  taskId: string,
  input: z.infer<typeof externalExecuteAssessmentSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const task = await loadAssessmentDetail(organizationId, taskId);
  if (!task) {
    const err = new Error('Scan task not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  if (isPatrolPlanTask(task)) {
    return executePatrolPlanAsRun(organizationId, taskId, input, userId);
  }
  return executeSecurityScanTask(organizationId, taskId, input, userId);
}

export async function listExternalFindings(organizationId: string, query: Record<string, unknown>) {
  const { scanFindings } = scanTables();
  const { limit, offset } = parseLimitOffset(query);
  const where = [eq(scanFindings.organizationId, organizationId)];
  if (query.taskId) { where.push(eq(scanFindings.taskId, String(query.taskId))); }
  if (query.status) { where.push(eq(scanFindings.status, String(query.status))); }
  if (query.riskLevel) { where.push(eq(scanFindings.riskLevel, String(query.riskLevel))); }
  const rows = await db
    .select()
    .from(scanFindings)
    .where(and(...where))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(scanFindings.detectedAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(scanFindings)
    .where(and(...where));
  const total = Number(totalRows[0]?.count ?? 0);
  return { data: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export async function loadExternalRemediationDetail(organizationId: string, remediationId: string) {
  const { remediationTasks, scanFindings, remediationEvidence, retestRecords } = scanTables();
  const [task] = await db
    .select()
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.organizationId, organizationId),
        eq(remediationTasks.id, remediationId),
      ),
    )
    .limit(1);
  if (!task) { return null; }
  const [finding] = await db
    .select()
    .from(scanFindings)
    .where(
      and(eq(scanFindings.organizationId, organizationId), eq(scanFindings.id, task.findingId)),
    )
    .limit(1);
  const [evidenceRows, retestRows] = await Promise.all([
    db
      .select()
      .from(remediationEvidence)
      .where(
        and(
          eq(remediationEvidence.organizationId, organizationId),
          eq(remediationEvidence.remediationTaskId, remediationId),
        ),
      )
      .orderBy(desc(remediationEvidence.submittedAt)),
    db
      .select()
      .from(retestRecords)
      .where(
        and(
          eq(retestRecords.organizationId, organizationId),
          eq(retestRecords.remediationTaskId, remediationId),
        ),
      )
      .orderBy(desc(retestRecords.createdAt)),
  ]);
  return { ...task, finding, evidence: evidenceRows, retests: retestRows };
}

export async function listExternalRemediations(
  organizationId: string,
  query: Record<string, unknown>,
) {
  const { remediationTasks } = scanTables();
  const { limit, offset } = parseLimitOffset(query);
  const where = [eq(remediationTasks.organizationId, organizationId)];
  if (query.taskId) { where.push(eq(remediationTasks.taskId, String(query.taskId))); }
  if (query.status) { where.push(eq(remediationTasks.status, String(query.status))); }
  if (query.riskLevel) { where.push(eq(remediationTasks.riskLevel, String(query.riskLevel))); }
  const rows = await db
    .select()
    .from(remediationTasks)
    .where(and(...where))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(remediationTasks.updatedAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(remediationTasks)
    .where(and(...where));
  const total = Number(totalRows[0]?.count ?? 0);
  return { data: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export async function updateExternalRemediation(
  organizationId: string,
  actorUserId: string | null,
  remediationId: string,
  input: z.infer<typeof externalRemediationUpdateSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { remediationTasks, scanFindings } = scanTables();
  const current = await loadExternalRemediationDetail(organizationId, remediationId);
  if (!current) { return null; }
  const updateData: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  for (const key of [
    'status',
    'ownerName',
    'ownerId',
    'evidenceSummary',
    'retestStatus',
    'finalDecision',
  ] as const) {
    if (key in input) { updateData[key] = (input as any)[key] ?? null; }
  }
  if ('dueAt' in input) { updateData.dueAt = input.dueAt ? new Date(input.dueAt) : null; }
  if (input.metadata && typeof input.metadata === 'object') {
    const currentMeta =
      current.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, unknown>)
        : {};
    updateData.metadata = { ...currentMeta, ...input.metadata };
  }
  if (
    input.status === 'closed' ||
    input.finalDecision === 'closed' ||
    input.status === 'risk_accepted'
  ) {
    updateData.closedAt = new Date();
  }
  await db
    .update(remediationTasks)
    .set(updateData)
    .where(
      and(
        eq(remediationTasks.organizationId, organizationId),
        eq(remediationTasks.id, remediationId),
      ),
    );
  if (input.finalDecision === 'closed' || input.status === 'closed') {
    await db
      .update(scanFindings)
      .set({ status: 'fixed', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(scanFindings.id, current.findingId));
  } else if (input.status === 'risk_accepted' || input.finalDecision === 'risk_accepted') {
    await db
      .update(scanFindings)
      .set({
        status: 'accepted',
        acceptedReason: input.acceptedReason || null,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(scanFindings.id, current.findingId));
  } else if (input.status === 'reopened' || input.finalDecision === 'rework') {
    await db
      .update(scanFindings)
      .set({ status: 'open', closedAt: null, updatedAt: new Date() })
      .where(eq(scanFindings.id, current.findingId));
  }
  return loadExternalRemediationDetail(organizationId, remediationId);
}

export async function submitExternalRemediationEvidence(
  organizationId: string,
  actorUserId: string | null,
  remediationId: string,
  input: z.infer<typeof externalEvidenceSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { remediationEvidence, remediationTasks } = scanTables();
  const current = await loadExternalRemediationDetail(organizationId, remediationId);
  if (!current) { return null; }
  await db.insert(remediationEvidence).values({
    id: uuidv4(),
    organizationId,
    remediationTaskId: remediationId,
    evidenceType: input.evidenceType || 'text',
    title: input.title,
    content: input.content,
    attachments: input.attachments || [],
    submittedBy: userId,
  });
  await db
    .update(remediationTasks)
    .set({
      status: 'evidence_submitted',
      evidenceSummary: input.title,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(remediationTasks.id, remediationId));
  return loadExternalRemediationDetail(organizationId, remediationId);
}

export async function retestExternalRemediation(
  organizationId: string,
  actorUserId: string | null,
  remediationId: string,
  input: z.infer<typeof externalRetestSchema>,
) {
  const userId = await resolveActorId(actorUserId);
  const { retestRecords, remediationTasks, scanFindings } = scanTables();
  const current = await loadExternalRemediationDetail(organizationId, remediationId);
  if (!current) { return null; }
  const result = input.result || 'passed';
  const versionContext = await loadAssetVersionContext(organizationId, current.assetId);
  const retestAssetVersion =
    input.retestAssetVersion ||
    current.targetAssetVersion ||
    versionContext.assetVersion ||
    current.sourceAssetVersion ||
    null;
  const retestSnapshotId =
    input.retestSnapshotId ||
    current.targetSnapshotId ||
    versionContext.assetSnapshotId ||
    current.sourceSnapshotId ||
    null;
  await db.insert(retestRecords).values({
    id: uuidv4(),
    organizationId,
    remediationTaskId: remediationId,
    findingId: current.findingId,
    retestTaskId: input.retestTaskId ?? null,
    retestAssetVersion,
    retestSnapshotId,
    result,
    conclusion:
      input.conclusion ||
      (result === 'passed' ? '复测通过，风险已消除。' : '复测未通过，需要重新整改。'),
    evidence: input.evidence || {},
    createdBy: userId,
  });
  await db
    .update(remediationTasks)
    .set({
      status: result === 'passed' ? 'closed' : 'reopened',
      retestStatus: result,
      finalDecision: result === 'passed' ? 'closed' : 'rework',
      targetAssetVersion: retestAssetVersion,
      targetSnapshotId: retestSnapshotId,
      closedAt: result === 'passed' ? new Date() : null,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(remediationTasks.id, remediationId));
  await db
    .update(scanFindings)
    .set({
      status: result === 'passed' ? 'fixed' : 'open',
      closedAt: result === 'passed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(scanFindings.id, current.findingId));
  return loadExternalRemediationDetail(organizationId, remediationId);
}

const PASSED_ADMISSION = new Set(['passed', 'conditional_passed']);
const CLOSED_REMEDIATION = new Set(['closed', 'risk_accepted']);

export type WorkbenchTodoItem = {
  id: string;
  kind: 'intake' | 'admission' | 'remediation';
  title: string;
  subject: string;
  nextStep: string;
  priority: 'urgent' | 'watch' | 'normal';
  updatedAt?: string | null;
  refs?: Record<string, string | null | undefined>;
};

export async function listExternalWorkbenchTodos(organizationId: string) {
  const { agentAssets, discovered } = assetTables();
  const { remediationTasks } = scanTables();

  const [agents, pendingDiscovered, remediations, discoveredTotalRows] = await Promise.all([
    db
      .select({
        id: agentAssets.id,
        name: agentAssets.name,
        assetCode: agentAssets.assetCode,
        admissionStatus: agentAssets.admissionStatus,
        updatedAt: agentAssets.updatedAt,
      })
      .from(agentAssets)
      .where(and(eq(agentAssets.organizationId, organizationId), isNull(agentAssets.deletedAt)))
      .limit(300),
    db
      .select()
      .from(discovered)
      .where(
        and(eq(discovered.organizationId, organizationId), eq(discovered.claimStatus, 'pending')),
      )
      .orderBy(desc(discovered.discoveredAt))
      .limit(50),
    db
      .select()
      .from(remediationTasks)
      .where(eq(remediationTasks.organizationId, organizationId))
      .orderBy(desc(remediationTasks.updatedAt))
      .limit(300),
    db
      .select({ count: sql<number>`count(*)` })
      .from(discovered)
      .where(
        and(eq(discovered.organizationId, organizationId), eq(discovered.claimStatus, 'pending')),
      ),
  ]);

  const items: WorkbenchTodoItem[] = [];

  for (const row of remediations) {
    if (CLOSED_REMEDIATION.has(String(row.status))) { continue; }
    const risk = String(row.riskLevel || 'medium').toLowerCase();
    const urgent = risk === 'critical' || risk === 'high' || row.status === 'reopened';
    items.push({
      id: `rem-${row.id}`,
      kind: 'remediation',
      title: String(row.title || '风险整改'),
      subject: String(row.assetId || row.taskId || ''),
      nextStep:
        row.status === 'evidence_submitted'
          ? '安排复测'
          : row.status === 'open' || row.status === 'assigned'
            ? '推进整改'
            : '更新整改状态',
      priority: urgent ? 'urgent' : 'watch',
      updatedAt: row.updatedAt ? new Date(row.updatedAt as Date).toISOString() : null,
      refs: { riskId: row.id, assetId: row.assetId, taskId: row.taskId },
    });
  }

  for (const a of agents) {
    if (PASSED_ADMISSION.has(String(a.admissionStatus))) { continue; }
    const blocked = a.admissionStatus === 'failed' || a.admissionStatus === 'blocked';
    items.push({
      id: `adm-${a.id}`,
      kind: 'admission',
      title: `准入：${a.name}`,
      subject: String(a.assetCode || a.name),
      nextStep: '完成准入检查',
      priority: blocked ? 'urgent' : 'normal',
      updatedAt: a.updatedAt ? new Date(a.updatedAt as Date).toISOString() : null,
      refs: { assetId: a.id },
    });
  }

  for (const d of pendingDiscovered) {
    items.push({
      id: `intake-${d.id}`,
      kind: 'intake',
      title: `待认领：${d.rawName || d.externalId}`,
      subject: String(d.platformFamily || ''),
      nextStep: '认领并纳管资产',
      priority: 'normal',
      updatedAt: d.discoveredAt ? new Date(d.discoveredAt as Date).toISOString() : null,
      refs: { discoveredId: d.id },
    });
  }

  const pendingTotal = Number(discoveredTotalRows[0]?.count ?? 0);
  if (pendingTotal > pendingDiscovered.length) {
    items.push({
      id: 'intake-more',
      kind: 'intake',
      title: `另有 ${pendingTotal - pendingDiscovered.length} 条待认领资产`,
      subject: '',
      nextStep: '查看发现列表',
      priority: 'watch',
      refs: {},
    });
  }

  const priorityRank = { urgent: 0, watch: 1, normal: 2 } as const;
  items.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const urgentCount = items.filter((i) => i.priority === 'urgent').length;
  return { items, total: items.length, urgentCount };
}
