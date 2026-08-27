import crypto from 'node:crypto';
import express from 'express';
import { and, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db, getDbType } from '../../../../database';
import logger from '../../../../logger';
import { createTargetAgentClient } from '../../../agents/factory';
import type {
  TargetAgentClientContext,
  TargetAgentRecord,
  TargetAgentType,
} from '../../../agents/types';

const router = express.Router();

function tables() {
  const module =
    getDbType() === 'mysql'
      ? require('../../../../database/tables-mysql')
      : require('../../../../database/tables-enterprise');
  return {
    agentAssets: module.agentAssetsTable,
    ownerships: module.assetOwnershipsTable,
    components: module.agentAssetComponentsTable,
    snapshots: module.agentAssetSnapshotsTable,
    lifecycleEvents: module.assetLifecycleEventsTable,
    connectors: module.platformConnectorsTable,
    discovered: module.platformDiscoveredAssetsTable,
    ingestJobs: module.assetIngestJobsTable,
    targetAgents: module.targetAgentsTable,
    users: module.usersTable,
  };
}

function userContext(req: express.Request) {
  return (
    req as express.Request & { user?: { id?: string; userId?: string; organizationId?: string } }
  ).user;
}

function requireOrganizationId(req: express.Request, res: express.Response): string | null {
  const organizationId = userContext(req)?.organizationId;
  if (!organizationId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
    return null;
  }
  return organizationId;
}

function actorId(req: express.Request): string | null {
  return userContext(req)?.id || userContext(req)?.userId || null;
}

async function resolveActorId(req: express.Request): Promise<string | null> {
  const id = actorId(req);
  if (!id) {
    return null;
  }
  const { users } = tables();
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    return user?.id || null;
  } catch (error) {
    logger.warn('Failed to resolve asset actor id; storing null actor:', error);
    return null;
  }
}

const componentSchema = z.object({
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

const ownerSchema = z.object({
  id: z.string().optional(),
  ownerType: z.enum(['business', 'developer', 'security', 'ops']),
  userId: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

const assetBaseSchema = z.object({
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
  owners: z.array(ownerSchema).optional(),
  components: z.array(componentSchema).optional(),
});

const createAssetSchema = assetBaseSchema;
const updateAssetSchema = assetBaseSchema.partial().extend({
  name: z.string().min(1).optional(),
  functionIntro: z.string().min(1).optional(),
});

const connectorSchema = z.object({
  platformFamily: z.string().min(1),
  name: z.string().min(1),
  endpoint: z.string().optional().nullable(),
  credentialRef: z.string().optional().nullable(),
  syncConfig: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'disabled', 'error']).optional(),
});

const governanceStageSchema = z.enum([
  'asset_intake',
  'component_identification',
  'component_detection',
  'agent_detection',
  'risk_assessment',
  'remediation',
  'retest',
  'report_audit',
  'launch_monitoring',
]);

const advanceWorkflowSchema = z.object({
  stage: governanceStageSchema,
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  note: z.string().optional(),
});

const probeRuntimeSchema = z.object({
  type: z.enum([
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
  ]),
  name: z.string().optional(),
  config: z.record(z.unknown()),
});

function contentHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveRuntimeAgentType(
  platformFamily: string | null | undefined,
  config: Record<string, unknown>,
): TargetAgentType {
  const fromConfig = String(config.agentType || config.protocol || '').trim();
  if (
    [
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
    ].includes(fromConfig)
  ) {
    return fromConfig as TargetAgentType;
  }

  const normalized = String(platformFamily || '').toLowerCase();
  if (normalized.includes('dify')) {
    return 'dify';
  }
  if (normalized.includes('coze')) {
    return 'coze';
  }
  if (normalized.includes('n8n')) {
    return 'n8n';
  }
  if (normalized.includes('fastgpt')) {
    return 'fastgpt';
  }
  if (normalized.includes('tencent') || normalized.includes('adp') || normalized.includes('腾讯')) {
    return 'tencent-adp';
  }
  return 'api';
}

function hasRunnableRuntimeConfig(type: TargetAgentType, config: Record<string, unknown>): boolean {
  if (config.enabled === false) {
    return false;
  }
  if (type === 'tencent-adp') {
    return Boolean(String(config.apiKey || '').trim() && String(config.userId || '').trim());
  }
  if (type === 'n8n') {
    return Boolean(String(config.webhookUrl || config.apiBaseUrl || '').trim());
  }
  return Boolean(
    String(config.apiBaseUrl || '').trim() ||
      String(config.webhookUrl || '').trim() ||
      String(config.botId || '').trim() ||
      String(config.connectorId || '').trim(),
  );
}

async function syncRuntimeTargetAgent(params: {
  organizationId: string;
  assetId: string;
  assetName: string;
  assetDescription?: string | null;
  platformFamily?: string | null;
  existingAgentId?: string | null;
  metadata: Record<string, unknown>;
}): Promise<string | null> {
  const runtimeConfig = jsonObject(params.metadata.runtimeConfig);
  const type = resolveRuntimeAgentType(params.platformFamily, runtimeConfig);
  if (!hasRunnableRuntimeConfig(type, runtimeConfig)) {
    return null;
  }

  const { targetAgents } = tables();
  if (!targetAgents) {
    return null;
  }

  const candidateIds = [
    params.existingAgentId,
    params.metadata.targetAgentId,
    params.metadata.agentId,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());

  let existing: { id: string } | undefined;
  for (const id of candidateIds) {
    const [row] = await db
      .select({ id: targetAgents.id })
      .from(targetAgents)
      .where(and(eq(targetAgents.id, id), eq(targetAgents.organizationId, params.organizationId)))
      .limit(1);
    if (row) {
      existing = row;
      break;
    }
  }

  if (!existing) {
    const [row] = await db
      .select({ id: targetAgents.id })
      .from(targetAgents)
      .where(
        and(
          eq(targetAgents.organizationId, params.organizationId),
          eq(targetAgents.name, params.assetName),
          eq(targetAgents.type, type),
        ),
      )
      .limit(1);
    existing = row;
  }

  const metadata = {
    source: 'asset_intake_runtime_config',
    assetId: params.assetId,
    syncedAt: new Date().toISOString(),
  };
  const values = {
    name: params.assetName,
    description: params.assetDescription || `${params.assetName} 资产登记同步的可测试 Agent`,
    type,
    icon: type === 'tencent-adp' ? 'Bot' : 'Monitor',
    config: runtimeConfig,
    metadata,
    status: 'active',
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(targetAgents)
      .set(values)
      .where(
        and(
          eq(targetAgents.id, existing.id),
          eq(targetAgents.organizationId, params.organizationId),
        ),
      );
    return existing.id;
  }

  const agentId = uuidv4();
  await db.insert(targetAgents).values({
    id: agentId,
    organizationId: params.organizationId,
    teamId: null,
    ...values,
    healthStatus: null,
    statistics: {
      totalAttacks: 0,
      successfulAttacks: 0,
      vulnerabilitiesFound: 0,
    },
    createdAt: new Date(),
  });
  return agentId;
}

async function nextAssetCode(organizationId: string): Promise<string> {
  const { agentAssets } = tables();
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentAssets)
    .where(eq(agentAssets.organizationId, organizationId));
  const next = Number(countRows[0]?.count ?? 0) + 1001;
  return `AGT-${String(next).padStart(4, '0')}`;
}

async function createSnapshot(
  asset: any,
  snapshotType: string,
  userId: string | null,
  extra: Record<string, unknown> = {},
) {
  const { snapshots } = tables();
  const { snapshots: _snapshots, events: _events, ...snapshotAsset } = asset || {};
  const snapshotJson = { asset: snapshotAsset, ...extra };
  await db.insert(snapshots).values({
    id: uuidv4(),
    organizationId: asset.organizationId,
    assetId: asset.id,
    snapshotType,
    version: asset.version || 'v0.1.0',
    contentHash: contentHash(snapshotJson),
    snapshotJson,
    createdBy: userId,
  });
}

async function recordEvent(params: {
  organizationId: string;
  assetId: string;
  eventType: string;
  actorId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  detail?: Record<string, unknown>;
}) {
  const { lifecycleEvents } = tables();
  const values = {
    id: uuidv4(),
    organizationId: params.organizationId,
    assetId: params.assetId,
    eventType: params.eventType,
    fromStatus: params.fromStatus || null,
    toStatus: params.toStatus || null,
    actorId: params.actorId,
    eventDetail: params.detail || {},
  };
  try {
    await db.insert(lifecycleEvents).values(values);
  } catch (error) {
    if (!params.actorId) {
      logger.warn('Failed to record asset lifecycle event:', error);
      return;
    }
    try {
      await db.insert(lifecycleEvents).values({ ...values, id: uuidv4(), actorId: null });
    } catch (retryError) {
      logger.warn('Failed to record asset lifecycle event without actor:', retryError);
    }
  }
}

async function replaceChildren(
  organizationId: string,
  assetId: string,
  owners: z.infer<typeof ownerSchema>[] | undefined,
  components: z.infer<typeof componentSchema>[] | undefined,
) {
  const { ownerships, components: componentsTable } = tables();

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

async function loadAssetDetail(
  organizationId: string,
  assetId: string,
  options: { includeHistory?: boolean } = {},
) {
  const includeHistory = options.includeHistory ?? true;
  const { agentAssets, ownerships, components, snapshots, lifecycleEvents } = tables();
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

  const historyQueries = includeHistory
    ? [
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
      ]
    : [Promise.resolve([]), Promise.resolve([])];

  const [owners, componentRows, snapshotRows, events] = await Promise.all([
    db
      .select()
      .from(ownerships)
      .where(and(eq(ownerships.organizationId, organizationId), eq(ownerships.assetId, assetId))),
    db
      .select()
      .from(components)
      .where(and(eq(components.organizationId, organizationId), eq(components.assetId, assetId))),
    ...historyQueries,
  ]);

  return { ...asset, owners, components: componentRows, snapshots: snapshotRows, events };
}

router.get('/agents', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const { agentAssets, components, ownerships } = tables();
    const {
      limit = 20,
      offset = 0,
      search,
      platformFamily,
      department,
      environment,
      runtimeStatus,
      admissionStatus,
      riskLevel,
      exposureLevel,
      sensitiveData,
    } = req.query;

    const whereConditions = [
      eq(agentAssets.organizationId, organizationId),
      isNull(agentAssets.deletedAt),
    ];
    if (search) {
      whereConditions.push(
        or(
          like(agentAssets.name, `%${search}%`),
          like(agentAssets.assetCode, `%${search}%`),
          like(agentAssets.businessSystem, `%${search}%`),
        ),
      );
    }
    if (platformFamily) {
      whereConditions.push(eq(agentAssets.platformFamily, platformFamily as string));
    }
    if (environment) {
      whereConditions.push(eq(agentAssets.environment, environment as string));
    }
    if (runtimeStatus) {
      whereConditions.push(eq(agentAssets.runtimeStatus, runtimeStatus as string));
    }
    if (admissionStatus) {
      whereConditions.push(eq(agentAssets.admissionStatus, admissionStatus as string));
    }
    if (riskLevel) {
      whereConditions.push(eq(agentAssets.riskLevel, riskLevel as string));
    }
    if (exposureLevel) {
      whereConditions.push(eq(agentAssets.exposureLevel, exposureLevel as string));
    }
    if (sensitiveData === 'true' || sensitiveData === 'false') {
      whereConditions.push(eq(agentAssets.sensitiveData, sensitiveData === 'true'));
    }

    const assets = await db
      .select()
      .from(agentAssets)
      .where(and(...whereConditions))
      .limit(Number(limit))
      .offset(Number(offset))
      .orderBy(desc(agentAssets.updatedAt));

    const totalRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentAssets)
      .where(and(...whereConditions));

    const assetIds = assets.map((asset: any) => asset.id);
    let componentRows: any[] = [];
    let ownerRows: any[] = [];
    if (assetIds.length > 0) {
      componentRows = await db
        .select()
        .from(components)
        .where(inArray(components.assetId, assetIds));
      ownerRows = await db.select().from(ownerships).where(inArray(ownerships.assetId, assetIds));
    }

    const departmentFilter = typeof department === 'string' && department ? department : null;
    const enriched = assets
      .map((asset: any) => ({
        ...asset,
        components: componentRows.filter((component) => component.assetId === asset.id),
        owners: ownerRows.filter((owner) => owner.assetId === asset.id),
      }))
      .filter((asset) => {
        if (!departmentFilter) {
          return true;
        }
        return asset.owners.some((owner: any) => owner.department === departmentFilter);
      });

    const total = Number(totalRows[0]?.count ?? 0);
    res.json({
      success: true,
      data: {
        data: enriched,
        total: departmentFilter ? enriched.length : total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + enriched.length < total,
      },
    });
  } catch (error) {
    logger.error('Failed to list asset agents:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to list asset agents' } });
  }
});

router.post('/agents', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const userId = await resolveActorId(req);
    const input = createAssetSchema.parse(req.body);
    const { agentAssets } = tables();

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
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_ASSET_NAME', message: 'Agent name already exists' },
      });
    }

    const assetId = uuidv4();
    const assetCode = input.assetCode || (await nextAssetCode(organizationId));
    const inputMetadata = jsonObject(input.metadata);
    const syncedAgentId = await syncRuntimeTargetAgent({
      organizationId,
      assetId,
      assetName: input.name,
      assetDescription: input.functionIntro,
      platformFamily: input.platformFamily,
      existingAgentId: input.legacyId || null,
      metadata: inputMetadata,
    });
    const metadata = syncedAgentId
      ? { ...inputMetadata, targetAgentId: syncedAgentId, agentId: syncedAgentId }
      : inputMetadata;
    await db.insert(agentAssets).values({
      id: assetId,
      organizationId,
      teamId: input.teamId || null,
      legacyId: syncedAgentId || input.legacyId || null,
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
      metadata,
      createdBy: userId,
      updatedBy: userId,
    });
    await replaceChildren(organizationId, assetId, input.owners || [], input.components || []);
    const detail = await loadAssetDetail(organizationId, assetId);
    await createSnapshot(detail, 'created', userId);
    await recordEvent({
      organizationId,
      assetId,
      eventType: 'created',
      actorId: userId,
      toStatus: 'registered',
      detail: { sourceType: input.sourceType || 'manual' },
    });

    res.status(201).json({ success: true, data: await loadAssetDetail(organizationId, assetId) });
  } catch (error: any) {
    logger.error('Failed to create asset agent:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to create asset agent' } });
  }
});

router.post('/agents/probe-runtime', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }

    const input = probeRuntimeSchema.parse(req.body);
    const clientContext: TargetAgentClientContext = { organizationId };
    const transientAgent: TargetAgentRecord = {
      id: 'asset-runtime-probe',
      name: input.name || 'Asset runtime probe',
      type: input.type as TargetAgentType,
      config: input.config,
      metadata: { source: 'asset_intake_probe' },
    };
    const result = await createTargetAgentClient(transientAgent, clientContext).testConnection();

    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Failed to probe asset agent runtime:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to probe runtime' } });
  }
});

router.get('/agents/:id', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const detail = await loadAssetDetail(organizationId, req.params.id);
  if (!detail) {
    return res.status(404).json({ success: false, error: { message: 'Asset not found' } });
  }
  res.json({ success: true, data: detail });
});

router.patch('/agents/:id/workflow', async (req, res) => {
  let failedStep = 'unknown';
  try {
    failedStep = 'auth';
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const userId = await resolveActorId(req);
    failedStep = 'validate';
    const input = advanceWorkflowSchema.parse(req.body);
    const { agentAssets } = tables();
    failedStep = 'load_asset';
    const current = await loadAssetDetail(organizationId, req.params.id, { includeHistory: false });
    if (!current) {
      return res.status(404).json({ success: false, error: { message: 'Asset not found' } });
    }

    const currentMetadata = jsonObject(current.metadata);
    const workflow =
      (currentMetadata as any).governanceWorkflow &&
      typeof (currentMetadata as any).governanceWorkflow === 'object'
        ? (currentMetadata as any).governanceWorkflow
        : {};
    const stageHistory = Array.isArray(workflow.stageHistory) ? workflow.stageHistory : [];
    const nextWorkflow = {
      ...workflow,
      currentStage: input.stage,
      stageStatus: input.status || 'in_progress',
      updatedAt: new Date().toISOString(),
      note: input.note || workflow.note || '',
      stageHistory: [
        {
          stage: input.stage,
          status: input.status || 'in_progress',
          note: input.note || '',
          actorId: userId,
          at: new Date().toISOString(),
        },
        ...stageHistory,
      ].slice(0, 50),
    };

    failedStep = 'update_asset_metadata';
    await db
      .update(agentAssets)
      .set({
        metadata: { ...currentMetadata, governanceWorkflow: nextWorkflow },
        updatedAt: new Date(),
      })
      .where(
        and(eq(agentAssets.organizationId, organizationId), eq(agentAssets.id, req.params.id)),
      );

    failedStep = 'record_event';
    await recordEvent({
      organizationId,
      assetId: req.params.id,
      eventType: 'workflow_stage_changed',
      actorId: userId,
      detail: {
        stage: input.stage,
        status: input.status || 'in_progress',
        note: input.note || '',
      },
    });

    failedStep = 'reload_asset';
    const detail = await loadAssetDetail(organizationId, req.params.id).catch((error) => {
      logger.warn('Workflow advanced but failed to reload asset detail:', error);
      return null;
    });
    res.json({
      success: true,
      data: detail || {
        ...current,
        metadata: { ...currentMetadata, governanceWorkflow: nextWorkflow },
      },
    });
  } catch (error: any) {
    logger.error(`Failed to advance asset workflow at ${failedStep}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to advance workflow',
        step: failedStep,
        detail: error?.message || String(error),
      },
    });
  }
});

router.patch('/agents/:id', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const userId = await resolveActorId(req);
    const input = updateAssetSchema.parse(req.body);
    const { agentAssets } = tables();
    const inputKeys = Object.keys(input);
    const isQuickStatusUpdate =
      inputKeys.length > 0 &&
      inputKeys.every((key) => ['riskLevel', 'admissionStatus', 'runtimeStatus'].includes(key));
    const [currentAsset] = isQuickStatusUpdate
      ? await db
          .select({
            id: agentAssets.id,
            organizationId: agentAssets.organizationId,
            lifecycleStatus: agentAssets.lifecycleStatus,
            riskLevel: agentAssets.riskLevel,
            admissionStatus: agentAssets.admissionStatus,
            runtimeStatus: agentAssets.runtimeStatus,
          })
          .from(agentAssets)
          .where(
            and(
              eq(agentAssets.organizationId, organizationId),
              eq(agentAssets.id, req.params.id),
              isNull(agentAssets.deletedAt),
            ),
          )
          .limit(1)
      : [null];
    const current =
      currentAsset ||
      (await loadAssetDetail(organizationId, req.params.id, { includeHistory: false }));
    if (!current) {
      return res.status(404).json({ success: false, error: { message: 'Asset not found' } });
    }

    const updateData: Record<string, unknown> = {
      updatedBy: userId,
      updatedAt: new Date(),
    };
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
    if (!isQuickStatusUpdate) {
      const nextMetadata =
        'metadata' in input ? jsonObject(input.metadata) : jsonObject((current as any).metadata);
      const syncedAgentId = await syncRuntimeTargetAgent({
        organizationId,
        assetId: req.params.id,
        assetName: 'name' in input ? String(input.name || '') : String((current as any).name || ''),
        assetDescription:
          'functionIntro' in input
            ? String(input.functionIntro || '')
            : String((current as any).functionIntro || ''),
        platformFamily:
          'platformFamily' in input
            ? String(input.platformFamily || '')
            : String((current as any).platformFamily || ''),
        existingAgentId:
          ('legacyId' in input
            ? String(input.legacyId || '')
            : String((current as any).legacyId || '')) ||
          String((nextMetadata.targetAgentId as string | undefined) || '') ||
          null,
        metadata: nextMetadata,
      });
      if (syncedAgentId) {
        updateData.legacyId = syncedAgentId;
        updateData.metadata = {
          ...nextMetadata,
          targetAgentId: syncedAgentId,
          agentId: syncedAgentId,
        };
      }
    }
    await db
      .update(agentAssets)
      .set(updateData)
      .where(
        and(eq(agentAssets.organizationId, organizationId), eq(agentAssets.id, req.params.id)),
      );
    if (isQuickStatusUpdate) {
      const detail = {
        id: current.id,
        organizationId,
        riskLevel: 'riskLevel' in input ? input.riskLevel : current.riskLevel,
        admissionStatus:
          'admissionStatus' in input ? input.admissionStatus : current.admissionStatus,
        runtimeStatus: 'runtimeStatus' in input ? input.runtimeStatus : current.runtimeStatus,
        lifecycleStatus: current.lifecycleStatus,
        updatedAt: updateData.updatedAt,
      };
      await recordEvent({
        organizationId,
        assetId: req.params.id,
        eventType:
          current.lifecycleStatus !== detail.lifecycleStatus ? 'status_changed' : 'updated',
        actorId: userId,
        fromStatus: current.lifecycleStatus,
        toStatus: detail.lifecycleStatus,
        detail: { changedFields: Object.keys(updateData) },
      });
      return res.json({ success: true, data: detail });
    }
    await replaceChildren(organizationId, req.params.id, input.owners, input.components);

    const detail = await loadAssetDetail(organizationId, req.params.id, { includeHistory: false });
    await createSnapshot(detail, 'manual_update', userId);
    await recordEvent({
      organizationId,
      assetId: req.params.id,
      eventType: current.lifecycleStatus !== detail?.lifecycleStatus ? 'status_changed' : 'updated',
      actorId: userId,
      fromStatus: current.lifecycleStatus,
      toStatus: detail?.lifecycleStatus,
      detail: { changedFields: Object.keys(updateData) },
    });
    res.json({ success: true, data: detail });
  } catch (error: any) {
    logger.error('Failed to update asset agent:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to update asset agent' } });
  }
});

router.delete('/agents/:id', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const userId = await resolveActorId(req);
  const { agentAssets } = tables();
  const current = await loadAssetDetail(organizationId, req.params.id);
  if (!current) {
    return res.status(404).json({ success: false, error: { message: 'Asset not found' } });
  }
  await db
    .update(agentAssets)
    .set({ deletedAt: new Date(), lifecycleStatus: 'archived', updatedBy: userId })
    .where(eq(agentAssets.id, req.params.id));
  await recordEvent({
    organizationId,
    assetId: req.params.id,
    eventType: 'archived',
    actorId: userId,
    fromStatus: current.lifecycleStatus,
    toStatus: 'archived',
  });
  res.json({ success: true, data: { message: 'Asset archived' } });
});

router.post('/agents/:id/snapshots', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const detail = await loadAssetDetail(organizationId, req.params.id);
  if (!detail) {
    return res.status(404).json({ success: false, error: { message: 'Asset not found' } });
  }
  await createSnapshot(detail, 'manual_update', await resolveActorId(req));
  res.status(201).json({ success: true, data: { message: 'Snapshot created' } });
});

router.get('/agents/:id/events', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { lifecycleEvents } = tables();
  const events = await db
    .select()
    .from(lifecycleEvents)
    .where(
      and(
        eq(lifecycleEvents.organizationId, organizationId),
        eq(lifecycleEvents.assetId, req.params.id),
      ),
    )
    .orderBy(desc(lifecycleEvents.createdAt));
  res.json({ success: true, data: events });
});

router.get('/agents/:id/components', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { components } = tables();
  const rows = await db
    .select()
    .from(components)
    .where(
      and(eq(components.organizationId, organizationId), eq(components.assetId, req.params.id)),
    );
  res.json({ success: true, data: rows });
});

router.put('/agents/:id/components', async (req, res) => {
  try {
    const organizationId = requireOrganizationId(req, res);
    if (!organizationId) {
      return;
    }
    const components = z.array(componentSchema).parse(req.body.components || req.body);
    await replaceChildren(organizationId, req.params.id, undefined, components);
    await recordEvent({
      organizationId,
      assetId: req.params.id,
      eventType: 'component_changed',
      actorId: await resolveActorId(req),
      detail: { count: components.length },
    });
    res.json({ success: true, data: await loadAssetDetail(organizationId, req.params.id) });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: { message: error.message } });
    }
    res.status(500).json({ success: false, error: { message: 'Failed to save components' } });
  }
});

router.post('/agents/:id/components', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const input = componentSchema.parse(req.body);
  const { components } = tables();
  const id = uuidv4();
  await db.insert(components).values({
    id,
    organizationId,
    assetId: req.params.id,
    componentType: input.componentType,
    componentName: input.componentName,
    componentKey: input.componentKey || null,
    version: input.version || null,
    sourceType: input.sourceType || 'manual',
    sourceRefId: input.sourceRefId || null,
    highRisk: input.highRisk ?? false,
    sensitiveLevel: input.sensitiveLevel || null,
    permissionScope: input.permissionScope || {},
    configSnapshot: input.configSnapshot || {},
    componentFingerprint: input.componentFingerprint || null,
    enabled: input.enabled ?? true,
  });
  res.status(201).json({
    success: true,
    data: (await loadAssetDetail(organizationId, req.params.id))?.components.find(
      (c: any) => c.id === id,
    ),
  });
});

router.patch('/agents/:id/components/:componentId', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const input = componentSchema.partial().parse(req.body);
  const { components } = tables();
  await db
    .update(components)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(eq(components.organizationId, organizationId), eq(components.id, req.params.componentId)),
    );
  res.json({ success: true, data: await loadAssetDetail(organizationId, req.params.id) });
});

router.delete('/agents/:id/components/:componentId', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { components } = tables();
  await db
    .delete(components)
    .where(
      and(eq(components.organizationId, organizationId), eq(components.id, req.params.componentId)),
    );
  res.json({ success: true, data: { message: 'Component deleted' } });
});

router.get('/discovered', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { discovered } = tables();
  const { limit = 20, offset = 0, claimStatus = 'pending', platformFamily } = req.query;
  const whereConditions = [eq(discovered.organizationId, organizationId)];
  if (claimStatus && claimStatus !== 'all') {
    whereConditions.push(eq(discovered.claimStatus, claimStatus as string));
  }
  if (platformFamily) {
    whereConditions.push(eq(discovered.platformFamily, platformFamily as string));
  }
  const rows = await db
    .select()
    .from(discovered)
    .where(and(...whereConditions))
    .limit(Number(limit))
    .offset(Number(offset))
    .orderBy(desc(discovered.discoveredAt));
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(discovered)
    .where(and(...whereConditions));
  const total = Number(totalRows[0]?.count ?? 0);
  res.json({
    success: true,
    data: {
      data: rows,
      total,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: Number(offset) + rows.length < total,
    },
  });
});

router.post('/discovered/:id/claim', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { discovered } = tables();
  const [record] = await db
    .select()
    .from(discovered)
    .where(and(eq(discovered.organizationId, organizationId), eq(discovered.id, req.params.id)))
    .limit(1);
  if (!record) {
    return res
      .status(404)
      .json({ success: false, error: { message: 'Discovered asset not found' } });
  }
  const body = createAssetSchema.partial().parse(req.body);
  const createReq = {
    name: body.name || record.rawName,
    agentType: body.agentType || 'qa',
    platformFamily: body.platformFamily || record.platformFamily,
    externalId: body.externalId || record.externalId,
    sourceType: 'platform_sync',
    environment: body.environment || 'test',
    runtimeStatus: body.runtimeStatus || 'not_launched',
    lifecycleStatus: 'registered',
    admissionStatus: 'not_checked',
    functionIntro: body.functionIntro || '平台同步发现资产，认领后待补充功能介绍。',
    exposureLevel: body.exposureLevel || 'internal',
    sensitiveData: body.sensitiveData ?? false,
    version: body.version || 'v0.1.0',
    metadata: { discoveredPayload: record.rawPayload, ...(body.metadata || {}) },
    owners: body.owners || [],
    components: body.components || [],
  };
  req.body = createReq;
  const assetId = uuidv4();
  const { agentAssets } = tables();
  await db.insert(agentAssets).values({
    id: assetId,
    organizationId,
    assetCode: await nextAssetCode(organizationId),
    name: createReq.name,
    agentType: createReq.agentType,
    platformFamily: createReq.platformFamily,
    externalId: createReq.externalId,
    sourceType: createReq.sourceType,
    environment: createReq.environment,
    runtimeStatus: createReq.runtimeStatus,
    lifecycleStatus: createReq.lifecycleStatus,
    admissionStatus: createReq.admissionStatus,
    functionIntro: createReq.functionIntro,
    riskLevel: 'normal',
    exposureLevel: createReq.exposureLevel,
    sensitiveData: createReq.sensitiveData,
    version: createReq.version,
    tags: [],
    metadata: createReq.metadata,
    createdBy: await resolveActorId(req),
    updatedBy: await resolveActorId(req),
  });
  await replaceChildren(organizationId, assetId, createReq.owners, createReq.components);
  await db
    .update(discovered)
    .set({ claimStatus: 'claimed', claimedAssetId: assetId, updatedAt: new Date() })
    .where(eq(discovered.id, req.params.id));
  await recordEvent({
    organizationId,
    assetId,
    eventType: 'claimed',
    actorId: await resolveActorId(req),
    toStatus: 'registered',
    detail: { discoveredAssetId: req.params.id },
  });
  res.status(201).json({ success: true, data: await loadAssetDetail(organizationId, assetId) });
});

router.post('/discovered/:id/ignore', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { discovered } = tables();
  await db
    .update(discovered)
    .set({ claimStatus: 'ignored', updatedAt: new Date() })
    .where(and(eq(discovered.organizationId, organizationId), eq(discovered.id, req.params.id)));
  res.json({ success: true, data: { message: 'Discovered asset ignored' } });
});

router.get('/connectors', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { connectors } = tables();
  const rows = await db
    .select()
    .from(connectors)
    .where(eq(connectors.organizationId, organizationId))
    .orderBy(desc(connectors.updatedAt));
  res.json({ success: true, data: rows });
});

router.post('/connectors', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const input = connectorSchema.parse(req.body);
  const { connectors } = tables();
  const id = uuidv4();
  await db.insert(connectors).values({
    id,
    organizationId,
    platformFamily: input.platformFamily,
    name: input.name,
    endpoint: input.endpoint || null,
    credentialRef: input.credentialRef || null,
    syncConfig: input.syncConfig || {},
    status: input.status || 'disabled',
  });
  const [connector] = await db.select().from(connectors).where(eq(connectors.id, id)).limit(1);
  res.status(201).json({ success: true, data: connector });
});

router.patch('/connectors/:id', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const input = connectorSchema.partial().parse(req.body);
  const { connectors } = tables();
  await db
    .update(connectors)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(connectors.organizationId, organizationId), eq(connectors.id, req.params.id)));
  const [connector] = await db
    .select()
    .from(connectors)
    .where(eq(connectors.id, req.params.id))
    .limit(1);
  res.json({ success: true, data: connector });
});

router.post('/connectors/:id/sync', async (req, res) => {
  const organizationId = requireOrganizationId(req, res);
  if (!organizationId) {
    return;
  }
  const { ingestJobs, connectors, discovered } = tables();
  const [connector] = await db
    .select()
    .from(connectors)
    .where(and(eq(connectors.organizationId, organizationId), eq(connectors.id, req.params.id)))
    .limit(1);
  if (!connector) {
    return res.status(404).json({ success: false, error: { message: 'Connector not found' } });
  }

  const jobId = uuidv4();
  await db.insert(ingestJobs).values({
    id: jobId,
    organizationId,
    jobType: 'platform_sync',
    sourceType: 'connector',
    status: 'running',
    inputJson: { connectorId: req.params.id },
    startedAt: new Date(),
    createdBy: await resolveActorId(req),
  });

  const syncConfig =
    connector.syncConfig &&
    typeof connector.syncConfig === 'object' &&
    !Array.isArray(connector.syncConfig)
      ? (connector.syncConfig as Record<string, unknown>)
      : {};
  const configuredAssets = Array.isArray(syncConfig.sampleAssets)
    ? (syncConfig.sampleAssets as Array<Record<string, unknown>>)
    : [];
  const assetsToDiscover =
    configuredAssets.length > 0
      ? configuredAssets
      : [
          {
            externalId: `${connector.platformFamily.toLowerCase()}-${req.params.id.slice(0, 8)}-agent-01`,
            name: `${connector.platformFamily} 客服助手`,
            status: 'active',
            team: '客户运营部',
          },
          {
            externalId: `${connector.platformFamily.toLowerCase()}-${req.params.id.slice(0, 8)}-agent-02`,
            name: `${connector.platformFamily} 知识库问答`,
            status: 'draft',
            team: '研发平台部',
          },
        ];

  let created = 0;
  let updated = 0;
  for (const item of assetsToDiscover) {
    const externalId = String(item.externalId || item.id || item.key || '').trim();
    const rawName = String(item.name || item.rawName || externalId || '未命名 Agent').trim();
    if (!externalId || !rawName) {
      continue;
    }

    const [existing] = await db
      .select()
      .from(discovered)
      .where(
        and(
          eq(discovered.organizationId, organizationId),
          eq(discovered.platformFamily, connector.platformFamily),
          eq(discovered.externalId, externalId),
        ),
      )
      .limit(1);

    const rawPayload = {
      ...item,
      connectorId: req.params.id,
      connectorName: connector.name,
      syncedAt: new Date().toISOString(),
    };
    if (existing) {
      await db
        .update(discovered)
        .set({
          connectorId: req.params.id,
          rawName,
          rawStatus: item.status ? String(item.status) : existing.rawStatus,
          guessTeam:
            item.team || item.guessTeam ? String(item.team || item.guessTeam) : existing.guessTeam,
          rawPayload,
          updatedAt: new Date(),
        })
        .where(eq(discovered.id, existing.id));
      updated += 1;
    } else {
      await db.insert(discovered).values({
        id: uuidv4(),
        organizationId,
        connectorId: req.params.id,
        platformFamily: connector.platformFamily,
        externalId,
        rawName,
        rawStatus: item.status ? String(item.status) : null,
        guessTeam: item.team || item.guessTeam ? String(item.team || item.guessTeam) : null,
        claimStatus: 'pending',
        rawPayload,
      });
      created += 1;
    }
  }

  await db
    .update(connectors)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(and(eq(connectors.organizationId, organizationId), eq(connectors.id, req.params.id)));
  await db
    .update(ingestJobs)
    .set({
      status: 'completed',
      totalCount: assetsToDiscover.length,
      successCount: created + updated,
      failedCount: Math.max(assetsToDiscover.length - created - updated, 0),
      resultJson: { created, updated },
      endedAt: new Date(),
    })
    .where(eq(ingestJobs.id, jobId));
  res.status(202).json({ success: true, data: { jobId, status: 'completed', created, updated } });
});

export default router;
