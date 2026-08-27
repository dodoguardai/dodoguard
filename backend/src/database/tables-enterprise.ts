import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ------------ Organizations & Users ------------

export const organizationsTable = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    icon: text('icon'), // Supports icon name or image URL/base64
    planId: uuid('plan_id'),
    subscriptionId: uuid('subscription_id'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index('organizations_slug_idx').on(table.slug),
    statusIdx: index('organizations_status_idx').on(table.status),
  }),
);

export const teamsTable = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    logo: text('logo'), // Supports icon name or image URL/base64
    description: text('description'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('teams_organization_id_idx').on(table.organizationId),
  }),
);

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    avatar: varchar('avatar', { length: 500 }),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    emailVerified: boolean('email_verified').notNull().default(false),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecret: varchar('mfa_secret', { length: 255 }),
    lastLoginAt: timestamp('last_login_at'),
    lastActivityAt: timestamp('last_activity_at'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    orgIdx: index('users_organization_id_idx').on(table.organizationId),
    statusIdx: index('users_status_idx').on(table.status),
  }),
);

export const rolesTable = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }).notNull().default('custom'),
    permissions: jsonb('permissions').notNull().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgNameIdx: index('roles_organization_name_idx').on(table.organizationId, table.name),
  }),
);

export const permissionsTable = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).unique().notNull(),
    resource: varchar('resource', { length: 100 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    scope: varchar('scope', { length: 20 }).notNull().default('organization'),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('permissions_name_idx').on(table.name),
    resourceActionIdx: index('permissions_resource_action_idx').on(table.resource, table.action),
  }),
);

export const userTeamsTable = pgTable(
  'user_teams',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    permissions: jsonb('permissions').default([]),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
    orgIdx: index('idx_user_teams_organization_id').on(table.organizationId),
    orgUserIdx: index('idx_user_teams_org_user').on(table.organizationId, table.userId),
    orgTeamIdx: index('idx_user_teams_org_team').on(table.organizationId, table.teamId),
  }),
);

// ------------ Vulnerabilities ------------

export const vulnerabilitiesTable = pgTable(
  'vulnerabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    avdId: varchar('avd_id', { length: 50 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    category: varchar('category', { length: 100 }).notNull(),
    riskLevel: varchar('risk_level', { length: 20 }).notNull(),
    cvssScore: numeric('cvss_score', { precision: 3, scale: 1 }), // CVSS score (0.0-10.0)
    status: varchar('status', { length: 20 }).notNull().default('discovered'),
    disclosedAt: timestamp('disclosed_at'),
    description: text('description').notNull(),
    affectedTargets: jsonb('affected_targets').notNull().default([]),
    impactScope: text('impact_scope'),
    cweId: varchar('cwe_id', { length: 20 }),
    mitreId: varchar('mitre_id', { length: 50 }),
    owaspId: varchar('owasp_id', { length: 50 }),
    owaspLlmTop10Mapping: jsonb('owasp_llm_top10_mapping'),
    exploitability: jsonb('exploitability'),
    patchStatus: jsonb('patch_status'),
    auditNotes: text('audit_notes'),
    tags: jsonb('tags').notNull().default([]),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => usersTable.id),
    updatedBy: uuid('updated_by').references(() => usersTable.id),
  },
  (table) => ({
    avdIdIdx: index('vulnerabilities_avd_id_idx').on(table.avdId),
    typeIdx: index('vulnerabilities_type_idx').on(table.type),
    riskLevelIdx: index('vulnerabilities_risk_level_idx').on(table.riskLevel),
    cvssScoreIdx: index('vulnerabilities_cvss_score_idx').on(table.cvssScore),
    statusIdx: index('vulnerabilities_status_idx').on(table.status),
  }),
);

// ------------ Attack Tasks ------------

export const attackTasksTable = pgTable(
  'attack_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teamsTable.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    targetConfig: jsonb('target_config').notNull(),
    vulnerabilities: jsonb('vulnerabilities').notNull().default([]),
    attackMode: varchar('attack_mode', { length: 20 }).notNull(),
    compositeAttackConfig: jsonb('composite_attack_config'),
    detectionConfig: jsonb('detection_config').notNull(),
    agentConfig: jsonb('agent_config'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('attack_tasks_organization_id_idx').on(table.organizationId),
    statusIdx: index('attack_tasks_status_idx').on(table.status),
    userIdx: index('attack_tasks_user_id_idx').on(table.userId),
    createdAtIdx: index('attack_tasks_created_at_idx').on(table.createdAt),
  }),
);

// ------------ Attack Results (findings from task runs) ------------

export const attackResultsTable = pgTable(
  'attack_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => attackTasksTable.id, { onDelete: 'cascade' }),
    vulnerabilityId: uuid('vulnerability_id').references(() => vulnerabilitiesTable.id, {
      onDelete: 'set null',
    }),
    commandId: uuid('command_id'),
    attackMode: varchar('attack_mode', { length: 20 }).notNull(),
    request: jsonb('request').notNull(),
    response: jsonb('response').notNull(),
    conversationHistory: jsonb('conversation_history'),
    detectionResults: jsonb('detection_results'),
    finalVerdict: jsonb('final_verdict').notNull(),
    agentActions: jsonb('agent_actions'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    taskIdx: index('attack_results_task_id_idx').on(table.taskId),
    vulnIdx: index('attack_results_vulnerability_id_idx').on(table.vulnerabilityId),
  }),
);

// ------------ Target Agents ------------

export const targetAgentsTable = pgTable(
  'target_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teamsTable.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }),
    icon: varchar('icon', { length: 50 }),
    config: jsonb('config'),
    metadata: jsonb('metadata'),
    status: varchar('status', { length: 20 }),
    healthStatus: jsonb('health_status'),
    statistics: jsonb('statistics'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('target_agents_organization_id_idx').on(table.organizationId),
  }),
);

// ------------ New Asset Intake ------------

export const agentAssetsTable = pgTable(
  'agent_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teamsTable.id, { onDelete: 'set null' }),
    legacyId: varchar('legacy_id', { length: 64 }),
    assetCode: varchar('asset_code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    agentType: varchar('agent_type', { length: 64 }).notNull(),
    platformFamily: varchar('platform_family', { length: 64 }).notNull(),
    externalId: varchar('external_id', { length: 255 }),
    sourceType: varchar('source_type', { length: 32 }).notNull().default('manual'),
    environment: varchar('environment', { length: 32 }).notNull(),
    runtimeStatus: varchar('runtime_status', { length: 32 }).notNull().default('not_launched'),
    lifecycleStatus: varchar('lifecycle_status', { length: 32 }).notNull().default('registered'),
    admissionStatus: varchar('admission_status', { length: 32 }).notNull().default('not_checked'),
    businessScene: varchar('business_scene', { length: 255 }),
    businessSystem: varchar('business_system', { length: 255 }),
    functionIntro: text('function_intro').notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('normal'),
    exposureLevel: varchar('exposure_level', { length: 32 }).notNull().default('internal'),
    exposureSurface: text('exposure_surface'),
    sensitiveData: boolean('sensitive_data').notNull().default(false),
    version: varchar('version', { length: 64 }).notNull().default('v0.1.0'),
    defaultModel: varchar('default_model', { length: 255 }),
    tags: jsonb('tags').notNull().default([]),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgCreatedIdx: index('agent_assets_org_created_idx').on(table.organizationId, table.createdAt),
    orgLifecycleIdx: index('agent_assets_org_lifecycle_idx').on(
      table.organizationId,
      table.lifecycleStatus,
    ),
    orgRuntimeIdx: index('agent_assets_org_runtime_idx').on(
      table.organizationId,
      table.runtimeStatus,
    ),
    orgRiskIdx: index('agent_assets_org_risk_idx').on(table.organizationId, table.riskLevel),
    orgPlatformIdx: index('agent_assets_org_platform_idx').on(
      table.organizationId,
      table.platformFamily,
    ),
    orgExternalIdx: index('agent_assets_org_external_idx').on(
      table.organizationId,
      table.externalId,
    ),
    orgCodeIdx: uniqueIndex('agent_assets_org_code_idx').on(table.organizationId, table.assetCode),
    orgNameIdx: index('agent_assets_org_name_idx').on(table.organizationId, table.name),
  }),
);

export const assetOwnershipsTable = pgTable(
  'asset_ownerships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    ownerType: varchar('owner_type', { length: 32 }).notNull(),
    userId: uuid('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
    ownerName: varchar('owner_name', { length: 255 }),
    department: varchar('department', { length: 255 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgAssetIdx: index('asset_ownerships_org_asset_idx').on(table.organizationId, table.assetId),
    orgTypeIdx: index('asset_ownerships_org_type_idx').on(table.organizationId, table.ownerType),
    orgUserIdx: index('asset_ownerships_org_user_idx').on(table.organizationId, table.userId),
  }),
);

export const agentAssetComponentsTable = pgTable(
  'agent_asset_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    componentType: varchar('component_type', { length: 64 }).notNull(),
    componentName: varchar('component_name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    version: varchar('version', { length: 64 }),
    sourceType: varchar('source_type', { length: 64 }),
    sourceRefId: uuid('source_ref_id'),
    highRisk: boolean('high_risk').notNull().default(false),
    sensitiveLevel: varchar('sensitive_level', { length: 64 }),
    permissionScope: jsonb('permission_scope').notNull().default({}),
    configSnapshot: jsonb('config_snapshot').notNull().default({}),
    componentFingerprint: varchar('component_fingerprint', { length: 255 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgAssetIdx: index('agent_asset_components_org_asset_idx').on(
      table.organizationId,
      table.assetId,
    ),
    orgTypeIdx: index('agent_asset_components_org_type_idx').on(
      table.organizationId,
      table.componentType,
    ),
    orgKeyIdx: index('agent_asset_components_org_key_idx').on(
      table.organizationId,
      table.componentKey,
    ),
    orgFingerprintIdx: index('agent_asset_components_org_fingerprint_idx').on(
      table.organizationId,
      table.componentFingerprint,
    ),
  }),
);

export const agentAssetSnapshotsTable = pgTable(
  'agent_asset_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    snapshotType: varchar('snapshot_type', { length: 64 }).notNull(),
    version: varchar('version', { length: 64 }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    snapshotJson: jsonb('snapshot_json').notNull(),
    diffFromSnapshotId: uuid('diff_from_snapshot_id'),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgAssetCreatedIdx: index('agent_asset_snapshots_org_asset_created_idx').on(
      table.organizationId,
      table.assetId,
      table.createdAt,
    ),
    orgAssetVersionIdx: index('agent_asset_snapshots_org_asset_version_idx').on(
      table.organizationId,
      table.assetId,
      table.version,
    ),
    orgHashIdx: index('agent_asset_snapshots_org_hash_idx').on(
      table.organizationId,
      table.contentHash,
    ),
  }),
);

export const assetLifecycleEventsTable = pgTable(
  'asset_lifecycle_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    fromStatus: varchar('from_status', { length: 64 }),
    toStatus: varchar('to_status', { length: 64 }),
    actorId: uuid('actor_id').references(() => usersTable.id, { onDelete: 'set null' }),
    eventDetail: jsonb('event_detail').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgAssetCreatedIdx: index('asset_lifecycle_events_org_asset_created_idx').on(
      table.organizationId,
      table.assetId,
      table.createdAt,
    ),
    orgEventIdx: index('asset_lifecycle_events_org_event_idx').on(
      table.organizationId,
      table.eventType,
    ),
  }),
);

export const platformConnectorsTable = pgTable(
  'platform_connectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    platformFamily: varchar('platform_family', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    endpoint: varchar('endpoint', { length: 500 }),
    credentialRef: uuid('credential_ref'),
    syncConfig: jsonb('sync_config').notNull().default({}),
    status: varchar('status', { length: 32 }).notNull().default('disabled'),
    lastSyncAt: timestamp('last_sync_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('platform_connectors_org_idx').on(table.organizationId),
    orgPlatformIdx: index('platform_connectors_org_platform_idx').on(
      table.organizationId,
      table.platformFamily,
    ),
  }),
);

export const platformDiscoveredAssetsTable = pgTable(
  'platform_discovered_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    connectorId: uuid('connector_id').references(() => platformConnectorsTable.id, {
      onDelete: 'set null',
    }),
    platformFamily: varchar('platform_family', { length: 64 }).notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    rawName: varchar('raw_name', { length: 255 }).notNull(),
    rawStatus: varchar('raw_status', { length: 64 }),
    guessTeam: varchar('guess_team', { length: 255 }),
    claimStatus: varchar('claim_status', { length: 32 }).notNull().default('pending'),
    claimedAssetId: uuid('claimed_asset_id').references(() => agentAssetsTable.id, {
      onDelete: 'set null',
    }),
    rawPayload: jsonb('raw_payload').notNull().default({}),
    discoveredAt: timestamp('discovered_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgClaimIdx: index('platform_discovered_assets_org_claim_idx').on(
      table.organizationId,
      table.claimStatus,
    ),
    orgExternalIdx: index('platform_discovered_assets_org_external_idx').on(
      table.organizationId,
      table.platformFamily,
      table.externalId,
    ),
    orgDiscoveredIdx: index('platform_discovered_assets_org_discovered_idx').on(
      table.organizationId,
      table.discoveredAt,
    ),
  }),
);

export const assetIngestJobsTable = pgTable(
  'asset_ingest_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    jobType: varchar('job_type', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    totalCount: integer('total_count').notNull().default(0),
    successCount: integer('success_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    inputJson: jsonb('input_json').notNull().default({}),
    resultJson: jsonb('result_json').notNull().default({}),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgStatusIdx: index('asset_ingest_jobs_org_status_idx').on(table.organizationId, table.status),
    orgTypeIdx: index('asset_ingest_jobs_org_type_idx').on(table.organizationId, table.jobType),
  }),
);

// ------------ Detection Scanning ------------

export const securityScanTasksTable = pgTable(
  'security_scan_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => agentAssetsTable.id, { onDelete: 'set null' }),
    assetCode: varchar('asset_code', { length: 64 }),
    assetName: varchar('asset_name', { length: 255 }),
    assetVersion: varchar('asset_version', { length: 64 }),
    assetSnapshotId: uuid('asset_snapshot_id').references(() => agentAssetSnapshotsTable.id, {
      onDelete: 'set null',
    }),
    componentVersions: jsonb('component_versions').notNull().default([]),
    name: varchar('name', { length: 255 }).notNull(),
    source: varchar('source', { length: 64 }).notNull().default('asset_ledger'),
    scanType: varchar('scan_type', { length: 64 }).notNull().default('security_baseline'),
    targetKind: varchar('target_kind', { length: 64 }).notNull().default('agent'),
    targetSummary: varchar('target_summary', { length: 500 }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    progress: integer('progress').notNull().default(0),
    highCount: integer('high_count').notNull().default(0),
    mediumCount: integer('medium_count').notNull().default(0),
    lowCount: integer('low_count').notNull().default(0),
    ownerName: varchar('owner_name', { length: 255 }),
    runConfig: jsonb('run_config').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgCreatedIdx: index('security_scan_tasks_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    orgStatusIdx: index('security_scan_tasks_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    orgAssetIdx: index('security_scan_tasks_org_asset_idx').on(table.organizationId, table.assetId),
    orgAssetVersionIdx: index('security_scan_tasks_org_asset_version_idx').on(
      table.organizationId,
      table.assetId,
      table.assetVersion,
    ),
    orgTypeIdx: index('security_scan_tasks_org_type_idx').on(table.organizationId, table.scanType),
  }),
);

export const securityScanTaskPlansTable = pgTable(
  'security_scan_task_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => securityScanTasksTable.id, { onDelete: 'cascade' }),
    probeType: varchar('probe_type', { length: 64 }).notNull(),
    strategy: varchar('strategy', { length: 255 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    libIds: jsonb('lib_ids').notNull().default([]),
    caseCount: integer('case_count').notNull().default(0),
    targets: jsonb('targets').notNull().default([]),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgTaskIdx: index('security_scan_task_plans_org_task_idx').on(
      table.organizationId,
      table.taskId,
    ),
    orgProbeIdx: index('security_scan_task_plans_org_probe_idx').on(
      table.organizationId,
      table.probeType,
    ),
  }),
);

export const securityCaseLibrariesTable = pgTable(
  'security_case_libraries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    libraryKey: varchar('library_key', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 64 }).notNull(),
    description: text('description').notNull(),
    caseCount: integer('case_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    defaultLevel: varchar('default_level', { length: 32 }).notNull().default('medium'),
    detectMethod: varchar('detect_method', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    standards: jsonb('standards').notNull().default([]),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKeyIdx: uniqueIndex('security_case_libraries_org_key_idx').on(
      table.organizationId,
      table.libraryKey,
    ),
    orgDomainIdx: index('security_case_libraries_org_domain_idx').on(
      table.organizationId,
      table.domain,
    ),
    orgStatusIdx: index('security_case_libraries_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  }),
);

export const securityTestCasesTable = pgTable(
  'security_test_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    libraryId: uuid('library_id')
      .notNull()
      .references(() => securityCaseLibrariesTable.id, { onDelete: 'cascade' }),
    caseCode: varchar('case_code', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    attackType: varchar('attack_type', { length: 64 }).notNull().default('direct'),
    prompt: text('prompt').notNull(),
    expectedPass: text('expected_pass'),
    expectedFail: text('expected_fail'),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    tags: jsonb('tags').notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgLibraryIdx: index('security_test_cases_org_library_idx').on(
      table.organizationId,
      table.libraryId,
    ),
    orgCodeIdx: uniqueIndex('security_test_cases_org_code_idx').on(
      table.organizationId,
      table.caseCode,
    ),
    orgStatusIdx: index('security_test_cases_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  }),
);

export const complianceTaskTemplatesTable = pgTable(
  'compliance_task_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    templateKey: varchar('template_key', { length: 128 }),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 128 }).notNull(),
    scope: varchar('scope', { length: 512 }).notNull().default(''),
    description: text('description'),
    libraryKeys: jsonb('library_keys').notNull().default([]),
    sampleTypes: jsonb('sample_types').notNull().default([]),
    assessScenario: varchar('assess_scenario', { length: 64 }).notNull().default('launch'),
    creationMode: varchar('creation_mode', { length: 32 }).notNull().default('manual'),
    libCount: integer('lib_count').notNull().default(0),
    caseCount: integer('case_count').notNull().default(0),
    icon: varchar('icon', { length: 32 }),
    tags: jsonb('tags').notNull().default([]),
    ownerName: varchar('owner_name', { length: 128 }),
    isSystem: boolean('is_system').notNull().default(false),
    usageCount: integer('usage_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKeyIdx: uniqueIndex('compliance_task_templates_org_key_idx').on(
      table.organizationId,
      table.templateKey,
    ),
    orgDomainIdx: index('compliance_task_templates_org_domain_idx').on(
      table.organizationId,
      table.domain,
    ),
    orgEnabledIdx: index('compliance_task_templates_org_enabled_idx').on(
      table.organizationId,
      table.enabled,
    ),
  }),
);

export const complianceRegulationMappingsTable = pgTable(
  'compliance_regulation_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    mappingKey: varchar('mapping_key', { length: 128 }).notNull(),
    law: varchar('law', { length: 512 }).notNull(),
    article: varchar('article', { length: 512 }).notNull(),
    rule: varchar('rule', { length: 512 }).notNull(),
    sourceText: text('source_text'),
    caseIds: jsonb('case_ids').notNull().default([]),
    libraryId: uuid('library_id').references(() => securityCaseLibrariesTable.id, {
      onDelete: 'set null',
    }),
    policyId: varchar('policy_id', { length: 128 }),
    riskType: varchar('risk_type', { length: 128 }).notNull().default('合规风险'),
    status: varchar('status', { length: 64 }).notNull().default('已映射'),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKeyIdx: uniqueIndex('compliance_regulation_mappings_org_key_idx').on(
      table.organizationId,
      table.mappingKey,
    ),
    orgLawIdx: index('compliance_regulation_mappings_org_law_idx').on(
      table.organizationId,
      table.law,
    ),
    orgStatusIdx: index('compliance_regulation_mappings_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  }),
);

export const capabilityComponentRegistryTable = pgTable(
  'capability_component_registry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    componentKind: varchar('component_kind', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    version: varchar('version', { length: 64 }),
    description: text('description'),
    source: varchar('source', { length: 255 }),
    permissionScope: jsonb('permission_scope').default({}),
    checks: jsonb('checks').notNull().default([]),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    riskTitle: varchar('risk_title', { length: 255 }),
    enabled: boolean('enabled').notNull().default(true),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    hasPackage: boolean('has_package').notNull().default(false),
    lastDetectedAt: timestamp('last_detected_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKindIdx: index('cap_comp_reg_org_kind_idx').on(table.organizationId, table.componentKind),
    orgKeyIdx: index('cap_comp_reg_org_key_idx').on(table.organizationId, table.componentKey),
    orgLevelIdx: index('cap_comp_reg_org_level_idx').on(table.organizationId, table.riskLevel),
  }),
);

export const capabilityComponentArtifactsTable = pgTable(
  'capability_component_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    registryId: uuid('registry_id')
      .notNull()
      .references(() => capabilityComponentRegistryTable.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 512 }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    storagePath: varchar('storage_path', { length: 1024 }).notNull(),
    fileSize: integer('file_size').notNull().default(0),
    fileTreeJson: jsonb('file_tree_json').default([]),
    skillMdExcerpt: text('skill_md_excerpt'),
    isCurrent: boolean('is_current').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgRegIdx: index('cap_comp_art_org_reg_idx').on(table.organizationId, table.registryId),
    hashIdx: index('cap_comp_art_hash_idx').on(table.organizationId, table.contentHash),
  }),
);

export const capabilityRiskLibrariesTable = pgTable(
  'capability_risk_libraries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    registryId: uuid('registry_id'),
    componentKind: varchar('component_kind', { length: 64 }).notNull(),
    componentName: varchar('component_name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    riskTitle: varchar('risk_title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    source: varchar('source', { length: 255 }),
    affectedAssets: integer('affected_assets').notNull().default(0),
    ruleCount: integer('rule_count').notNull().default(0),
    description: text('description').notNull(),
    checks: jsonb('checks').notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKindIdx: index('capability_risk_libraries_org_kind_idx').on(
      table.organizationId,
      table.componentKind,
    ),
    orgLevelIdx: index('capability_risk_libraries_org_level_idx').on(
      table.organizationId,
      table.riskLevel,
    ),
    orgComponentIdx: index('capability_risk_libraries_org_component_idx').on(
      table.organizationId,
      table.componentKey,
    ),
    registryIdx: index('capability_risk_libraries_registry_idx').on(
      table.organizationId,
      table.registryId,
    ),
  }),
);

export const capabilityRiskRulesTable = pgTable(
  'capability_risk_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    riskLibraryId: uuid('risk_library_id')
      .notNull()
      .references(() => capabilityRiskLibrariesTable.id, { onDelete: 'cascade' }),
    ruleCode: varchar('rule_code', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    checkTarget: varchar('check_target', { length: 128 }).notNull(),
    ruleType: varchar('rule_type', { length: 64 }).notNull().default('static'),
    severity: varchar('severity', { length: 32 }).notNull().default('medium'),
    ruleConfig: jsonb('rule_config').notNull().default({}),
    remediation: text('remediation'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgLibraryIdx: index('capability_risk_rules_org_library_idx').on(
      table.organizationId,
      table.riskLibraryId,
    ),
    orgCodeIdx: uniqueIndex('capability_risk_rules_org_code_idx').on(
      table.organizationId,
      table.ruleCode,
    ),
  }),
);

export const assetComponentRiskLinksTable = pgTable(
  'asset_component_risk_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id').references(() => agentAssetComponentsTable.id, {
      onDelete: 'set null',
    }),
    riskLibraryId: uuid('risk_library_id')
      .notNull()
      .references(() => capabilityRiskLibrariesTable.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    confidence: numeric('confidence', { precision: 5, scale: 2 }),
    evidence: jsonb('evidence').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgAssetIdx: index('asset_component_risk_links_org_asset_idx').on(
      table.organizationId,
      table.assetId,
    ),
    orgRiskIdx: index('asset_component_risk_links_org_risk_idx').on(
      table.organizationId,
      table.riskLibraryId,
    ),
  }),
);

export const securityScanFindingsTable = pgTable(
  'security_scan_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => securityScanTasksTable.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').references(() => agentAssetsTable.id, { onDelete: 'set null' }),
    assetVersion: varchar('asset_version', { length: 64 }),
    assetSnapshotId: uuid('asset_snapshot_id').references(() => agentAssetSnapshotsTable.id, {
      onDelete: 'set null',
    }),
    componentVersions: jsonb('component_versions').notNull().default([]),
    caseLibraryId: uuid('case_library_id').references(() => securityCaseLibrariesTable.id, {
      onDelete: 'set null',
    }),
    testCaseId: uuid('test_case_id').references(() => securityTestCasesTable.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    category: varchar('category', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    description: text('description').notNull(),
    evidence: jsonb('evidence').notNull().default({}),
    recommendation: text('recommendation'),
    remediationTaskId: uuid('remediation_task_id'),
    acceptedReason: text('accepted_reason'),
    detectedAt: timestamp('detected_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgTaskIdx: index('security_scan_findings_org_task_idx').on(table.organizationId, table.taskId),
    orgStatusIdx: index('security_scan_findings_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    orgRiskIdx: index('security_scan_findings_org_risk_idx').on(
      table.organizationId,
      table.riskLevel,
    ),
    orgAssetIdx: index('security_scan_findings_org_asset_idx').on(
      table.organizationId,
      table.assetId,
    ),
    orgAssetVersionIdx: index('security_scan_findings_org_asset_version_idx').on(
      table.organizationId,
      table.assetId,
      table.assetVersion,
    ),
  }),
);

export const securityRemediationTasksTable = pgTable(
  'security_remediation_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => securityScanFindingsTable.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => securityScanTasksTable.id, { onDelete: 'set null' }),
    assetId: uuid('asset_id').references(() => agentAssetsTable.id, { onDelete: 'set null' }),
    sourceAssetVersion: varchar('source_asset_version', { length: 64 }),
    sourceSnapshotId: uuid('source_snapshot_id').references(() => agentAssetSnapshotsTable.id, {
      onDelete: 'set null',
    }),
    targetAssetVersion: varchar('target_asset_version', { length: 64 }),
    targetSnapshotId: uuid('target_snapshot_id').references(() => agentAssetSnapshotsTable.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    ownerName: varchar('owner_name', { length: 255 }),
    ownerId: uuid('owner_id').references(() => usersTable.id, { onDelete: 'set null' }),
    dueAt: timestamp('due_at'),
    remediationAdvice: text('remediation_advice').notNull(),
    evidenceSummary: text('evidence_summary'),
    retestStatus: varchar('retest_status', { length: 32 }).notNull().default('not_started'),
    finalDecision: varchar('final_decision', { length: 32 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
  },
  (table) => ({
    orgStatusIdx: index('security_remediation_tasks_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    orgOwnerIdx: index('security_remediation_tasks_org_owner_idx').on(
      table.organizationId,
      table.ownerName,
    ),
    orgRiskIdx: index('security_remediation_tasks_org_risk_idx').on(
      table.organizationId,
      table.riskLevel,
    ),
    orgFindingIdx: index('security_remediation_tasks_org_finding_idx').on(
      table.organizationId,
      table.findingId,
    ),
    orgSourceVersionIdx: index('security_remediation_tasks_org_source_version_idx').on(
      table.organizationId,
      table.assetId,
      table.sourceAssetVersion,
    ),
  }),
);

export const securityRemediationEvidenceTable = pgTable(
  'security_remediation_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    remediationTaskId: uuid('remediation_task_id')
      .notNull()
      .references(() => securityRemediationTasksTable.id, { onDelete: 'cascade' }),
    evidenceType: varchar('evidence_type', { length: 64 }).notNull().default('text'),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    attachments: jsonb('attachments').notNull().default([]),
    submittedBy: uuid('submitted_by').references(() => usersTable.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  },
  (table) => ({
    orgTaskIdx: index('security_remediation_evidence_org_task_idx').on(
      table.organizationId,
      table.remediationTaskId,
    ),
  }),
);

export const securityRetestRecordsTable = pgTable(
  'security_retest_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    remediationTaskId: uuid('remediation_task_id')
      .notNull()
      .references(() => securityRemediationTasksTable.id, { onDelete: 'cascade' }),
    findingId: uuid('finding_id').references(() => securityScanFindingsTable.id, {
      onDelete: 'set null',
    }),
    retestTaskId: uuid('retest_task_id').references(() => securityScanTasksTable.id, {
      onDelete: 'set null',
    }),
    retestAssetVersion: varchar('retest_asset_version', { length: 64 }),
    retestSnapshotId: uuid('retest_snapshot_id').references(() => agentAssetSnapshotsTable.id, {
      onDelete: 'set null',
    }),
    result: varchar('result', { length: 32 }).notNull().default('pending'),
    conclusion: text('conclusion'),
    evidence: jsonb('evidence').notNull().default({}),
    createdBy: uuid('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgTaskIdx: index('security_retest_records_org_task_idx').on(
      table.organizationId,
      table.remediationTaskId,
    ),
    orgResultIdx: index('security_retest_records_org_result_idx').on(
      table.organizationId,
      table.result,
    ),
    orgVersionIdx: index('security_retest_records_org_version_idx').on(
      table.organizationId,
      table.retestAssetVersion,
    ),
  }),
);

// ------------ Audit & System Config (for enterprise/Postgres) ------------

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id'),
  userId: uuid('user_id'),
  teamId: uuid('team_id'),
  action: varchar('action', { length: 255 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 100 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userActivities = pgTable('user_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  action: varchar('action', { length: 255 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 100 }),
  userAgent: text('user_agent'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const systemConfigsTable = pgTable('system_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 255 }).notNull().unique(),
  value: text('value').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  category: varchar('category', { length: 50 }),
  description: text('description'),
  editable: boolean('editable').notNull().default(true),
  requiresRestart: boolean('requires_restart').notNull().default(false),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const featureFlagsTable = pgTable('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  affects: jsonb('affects').notNull().default([]),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const notificationConfigsTable = pgTable('notification_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: varchar('type', { length: 50 }).notNull(),
  config: jsonb('config').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const securityPoliciesTable = pgTable('security_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  rules: jsonb('rules').notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ------------ Relations ------------

export const organizationsRelations = relations(organizationsTable, ({ many }) => ({
  users: many(usersTable),
  teams: many(teamsTable),
  attackTasks: many(attackTasksTable),
}));

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [usersTable.organizationId],
    references: [organizationsTable.id],
  }),
  attackTasks: many(attackTasksTable),
}));

export const teamsRelations = relations(teamsTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [teamsTable.organizationId],
    references: [organizationsTable.id],
  }),
  userTeams: many(userTeamsTable),
}));

export const attackTasksRelations = relations(attackTasksTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [attackTasksTable.organizationId],
    references: [organizationsTable.id],
  }),
  team: one(teamsTable, {
    fields: [attackTasksTable.teamId],
    references: [teamsTable.id],
  }),
  user: one(usersTable, {
    fields: [attackTasksTable.userId],
    references: [usersTable.id],
  }),
}));

/** Workflow export assets (Postgres / enterprise) — mirrors MySQL workflow_config_assets */
export const workflowConfigAssetsTable = pgTable(
  'workflow_config_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Empty string = org-wide; UUID string = scoped to that target agent. */
    targetAgentId: varchar('target_agent_id', { length: 36 }).notNull().default(''),
    name: varchar('name', { length: 255 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    fileName: varchar('file_name', { length: 512 }),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    rawFormat: varchar('raw_format', { length: 16 }).notNull(),
    rawContent: text('raw_content').notNull(),
    parseStatus: varchar('parse_status', { length: 20 }).notNull(),
    parseError: text('parse_error'),
    parseSummary: jsonb('parse_summary'),
    graphSnapshot: jsonb('graph_snapshot'),
    parserVersion: varchar('parser_version', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('workflow_config_assets_org_idx').on(table.organizationId),
    orgCreatedIdx: index('workflow_config_assets_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    orgSourceHashAgentUid: uniqueIndex('workflow_config_assets_org_src_hash_agent_uidx').on(
      table.organizationId,
      table.sourceType,
      table.contentHash,
      table.targetAgentId,
    ),
    orgAgentIdx: index('workflow_config_assets_org_agent_idx').on(
      table.organizationId,
      table.targetAgentId,
    ),
  }),
);

/** Resource fingerprints per workflow asset — cross-agent resource reuse (Postgres) */
export const workflowConfigAssetResourceRefsTable = pgTable(
  'workflow_config_asset_resource_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => workflowConfigAssetsTable.id, { onDelete: 'cascade' }),
    targetAgentId: varchar('target_agent_id', { length: 36 }).notNull().default(''),
    nodeType: varchar('node_type', { length: 128 }).notNull(),
    resourceFingerprint: varchar('resource_fingerprint', { length: 64 }).notNull(),
    resourceLabel: varchar('resource_label', { length: 512 }).notNull(),
    nodeIds: jsonb('node_ids').notNull(),
  },
  (table) => ({
    assetTypeFpUid: uniqueIndex('wf_asset_res_ref_asset_type_fp_uidx').on(
      table.assetId,
      table.nodeType,
      table.resourceFingerprint,
    ),
    orgFpIdx: index('wf_asset_res_ref_org_fp_idx').on(
      table.organizationId,
      table.resourceFingerprint,
    ),
    assetIdx: index('wf_asset_res_ref_asset_idx').on(table.assetId),
  }),
);

/** Programmatic / partner API keys (Bearer), separate from user JWT. */
export const externalApiKeysTable = pgTable(
  'external_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    secretHash: varchar('secret_hash', { length: 255 }).notNull(),
    scopes: jsonb('scopes').notNull().default([]),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('external_api_keys_org_idx').on(table.organizationId),
    orgStatusIdx: index('external_api_keys_org_status_idx').on(table.organizationId, table.status),
  }),
);

export const externalIdempotencyTable = pgTable(
  'external_idempotency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
    requestPath: varchar('request_path', { length: 255 }).notNull(),
    responseStatus: varchar('response_status', { length: 3 }).notNull(),
    responseBody: text('response_body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgKeyUidx: uniqueIndex('external_idempotency_org_key_uidx').on(
      table.organizationId,
      table.idempotencyKeyHash,
    ),
  }),
);

export const agentGovDepartmentsTable = pgTable(
  'agent_gov_departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    deptType: varchar('dept_type', { length: 64 }),
    lead: varchar('lead', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_departments_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_departments_org_idx').on(table.organizationId),
  }),
);

export const agentGovBusinessScenesTable = pgTable(
  'agent_gov_business_scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_business_scenes_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_business_scenes_org_idx').on(table.organizationId),
  }),
);

export const agentGovBusinessSystemsTable = pgTable(
  'agent_gov_business_systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    departmentName: varchar('department_name', { length: 255 }),
    sceneName: varchar('scene_name', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_business_systems_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_business_systems_org_idx').on(table.organizationId),
  }),
);

export const agentGovOwnersTable = pgTable(
  'agent_gov_owners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    ownerType: varchar('owner_type', { length: 32 }).notNull(),
    departmentName: varchar('department_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgNameTypeUidx: uniqueIndex('agent_gov_owners_org_name_type_uidx').on(
      table.organizationId,
      table.name,
      table.ownerType,
    ),
    orgIdx: index('agent_gov_owners_org_idx').on(table.organizationId),
    orgTypeIdx: index('agent_gov_owners_org_type_idx').on(table.organizationId, table.ownerType),
  }),
);

export const managedLlmModelsTable = pgTable(
  'managed_llm_models',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    modelKey: varchar('model_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    healthStatus: varchar('health_status', { length: 20 }).notNull().default('unknown'),
    quotaMonthly: integer('quota_monthly').notNull().default(100000),
    quotaUsed: integer('quota_used').notNull().default(0),
    providerConfig: jsonb('provider_config'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('managed_llm_models_org_idx').on(table.organizationId),
    orgStatusIdx: index('managed_llm_models_org_status_idx').on(table.organizationId, table.status),
  }),
);

export const managedLlmModelsRelations = relations(managedLlmModelsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [managedLlmModelsTable.organizationId],
    references: [organizationsTable.id],
  }),
}));

export const userTeamsRelations = relations(userTeamsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userTeamsTable.userId],
    references: [usersTable.id],
  }),
  team: one(teamsTable, {
    fields: [userTeamsTable.teamId],
    references: [teamsTable.id],
  }),
}));
