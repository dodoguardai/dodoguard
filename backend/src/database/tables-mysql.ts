import { relations } from 'drizzle-orm';
import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  bigint,
} from 'drizzle-orm/mysql-core';

// ============ 组织与用户 ============

export const organizationsTable = mysqlTable(
  'organizations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    icon: text('icon'), // Supports icon name or image URL/base64
    planId: varchar('plan_id', { length: 36 }),
    subscriptionId: varchar('subscription_id', { length: 36 }),
    status: varchar('status', { length: 20 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('organizations_slug_idx').on(table.slug),
    statusIdx: index('organizations_status_idx').on(table.status),
  }),
);

export const teamsTable = mysqlTable(
  'teams',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    logo: text('logo'), // Supports icon name or image URL/base64
    description: text('description'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('teams_organization_id_idx').on(table.organizationId),
  }),
);

export const usersTable = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    avatar: varchar('avatar', { length: 500 }),
    role: varchar('role', { length: 50 }),
    status: varchar('status', { length: 20 }),
    emailVerified: boolean('email_verified').default(false),
    passwordHash: varchar('password_hash', { length: 255 }),
    mfaEnabled: boolean('mfa_enabled').default(false),
    mfaSecret: varchar('mfa_secret', { length: 255 }),
    lastLoginAt: timestamp('last_login_at'),
    lastActivityAt: timestamp('last_activity_at'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    orgIdx: index('users_organization_id_idx').on(table.organizationId),
    statusIdx: index('users_status_idx').on(table.status),
  }),
);

export const rolesTable = mysqlTable(
  'roles',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }),
    permissions: json('permissions'),
    isDefault: boolean('is_default').default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgNameIdx: uniqueIndex('roles_org_name_idx').on(table.organizationId, table.name),
  }),
);

export const permissionsTable = mysqlTable(
  'permissions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    resource: varchar('resource', { length: 100 }),
    action: varchar('action', { length: 50 }),
    scope: varchar('scope', { length: 20 }),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('permissions_name_idx').on(table.name),
  }),
);

export const userInvitationsTable = mysqlTable(
  'user_invitations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }),
    teamIds: json('team_ids'),
    invitedBy: varchar('invited_by', { length: 36 }).references(() => usersTable.id),
    token: varchar('token', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at'),
    status: varchar('status', { length: 20 }),
    acceptedAt: timestamp('accepted_at'),
    acceptedBy: varchar('accepted_by', { length: 36 }).references(() => usersTable.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('user_invitations_token_idx').on(table.token),
    orgEmailIdx: index('user_invitations_org_email_idx').on(table.organizationId, table.email),
  }),
);

export const userActivitiesTable = mysqlTable(
  'user_activities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }),
    resourceId: varchar('resource_id', { length: 36 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    details: json('details'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('user_activities_user_id_idx').on(table.userId),
    orgIdx: index('user_activities_organization_id_idx').on(table.organizationId),
    createdAtIdx: index('user_activities_created_at_idx').on(table.createdAt),
  }),
);

export const userTeamsTable = mysqlTable(
  'user_teams',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    teamId: varchar('team_id', { length: 36 })
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }),
    permissions: json('permissions'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
    orgIdx: index('idx_user_teams_organization_id').on(table.organizationId),
    orgUserIdx: index('idx_user_teams_org_user').on(table.organizationId, table.userId),
    orgTeamIdx: index('idx_user_teams_org_team').on(table.organizationId, table.teamId),
  }),
);

// ============ 订阅与计费 ============

export const subscriptionPlansTable = mysqlTable(
  'subscription_plans',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // free, starter, professional, enterprise, custom
    priceMonthly: decimal('price_monthly', { precision: 10, scale: 2 }),
    priceQuarterly: decimal('price_quarterly', { precision: 10, scale: 2 }),
    priceYearly: decimal('price_yearly', { precision: 10, scale: 2 }),
    quotas: json('quotas'),
    features: json('features'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    typeIdx: index('subscription_plans_type_idx').on(table.type),
    enabledIdx: index('subscription_plans_enabled_idx').on(table.enabled),
  }),
);

export const organizationSubscriptionsTable = mysqlTable(
  'organization_subscriptions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 36 })
      .notNull()
      .references(() => subscriptionPlansTable.id, { onDelete: 'restrict' }),
    billingCycle: varchar('billing_cycle', { length: 20 }).notNull(), // monthly, quarterly, yearly, one_time
    status: varchar('status', { length: 20 }).notNull(), // active, canceled, expired, past_due, trialing
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).default('USD'),
    paymentMethodId: varchar('payment_method_id', { length: 255 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    organizationIdIdx: index('org_subscriptions_org_id_idx').on(table.organizationId),
    planIdIdx: index('org_subscriptions_plan_id_idx').on(table.planId),
    statusIdx: index('org_subscriptions_status_idx').on(table.status),
    periodIdx: index('org_subscriptions_period_idx').on(
      table.currentPeriodStart,
      table.currentPeriodEnd,
    ),
  }),
);

export const usageRecordsTable = mysqlTable(
  'usage_records',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: varchar('team_id', { length: 36 }).references(() => teamsTable.id, {
      onDelete: 'cascade',
    }),
    userId: varchar('user_id', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'cascade',
    }),
    metric: varchar('metric', { length: 100 }).notNull(),
    quantity: int('quantity').notNull(),
    period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    metadata: json('metadata'),
  },
  (table) => ({
    orgPeriodIdx: index('usage_records_org_period_idx').on(table.organizationId, table.period),
    metricIdx: index('usage_records_metric_idx').on(table.metric),
    timestampIdx: index('usage_records_timestamp_idx').on(table.timestamp),
  }),
);

export const quotaUsageTable = mysqlTable(
  'quota_usage',
  {
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
    quotas: json('quotas').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.period] }), // Composite primary key
    periodIdx: index('quota_usage_period_idx').on(table.period),
  }),
);

// ============ 漏洞管理 ============

export const vulnerabilitiesTable = mysqlTable(
  'vulnerabilities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    avdId: varchar('avd_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(), // agent, mcp, llm, tool, platform, dify, coze, fastgpt
    category: varchar('category', { length: 100 }),
    riskLevel: varchar('risk_level', { length: 20 }).notNull(), // critical, high, medium, low
    cvssScore: decimal('cvss_score', { precision: 3, scale: 1 }), // CVSS score (0.0-10.0)
    status: varchar('status', { length: 20 }).notNull(), // discovered, confirmed, patched, archived
    disclosedAt: timestamp('disclosed_at'),
    description: text('description'),
    affectedTargets: json('affected_targets'),
    impactScope: text('impact_scope'),
    cweId: varchar('cwe_id', { length: 20 }),
    mitreId: varchar('mitre_id', { length: 50 }),
    owaspId: varchar('owasp_id', { length: 50 }),
    owaspLlmTop10Mapping: json('owasp_llm_top10_mapping'),
    advId: varchar('adv_id', { length: 50 }),
    platformFamily: varchar('platform_family', { length: 50 }),
    platformProduct: varchar('platform_product', { length: 100 }),
    artifactKind: varchar('artifact_kind', { length: 50 }),
    detectionPhase: varchar('detection_phase', { length: 20 }),
    vulnSubtype: varchar('vuln_subtype', { length: 100 }),
    rootCauseType: varchar('root_cause_type', { length: 100 }),
    verificationMode: varchar('verification_mode', { length: 20 }),
    defaultConfidence: decimal('default_confidence', { precision: 3, scale: 2 }),
    aliases: json('aliases'),
    frameworkMappings: json('framework_mappings'),
    preconditions: json('preconditions'),
    triggerConditions: json('trigger_conditions'),
    reportProfile: json('report_profile'),
    fingerprint: varchar('fingerprint', { length: 255 }),
    exploitability: json('exploitability'),
    patchStatus: json('patch_status'),
    auditNotes: text('audit_notes'),
    tags: json('tags'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    avdIdIdx: uniqueIndex('vulnerabilities_avd_id_idx').on(table.avdId),
    typeIdx: index('vulnerabilities_type_idx').on(table.type),
    riskLevelIdx: index('vulnerabilities_risk_level_idx').on(table.riskLevel),
    cvssScoreIdx: index('vulnerabilities_cvss_score_idx').on(table.cvssScore),
    statusIdx: index('vulnerabilities_status_idx').on(table.status),
    categoryIdx: index('vulnerabilities_category_idx').on(table.category),
    advIdKey: uniqueIndex('vulnerabilities_adv_id_uk').on(table.advId),
    platformFamilyIdx: index('vulnerabilities_platform_family_idx').on(table.platformFamily),
    artifactKindIdx: index('vulnerabilities_artifact_kind_idx').on(table.artifactKind),
  }),
);

export const attackCommandsTable = mysqlTable(
  'attack_commands',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    content: text('content').notNull(),
    attackMode: varchar('attack_mode', { length: 20 }).notNull(), // direct, mixed, conversation, composite
    expectedSuccess: text('expected_success'),
    nonVulnerability: text('non_vulnerability'),
    riskLevel: varchar('risk_level', { length: 20 }),
    enabled: boolean('enabled').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('attack_commands_vulnerability_id_idx').on(table.vulnerabilityId),
    attackModeIdx: index('attack_commands_attack_mode_idx').on(table.attackMode),
    enabledIdx: index('attack_commands_enabled_idx').on(table.enabled),
  }),
);

export const detectionRulesTable = mysqlTable(
  'detection_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // regex, keyword, json_schema, llm, knowledge_base
    pattern: text('pattern').notNull(),
    severity: varchar('severity', { length: 20 }),
    confidence: decimal('confidence', { precision: 3, scale: 2 }), // 0-1
    ruleEngine: varchar('rule_engine', { length: 50 }),
    matchTarget: varchar('match_target', { length: 50 }),
    selector: text('selector'),
    operator: varchar('operator', { length: 30 }),
    expectedValue: text('expected_value'),
    logic: varchar('logic', { length: 20 }),
    dependsOnRules: json('depends_on_rules'),
    negativeConditions: json('negative_conditions'),
    evidenceExtractor: json('evidence_extractor'),
    appliesToPlatforms: json('applies_to_platforms'),
    appliesToComponents: json('applies_to_components'),
    versionConstraints: json('version_constraints'),
    testFixtureIds: json('test_fixture_ids'),
    enabled: boolean('enabled').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('detection_rules_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('detection_rules_type_idx').on(table.type),
    enabledIdx: index('detection_rules_enabled_idx').on(table.enabled),
  }),
);

export const configSignaturesTable = mysqlTable(
  'config_signatures',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    platformFamily: varchar('platform_family', { length: 50 }).notNull(),
    artifactKind: varchar('artifact_kind', { length: 50 }).notNull(),
    signatureType: varchar('signature_type', { length: 30 }).notNull(),
    selector: text('selector').notNull(),
    operator: varchar('operator', { length: 30 }).notNull(),
    expectedValue: text('expected_value'),
    weight: decimal('weight', { precision: 4, scale: 2 }).notNull().default('1.00'),
    enabled: boolean('enabled').notNull().default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('config_signatures_vulnerability_id_idx').on(table.vulnerabilityId),
    platformIdx: index('config_signatures_platform_idx').on(table.platformFamily),
  }),
);

export const graphDetectionRulesTable = mysqlTable(
  'graph_detection_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    platformFamily: varchar('platform_family', { length: 50 }).notNull(),
    sourceFilter: json('source_filter'),
    edgeFilter: json('edge_filter'),
    targetFilter: json('target_filter'),
    pathMaxDepth: int('path_max_depth').notNull().default(3),
    logic: varchar('logic', { length: 20 }).notNull().default('and'),
    severityOverride: varchar('severity_override', { length: 20 }),
    enabled: boolean('enabled').notNull().default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('graph_detection_rules_vulnerability_id_idx').on(
      table.vulnerabilityId,
    ),
    platformIdx: index('graph_detection_rules_platform_idx').on(table.platformFamily),
  }),
);

export const validationFixturesTable = mysqlTable(
  'validation_fixtures',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    fixtureType: varchar('fixture_type', { length: 30 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    content: text('content'),
    contentJson: json('content_json'),
    expectedOutcome: json('expected_outcome'),
    phase: varchar('phase', { length: 20 }).notNull().default('static'),
    enabled: boolean('enabled').notNull().default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('validation_fixtures_vulnerability_id_idx').on(table.vulnerabilityId),
    fixtureTypeIdx: index('validation_fixtures_fixture_type_idx').on(table.fixtureType),
  }),
);

export const solutionsTable = mysqlTable(
  'solutions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    steps: json('steps'),
    references: json('references'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('solutions_vulnerability_id_idx').on(table.vulnerabilityId),
  }),
);

export const successIndicatorsTable = mysqlTable(
  'success_indicators',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // regex, keyword, json_schema, llm, status_code, response_time
    pattern: text('pattern'),
    description: text('description'),
    confidence: decimal('confidence', { precision: 3, scale: 2 }), // 0-1
    severity: varchar('severity', { length: 20 }),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('success_indicators_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('success_indicators_type_idx').on(table.type),
    enabledIdx: index('success_indicators_enabled_idx').on(table.enabled),
  }),
);

export const failureIndicatorsTable = mysqlTable(
  'failure_indicators',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // regex, keyword, json_schema, llm, status_code, error_message
    pattern: text('pattern'),
    description: text('description'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('failure_indicators_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('failure_indicators_type_idx').on(table.type),
    enabledIdx: index('failure_indicators_enabled_idx').on(table.enabled),
  }),
);

export const wafRulesTable = mysqlTable(
  'waf_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 20 }).notNull(), // text, semantic
    rule: text('rule').notNull(),
    description: text('description'),
    textPattern: text('text_pattern'),
    textMatchType: varchar('text_match_type', { length: 20 }),
    semanticPrompt: text('semantic_prompt'),
    semanticThreshold: decimal('semantic_threshold', { precision: 3, scale: 2 }),
    enabled: boolean('enabled').default(true),
    priority: int('priority').default(0),
    action: varchar('action', { length: 20 }).default('block'), // block, alert, log
    applicableScenarios: json('applicable_scenarios'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('waf_rules_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('waf_rules_type_idx').on(table.type),
    enabledIdx: index('waf_rules_enabled_idx').on(table.enabled),
    priorityIdx: index('waf_rules_priority_idx').on(table.priority),
  }),
);

export const llmReviewInstructionsTable = mysqlTable(
  'llm_review_instructions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    content: text('content').notNull(),
    description: text('description'),
    model: varchar('model', { length: 100 }),
    temperature: decimal('temperature', { precision: 3, scale: 2 }),
    maxTokens: int('max_tokens'),
    enabled: boolean('enabled').default(true),
    priority: int('priority').default(0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('llm_review_instructions_vulnerability_id_idx').on(
      table.vulnerabilityId,
    ),
    typeIdx: index('llm_review_instructions_type_idx').on(table.type),
    enabledIdx: index('llm_review_instructions_enabled_idx').on(table.enabled),
  }),
);

export const agentGuardStrategiesTable = mysqlTable(
  'agent_guard_strategies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    strategyType: varchar('strategy_type', { length: 50 }).notNull(),
    description: text('description'),
    config: json('config'),
    enabled: boolean('enabled').default(true),
    priority: int('priority').default(0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('agent_guard_strategies_vulnerability_id_idx').on(
      table.vulnerabilityId,
    ),
    strategyTypeIdx: index('agent_guard_strategies_strategy_type_idx').on(table.strategyType),
    enabledIdx: index('agent_guard_strategies_enabled_idx').on(table.enabled),
    priorityIdx: index('agent_guard_strategies_priority_idx').on(table.priority),
  }),
);

export const socAlertRulesTable = mysqlTable(
  'soc_alert_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    conditions: json('conditions'),
    actions: json('actions'),
    enabled: boolean('enabled').default(true),
    priority: int('priority').default(0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('soc_alert_rules_vulnerability_id_idx').on(table.vulnerabilityId),
    enabledIdx: index('soc_alert_rules_enabled_idx').on(table.enabled),
    priorityIdx: index('soc_alert_rules_priority_idx').on(table.priority),
  }),
);

export const complianceStatementsTable = mysqlTable(
  'compliance_statements',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 })
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    standard: varchar('standard', { length: 50 }).notNull(), // ISO27001, SOC2, GDPR等
    statement: text('statement').notNull(),
    clause: varchar('clause', { length: 100 }),
    description: text('description'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    vulnerabilityIdIdx: index('compliance_statements_vulnerability_id_idx').on(
      table.vulnerabilityId,
    ),
    standardIdx: index('compliance_statements_standard_idx').on(table.standard),
  }),
);

// ============ 任务类型与攻击任务 ============

export const taskTypesTable = mysqlTable(
  'task_types',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    code: varchar('code', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    platformFamily: varchar('platform_family', { length: 50 }),
    defaultScanMode: varchar('default_scan_mode', { length: 20 }),
    defaultReportType: varchar('default_report_type', { length: 50 }),
    description: text('description'),
    configSchema: json('config_schema'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex('task_types_code_idx').on(table.code),
  }),
);

export const attackTasksTable = mysqlTable(
  'attack_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: varchar('team_id', { length: 36 }).references(() => teamsTable.id, {
      onDelete: 'set null',
    }),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    taskTypeId: varchar('task_type_id', { length: 36 }).references(() => taskTypesTable.id, {
      onDelete: 'set null',
    }),
    platformFamily: varchar('platform_family', { length: 50 }),
    scanMode: varchar('scan_mode', { length: 20 }),
    entrypointType: varchar('entrypoint_type', { length: 50 }),
    artifactRefs: json('artifact_refs'),
    judgeConfig: json('judge_config'),
    reportPreference: json('report_preference'),
    scheduleConfig: json('schedule_config'),
    retestOfTaskId: varchar('retest_of_task_id', { length: 36 }),
    baselineTaskId: varchar('baseline_task_id', { length: 36 }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    targetType: varchar('target_type', { length: 50 }),
    targetConfig: json('target_config'),
    vulnerabilities: json('vulnerabilities'),
    attackMode: varchar('attack_mode', { length: 20 }),
    compositeAttackConfig: json('composite_attack_config'),
    detectionConfig: json('detection_config'),
    agentConfig: json('agent_config'),
    status: varchar('status', { length: 20 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('attack_tasks_organization_id_idx').on(table.organizationId),
    statusIdx: index('attack_tasks_status_idx').on(table.status),
    taskTypeIdx: index('attack_tasks_task_type_id_idx').on(table.taskTypeId),
    platformFamilyIdx: index('attack_tasks_platform_family_idx').on(table.platformFamily),
    scanModeIdx: index('attack_tasks_scan_mode_idx').on(table.scanMode),
    orgStatusCreatedIdx: index('attack_tasks_org_status_created_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
  }),
);

/** User-uploaded workflow exports (Dify / FastGPT / Coze) for reuse and visualization — see workflow-config-assets-spec.md */
export const workflowConfigAssetsTable = mysqlTable(
  'workflow_config_assets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    createdByUserId: varchar('created_by_user_id', { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    /** Empty string = org-wide; UUID = uploaded or saved in context of that target agent. */
    targetAgentId: varchar('target_agent_id', { length: 36 }).notNull().default(''),
    name: varchar('name', { length: 255 }).notNull(),
    sourceType: varchar('source_type', { length: 32 }).notNull(),
    fileName: varchar('file_name', { length: 512 }),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    rawFormat: varchar('raw_format', { length: 16 }).notNull(),
    /** Full export text (MEDIUMTEXT in applied migration; Drizzle `text` maps to TEXT in some versions — keep migration as source of truth for size). */
    rawContent: text('raw_content').notNull(),
    parseStatus: varchar('parse_status', { length: 20 }).notNull(),
    parseError: text('parse_error'),
    parseSummary: json('parse_summary'),
    graphSnapshot: json('graph_snapshot'),
    parserVersion: varchar('parser_version', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('workflow_config_assets_org_idx').on(table.organizationId),
    orgHashIdx: index('workflow_config_assets_org_hash_idx').on(
      table.organizationId,
      table.contentHash,
    ),
    orgCreatedIdx: index('workflow_config_assets_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    orgSourceHashAgentIdx: uniqueIndex('workflow_config_assets_org_src_hash_agent_uidx').on(
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

/** Resource fingerprints per workflow asset node groups — enables cross-agent resource reuse lookup */
export const workflowConfigAssetResourceRefsTable = mysqlTable(
  'workflow_config_asset_resource_refs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => workflowConfigAssetsTable.id, { onDelete: 'cascade' }),
    targetAgentId: varchar('target_agent_id', { length: 36 }).notNull().default(''),
    nodeType: varchar('node_type', { length: 128 }).notNull(),
    resourceFingerprint: varchar('resource_fingerprint', { length: 64 }).notNull(),
    resourceLabel: varchar('resource_label', { length: 512 }).notNull(),
    nodeIds: json('node_ids').notNull(),
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

export const externalApiKeysTable = mysqlTable(
  'external_api_keys',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    secretHash: varchar('secret_hash', { length: 255 }).notNull(),
    scopes: json('scopes').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    expiresAt: timestamp('expires_at'),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('external_api_keys_org_idx').on(table.organizationId),
    orgStatusIdx: index('external_api_keys_org_status_idx').on(table.organizationId, table.status),
  }),
);

export const externalIdempotencyTable = mysqlTable(
  'external_idempotency',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    idempotencyKeyHash: varchar('idempotency_key_hash', { length: 64 }).notNull(),
    requestPath: varchar('request_path', { length: 255 }).notNull(),
    responseStatus: varchar('response_status', { length: 3 }).notNull(),
    responseBody: text('response_body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgKeyUidx: uniqueIndex('external_idempotency_org_key_uidx').on(
      table.organizationId,
      table.idempotencyKeyHash,
    ),
  }),
);

export const scanRunsTable = mysqlTable(
  'scan_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    taskId: varchar('task_id', { length: 36 })
      .notNull()
      .references(() => attackTasksTable.id, { onDelete: 'cascade' }),
    platformFamily: varchar('platform_family', { length: 50 }),
    scanMode: varchar('scan_mode', { length: 20 }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    scannerVersion: varchar('scanner_version', { length: 50 }),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    summary: json('summary'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    taskIdx: index('scan_runs_task_id_idx').on(table.taskId),
    statusIdx: index('scan_runs_status_idx').on(table.status),
  }),
);

export const scanArtifactsTable = mysqlTable(
  'scan_artifacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    scanRunId: varchar('scan_run_id', { length: 36 })
      .notNull()
      .references(() => scanRunsTable.id, { onDelete: 'cascade' }),
    artifactType: varchar('artifact_type', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    path: varchar('path', { length: 500 }),
    checksum: varchar('checksum', { length: 128 }),
    contentPreview: text('content_preview'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    scanRunIdx: index('scan_artifacts_scan_run_id_idx').on(table.scanRunId),
    typeIdx: index('scan_artifacts_type_idx').on(table.artifactType),
  }),
);

export const attackResultsTable = mysqlTable(
  'attack_results',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    taskId: varchar('task_id', { length: 36 })
      .notNull()
      .references(() => attackTasksTable.id, { onDelete: 'cascade' }),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 }).references(
      () => vulnerabilitiesTable.id,
      { onDelete: 'set null' },
    ),
    commandId: varchar('command_id', { length: 36 }).references(() => attackCommandsTable.id, {
      onDelete: 'set null',
    }),
    attackMode: varchar('attack_mode', { length: 20 }),
    request: json('request'),
    response: json('response'),
    conversationHistory: json('conversation_history'),
    detectionResults: json('detection_results'),
    finalVerdict: json('final_verdict'),
    agentActions: json('agent_actions'),
    scanRunId: varchar('scan_run_id', { length: 36 }).references(() => scanRunsTable.id, {
      onDelete: 'set null',
    }),
    rawResultType: varchar('raw_result_type', { length: 30 }),
    normalizedStatus: varchar('normalized_status', { length: 20 }),
    platformFamily: varchar('platform_family', { length: 50 }),
    artifactId: varchar('artifact_id', { length: 36 }),
    evidenceSummary: json('evidence_summary'),
    findingCandidateKey: varchar('finding_candidate_key', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    metadata: json('metadata'),
  },
  (table) => ({
    taskIdx: index('attack_results_task_id_idx').on(table.taskId),
    vulnIdx: index('attack_results_vulnerability_id_idx').on(table.vulnerabilityId),
    scanRunIdx: index('attack_results_scan_run_id_idx').on(table.scanRunId),
    normalizedStatusIdx: index('attack_results_normalized_status_idx').on(table.normalizedStatus),
  }),
);

// ============ 报告 ============

export const reportTemplatesTable = mysqlTable(
  'report_templates',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    htmlTemplate: text('html_template'),
    styles: text('styles'),
    sections: json('sections'),
    enabled: boolean('enabled').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    enabledIdx: index('report_templates_enabled_idx').on(table.enabled),
  }),
);

export const reportsTable = mysqlTable(
  'reports',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    taskId: varchar('task_id', { length: 36 }).references(() => attackTasksTable.id, {
      onDelete: 'cascade',
    }), // nullable for dify_config_audit reports
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    templateId: varchar('template_id', { length: 36 }).references(() => reportTemplatesTable.id, {
      onDelete: 'set null',
    }),
    reportType: varchar('report_type', { length: 30 }).notNull().default('attack_task'),
    title: varchar('title', { length: 255 }),
    reportRunId: varchar('report_run_id', { length: 36 }),
    status: varchar('status', { length: 20 }).default('draft'),
    version: int('version').notNull().default(1),
    language: varchar('language', { length: 20 }).default('zh-CN'),
    audience: varchar('audience', { length: 30 }),
    summaryJson: json('summary_json'),
    sectionsJson: json('sections_json'),
    sourceFindingIds: json('source_finding_ids'),
    sourceScanRunIds: json('source_scan_run_ids'),
    renderConfig: json('render_config'),
    reviewStatus: varchar('review_status', { length: 20 }).default('unreviewed'),
    approvedBy: varchar('approved_by', { length: 36 }),
    approvedAt: timestamp('approved_at'),
    publishedAt: timestamp('published_at'),
    format: varchar('format', { length: 10 }).notNull(), // md, html, pdf
    content: text('content'),
    filePath: varchar('file_path', { length: 500 }),
    fileSize: bigint('file_size', { mode: 'number' }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskIdIdx: index('reports_task_id_idx').on(table.taskId),
    organizationIdIdx: index('reports_organization_id_idx').on(table.organizationId),
    templateIdIdx: index('reports_template_id_idx').on(table.templateId),
    formatIdx: index('reports_format_idx').on(table.format),
    statusIdx: index('reports_status_idx').on(table.status),
    reportRunIdIdx: index('reports_report_run_id_idx').on(table.reportRunId),
  }),
);

export const taskTypeReportBindingsTable = mysqlTable('task_type_report_bindings', {
  id: varchar('id', { length: 36 }).primaryKey(),
  taskTypeId: varchar('task_type_id', { length: 36 })
    .notNull()
    .references(() => taskTypesTable.id, { onDelete: 'cascade' }),
  templateId: varchar('template_id', { length: 36 })
    .notNull()
    .references(() => reportTemplatesTable.id, { onDelete: 'cascade' }),
  reportType: varchar('report_type', { length: 50 }).notNull(),
  defaultFormat: varchar('default_format', { length: 10 }).notNull().default('md'),
  priority: int('priority').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export const findingRecordsTable = mysqlTable(
  'finding_records',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    taskId: varchar('task_id', { length: 36 }).references(() => attackTasksTable.id, {
      onDelete: 'set null',
    }),
    scanRunId: varchar('scan_run_id', { length: 36 }).references(() => scanRunsTable.id, {
      onDelete: 'set null',
    }),
    reportId: varchar('report_id', { length: 36 }).references(() => reportsTable.id, {
      onDelete: 'set null',
    }),
    vulnerabilityId: varchar('vulnerability_id', { length: 36 }).references(
      () => vulnerabilitiesTable.id,
      { onDelete: 'set null' },
    ),
    platformFamily: varchar('platform_family', { length: 50 }),
    title: varchar('title', { length: 255 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
    confidence: decimal('confidence', { precision: 3, scale: 2 }),
    status: varchar('status', { length: 20 }).notNull().default('open'),
    findingType: varchar('finding_type', { length: 30 }),
    summary: text('summary'),
    description: text('description'),
    impactAnalysis: text('impact_analysis'),
    reproductionConditions: text('reproduction_conditions'),
    reproductionSteps: json('reproduction_steps'),
    observations: json('observations'),
    rootCause: text('root_cause'),
    remediation: text('remediation'),
    verificationNotes: text('verification_notes'),
    frameworkMappings: json('framework_mappings'),
    sourceResultIds: json('source_result_ids'),
    dedupeKey: varchar('dedupe_key', { length: 255 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    taskIdx: index('finding_records_task_id_idx').on(table.taskId),
    scanRunIdx: index('finding_records_scan_run_id_idx').on(table.scanRunId),
    vulnIdx: index('finding_records_vulnerability_id_idx').on(table.vulnerabilityId),
    statusIdx: index('finding_records_status_idx').on(table.status),
    severityIdx: index('finding_records_severity_idx').on(table.severity),
  }),
);

export const findingEvidenceTable = mysqlTable(
  'finding_evidence',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    findingId: varchar('finding_id', { length: 36 })
      .notNull()
      .references(() => findingRecordsTable.id, { onDelete: 'cascade' }),
    evidenceType: varchar('evidence_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content'),
    contentJson: json('content_json'),
    artifactId: varchar('artifact_id', { length: 36 }),
    sourceResultId: varchar('source_result_id', { length: 36 }),
    isRedacted: boolean('is_redacted').notNull().default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    findingIdx: index('finding_evidence_finding_id_idx').on(table.findingId),
    typeIdx: index('finding_evidence_type_idx').on(table.evidenceType),
  }),
);

export const reportRunsTable = mysqlTable(
  'report_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    taskId: varchar('task_id', { length: 36 }).references(() => attackTasksTable.id, {
      onDelete: 'set null',
    }),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    templateId: varchar('template_id', { length: 36 }).notNull(),
    reportType: varchar('report_type', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    inputFindingIds: json('input_finding_ids'),
    inputScanRunIds: json('input_scan_run_ids'),
    renderContext: json('render_context'),
    outputReportId: varchar('output_report_id', { length: 36 }).references(() => reportsTable.id, {
      onDelete: 'set null',
    }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    taskIdx: index('report_runs_task_id_idx').on(table.taskId),
    statusIdx: index('report_runs_status_idx').on(table.status),
  }),
);

export const reportSectionsTable = mysqlTable(
  'report_sections',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    reportRunId: varchar('report_run_id', { length: 36 })
      .notNull()
      .references(() => reportRunsTable.id, { onDelete: 'cascade' }),
    reportId: varchar('report_id', { length: 36 }).references(() => reportsTable.id, {
      onDelete: 'set null',
    }),
    sectionKey: varchar('section_key', { length: 100 }).notNull(),
    sectionTitle: varchar('section_title', { length: 255 }).notNull(),
    contentMd: text('content_md'),
    contentJson: json('content_json'),
    sortOrder: int('sort_order').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('generated'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    reportRunIdx: index('report_sections_report_run_id_idx').on(table.reportRunId),
    reportIdIdx: index('report_sections_report_id_idx').on(table.reportId),
    sectionKeyIdx: index('report_sections_section_key_idx').on(table.sectionKey),
  }),
);

// ============ 被攻击智能体管理 ============

export const targetAgentsTable = mysqlTable(
  'target_agents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: varchar('team_id', { length: 36 }).references(() => teamsTable.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }),
    icon: varchar('icon', { length: 50 }),
    config: json('config'),
    metadata: json('metadata'),
    status: varchar('status', { length: 20 }),
    healthStatus: json('health_status'),
    statistics: json('statistics'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('target_agents_organization_id_idx').on(table.organizationId),
  }),
);

export const agentAttackHistoryTable = mysqlTable(
  'agent_attack_history',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    agentId: varchar('agent_id', { length: 36 })
      .notNull()
      .references(() => targetAgentsTable.id, { onDelete: 'cascade' }),
    taskId: varchar('task_id', { length: 36 })
      .notNull()
      .references(() => attackTasksTable.id, { onDelete: 'cascade' }),
    taskName: varchar('task_name', { length: 255 }),
    status: varchar('status', { length: 20 }),
    vulnerabilitiesFound: json('vulnerabilities_found'),
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    duration: int('duration'),
    reportId: varchar('report_id', { length: 36 }).references(() => reportsTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index('agent_attack_history_agent_id_idx').on(table.agentId),
    taskIdx: index('agent_attack_history_task_id_idx').on(table.taskId),
  }),
);

// ============ 新版资产入库 ============

export const agentAssetsTable = mysqlTable(
  'agent_assets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    teamId: varchar('team_id', { length: 36 }).references(() => teamsTable.id, {
      onDelete: 'set null',
    }),
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
    tags: json('tags'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const assetOwnershipsTable = mysqlTable(
  'asset_ownerships',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    ownerType: varchar('owner_type', { length: 32 }).notNull(),
    userId: varchar('user_id', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    ownerName: varchar('owner_name', { length: 255 }),
    department: varchar('department', { length: 255 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgAssetIdx: index('asset_ownerships_org_asset_idx').on(table.organizationId, table.assetId),
    orgTypeIdx: index('asset_ownerships_org_type_idx').on(table.organizationId, table.ownerType),
    orgUserIdx: index('asset_ownerships_org_user_idx').on(table.organizationId, table.userId),
  }),
);

export const agentAssetComponentsTable = mysqlTable(
  'agent_asset_components',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    componentType: varchar('component_type', { length: 64 }).notNull(),
    componentName: varchar('component_name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    version: varchar('version', { length: 64 }),
    sourceType: varchar('source_type', { length: 64 }),
    sourceRefId: varchar('source_ref_id', { length: 36 }),
    highRisk: boolean('high_risk').notNull().default(false),
    sensitiveLevel: varchar('sensitive_level', { length: 64 }),
    permissionScope: json('permission_scope'),
    configSnapshot: json('config_snapshot'),
    componentFingerprint: varchar('component_fingerprint', { length: 255 }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const agentAssetSnapshotsTable = mysqlTable(
  'agent_asset_snapshots',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    snapshotType: varchar('snapshot_type', { length: 64 }).notNull(),
    version: varchar('version', { length: 64 }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    snapshotJson: json('snapshot_json').notNull(),
    diffFromSnapshotId: varchar('diff_from_snapshot_id', { length: 36 }),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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

export const assetLifecycleEventsTable = mysqlTable(
  'asset_lifecycle_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    fromStatus: varchar('from_status', { length: 64 }),
    toStatus: varchar('to_status', { length: 64 }),
    actorId: varchar('actor_id', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    eventDetail: json('event_detail'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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

export const platformConnectorsTable = mysqlTable(
  'platform_connectors',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    platformFamily: varchar('platform_family', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    endpoint: varchar('endpoint', { length: 500 }),
    credentialRef: varchar('credential_ref', { length: 36 }),
    syncConfig: json('sync_config'),
    status: varchar('status', { length: 32 }).notNull().default('disabled'),
    lastSyncAt: timestamp('last_sync_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('platform_connectors_org_idx').on(table.organizationId),
    orgPlatformIdx: index('platform_connectors_org_platform_idx').on(
      table.organizationId,
      table.platformFamily,
    ),
  }),
);

export const platformDiscoveredAssetsTable = mysqlTable(
  'platform_discovered_assets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    connectorId: varchar('connector_id', { length: 36 }).references(
      () => platformConnectorsTable.id,
      {
        onDelete: 'set null',
      },
    ),
    platformFamily: varchar('platform_family', { length: 64 }).notNull(),
    externalId: varchar('external_id', { length: 255 }).notNull(),
    rawName: varchar('raw_name', { length: 255 }).notNull(),
    rawStatus: varchar('raw_status', { length: 64 }),
    guessTeam: varchar('guess_team', { length: 255 }),
    claimStatus: varchar('claim_status', { length: 32 }).notNull().default('pending'),
    claimedAssetId: varchar('claimed_asset_id', { length: 36 }).references(
      () => agentAssetsTable.id,
      {
        onDelete: 'set null',
      },
    ),
    rawPayload: json('raw_payload'),
    discoveredAt: timestamp('discovered_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const assetIngestJobsTable = mysqlTable(
  'asset_ingest_jobs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    jobType: varchar('job_type', { length: 64 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    totalCount: int('total_count').notNull().default(0),
    successCount: int('success_count').notNull().default(0),
    failedCount: int('failed_count').notNull().default(0),
    inputJson: json('input_json'),
    resultJson: json('result_json'),
    errorMessage: text('error_message'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgStatusIdx: index('asset_ingest_jobs_org_status_idx').on(table.organizationId, table.status),
    orgTypeIdx: index('asset_ingest_jobs_org_type_idx').on(table.organizationId, table.jobType),
  }),
);

// ============ 系统配置 ============

export const systemConfigsTable = mysqlTable(
  'system_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    category: varchar('category', { length: 50 }).notNull(), // global, feature, integration, notification, security
    key: varchar('key', { length: 255 }).notNull(),
    value: json('value'),
    type: varchar('type', { length: 20 }).notNull(), // string, number, boolean, json, array
    description: text('description'),
    editable: boolean('editable').default(true),
    requiresRestart: boolean('requires_restart').default(false),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    categoryIdx: index('system_configs_category_idx').on(table.category),
    keyIdx: uniqueIndex('system_configs_key_unique').on(table.key),
  }),
);

export const featureFlagsTable = mysqlTable(
  'feature_flags',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    enabled: boolean('enabled').default(false),
    description: text('description'),
    affects: json('affects'), // 影响的功能模块数组
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('feature_flags_name_unique').on(table.name),
    enabledIdx: index('feature_flags_enabled_idx').on(table.enabled),
  }),
);

export const integrationConfigsTable = mysqlTable(
  'integration_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // llm, vector_db, payment, sso, webhook, email, sms
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 100 }),
    config: json('config'),
    enabled: boolean('enabled').default(false),
    testStatus: varchar('test_status', { length: 20 }), // success, failed, pending
    lastTested: timestamp('last_tested'),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    typeIdx: index('integration_configs_type_idx').on(table.type),
    enabledIdx: index('integration_configs_enabled_idx').on(table.enabled),
  }),
);

export const agentGovDepartmentsTable = mysqlTable(
  'agent_gov_departments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    deptType: varchar('dept_type', { length: 64 }),
    lead: varchar('lead', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_departments_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_departments_org_idx').on(table.organizationId),
  }),
);

export const agentGovBusinessScenesTable = mysqlTable(
  'agent_gov_business_scenes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_business_scenes_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_business_scenes_org_idx').on(table.organizationId),
  }),
);

export const agentGovBusinessSystemsTable = mysqlTable(
  'agent_gov_business_systems',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    departmentName: varchar('department_name', { length: 255 }),
    sceneName: varchar('scene_name', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgNameUidx: uniqueIndex('agent_gov_business_systems_org_name_uidx').on(
      table.organizationId,
      table.name,
    ),
    orgIdx: index('agent_gov_business_systems_org_idx').on(table.organizationId),
  }),
);

export const agentGovOwnersTable = mysqlTable(
  'agent_gov_owners',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    ownerType: varchar('owner_type', { length: 32 }).notNull(),
    departmentName: varchar('department_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const managedLlmModelsTable = mysqlTable(
  'managed_llm_models',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    modelKey: varchar('model_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    healthStatus: varchar('health_status', { length: 20 }).notNull().default('unknown'),
    quotaMonthly: int('quota_monthly').notNull().default(100000),
    quotaUsed: int('quota_used').notNull().default(0),
    providerConfig: json('provider_config'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    orgIdx: index('managed_llm_models_org_idx').on(table.organizationId),
    orgStatusIdx: index('managed_llm_models_org_status_idx').on(table.organizationId, table.status),
  }),
);

export const notificationConfigsTable = mysqlTable(
  'notification_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // email, sms, webhook, slack, teams
    enabled: boolean('enabled').default(false),
    config: json('config'),
    templates: json('templates'),
    rules: json('rules'),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    typeIdx: index('notification_configs_type_idx').on(table.type),
    enabledIdx: index('notification_configs_enabled_idx').on(table.enabled),
  }),
);

export const securityPoliciesTable = mysqlTable(
  'security_policies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(), // password, api_key, session, ip_whitelist, rate_limit, audit
    config: json('config'),
    enabled: boolean('enabled').default(false),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    typeIdx: index('security_policies_type_idx').on(table.type),
    enabledIdx: index('security_policies_enabled_idx').on(table.enabled),
  }),
);

// ============ 检测扫描 ============

export const securityScanTasksTable = mysqlTable(
  'security_scan_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    assetId: varchar('asset_id', { length: 36 }).references(() => agentAssetsTable.id, {
      onDelete: 'set null',
    }),
    assetCode: varchar('asset_code', { length: 64 }),
    assetName: varchar('asset_name', { length: 255 }),
    assetVersion: varchar('asset_version', { length: 64 }),
    assetSnapshotId: varchar('asset_snapshot_id', { length: 36 }).references(
      () => agentAssetSnapshotsTable.id,
      { onDelete: 'set null' },
    ),
    componentVersions: json('component_versions'),
    name: varchar('name', { length: 255 }).notNull(),
    source: varchar('source', { length: 64 }).notNull().default('asset_ledger'),
    scanType: varchar('scan_type', { length: 64 }).notNull().default('security_baseline'),
    targetKind: varchar('target_kind', { length: 64 }).notNull().default('agent'),
    targetSummary: varchar('target_summary', { length: 500 }),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    progress: int('progress').notNull().default(0),
    highCount: int('high_count').notNull().default(0),
    mediumCount: int('medium_count').notNull().default(0),
    lowCount: int('low_count').notNull().default(0),
    ownerName: varchar('owner_name', { length: 255 }),
    runConfig: json('run_config'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityScanTaskPlansTable = mysqlTable(
  'security_scan_task_plans',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    taskId: varchar('task_id', { length: 36 })
      .notNull()
      .references(() => securityScanTasksTable.id, { onDelete: 'cascade' }),
    probeType: varchar('probe_type', { length: 64 }).notNull(),
    strategy: varchar('strategy', { length: 255 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    libIds: json('lib_ids'),
    caseCount: int('case_count').notNull().default(0),
    targets: json('targets'),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityCaseLibrariesTable = mysqlTable(
  'security_case_libraries',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    libraryKey: varchar('library_key', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 64 }).notNull(),
    description: text('description').notNull(),
    caseCount: int('case_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    defaultLevel: varchar('default_level', { length: 32 }).notNull().default('medium'),
    detectMethod: varchar('detect_method', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    standards: json('standards'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityTestCasesTable = mysqlTable(
  'security_test_cases',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    libraryId: varchar('library_id', { length: 36 })
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
    tags: json('tags'),
    sortOrder: int('sort_order').notNull().default(0),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const complianceTaskTemplatesTable = mysqlTable(
  'compliance_task_templates',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    templateKey: varchar('template_key', { length: 128 }),
    name: varchar('name', { length: 255 }).notNull(),
    domain: varchar('domain', { length: 128 }).notNull(),
    scope: varchar('scope', { length: 512 }).notNull().default(''),
    description: text('description'),
    libraryKeys: json('library_keys'),
    sampleTypes: json('sample_types'),
    assessScenario: varchar('assess_scenario', { length: 64 }).notNull().default('launch'),
    creationMode: varchar('creation_mode', { length: 32 }).notNull().default('manual'),
    libCount: int('lib_count').notNull().default(0),
    caseCount: int('case_count').notNull().default(0),
    icon: varchar('icon', { length: 32 }),
    tags: json('tags'),
    ownerName: varchar('owner_name', { length: 128 }),
    isSystem: boolean('is_system').notNull().default(false),
    usageCount: int('usage_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const complianceRegulationMappingsTable = mysqlTable(
  'compliance_regulation_mappings',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    mappingKey: varchar('mapping_key', { length: 128 }).notNull(),
    law: varchar('law', { length: 512 }).notNull(),
    article: varchar('article', { length: 512 }).notNull(),
    rule: varchar('rule', { length: 512 }).notNull(),
    sourceText: text('source_text'),
    caseIds: json('case_ids'),
    libraryId: varchar('library_id', { length: 36 }).references(
      () => securityCaseLibrariesTable.id,
      {
        onDelete: 'set null',
      },
    ),
    policyId: varchar('policy_id', { length: 128 }),
    riskType: varchar('risk_type', { length: 128 }).notNull().default('合规风险'),
    status: varchar('status', { length: 64 }).notNull().default('已映射'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const capabilityComponentRegistryTable = mysqlTable(
  'capability_component_registry',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    componentKind: varchar('component_kind', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    version: varchar('version', { length: 64 }),
    description: text('description'),
    source: varchar('source', { length: 255 }),
    permissionScope: json('permission_scope'),
    checks: json('checks'),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    riskTitle: varchar('risk_title', { length: 255 }),
    enabled: boolean('enabled').notNull().default(true),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    hasPackage: boolean('has_package').notNull().default(false),
    lastDetectedAt: timestamp('last_detected_at'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    orgKindIdx: index('cap_comp_reg_org_kind_idx').on(table.organizationId, table.componentKind),
    orgKeyIdx: index('cap_comp_reg_org_key_idx').on(table.organizationId, table.componentKey),
    orgLevelIdx: index('cap_comp_reg_org_level_idx').on(table.organizationId, table.riskLevel),
  }),
);

export const capabilityComponentArtifactsTable = mysqlTable(
  'capability_component_artifacts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    registryId: varchar('registry_id', { length: 36 })
      .notNull()
      .references(() => capabilityComponentRegistryTable.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 512 }).notNull(),
    contentHash: varchar('content_hash', { length: 128 }).notNull(),
    storagePath: varchar('storage_path', { length: 1024 }).notNull(),
    fileSize: int('file_size').notNull().default(0),
    fileTreeJson: json('file_tree_json'),
    skillMdExcerpt: text('skill_md_excerpt'),
    isCurrent: boolean('is_current').notNull().default(true),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgRegIdx: index('cap_comp_art_org_reg_idx').on(table.organizationId, table.registryId),
    hashIdx: index('cap_comp_art_hash_idx').on(table.organizationId, table.contentHash),
  }),
);

export const capabilityRiskLibrariesTable = mysqlTable(
  'capability_risk_libraries',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    registryId: varchar('registry_id', { length: 36 }),
    componentKind: varchar('component_kind', { length: 64 }).notNull(),
    componentName: varchar('component_name', { length: 255 }).notNull(),
    componentKey: varchar('component_key', { length: 255 }),
    riskTitle: varchar('risk_title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    source: varchar('source', { length: 255 }),
    affectedAssets: int('affected_assets').notNull().default(0),
    ruleCount: int('rule_count').notNull().default(0),
    description: text('description').notNull(),
    checks: json('checks'),
    enabled: boolean('enabled').notNull().default(true),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const capabilityRiskRulesTable = mysqlTable(
  'capability_risk_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    riskLibraryId: varchar('risk_library_id', { length: 36 })
      .notNull()
      .references(() => capabilityRiskLibrariesTable.id, { onDelete: 'cascade' }),
    ruleCode: varchar('rule_code', { length: 128 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    checkTarget: varchar('check_target', { length: 128 }).notNull(),
    ruleType: varchar('rule_type', { length: 64 }).notNull().default('static'),
    severity: varchar('severity', { length: 32 }).notNull().default('medium'),
    ruleConfig: json('rule_config'),
    remediation: text('remediation'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const assetComponentRiskLinksTable = mysqlTable(
  'asset_component_risk_links',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    assetId: varchar('asset_id', { length: 36 })
      .notNull()
      .references(() => agentAssetsTable.id, { onDelete: 'cascade' }),
    componentId: varchar('component_id', { length: 36 }).references(
      () => agentAssetComponentsTable.id,
      {
        onDelete: 'set null',
      },
    ),
    riskLibraryId: varchar('risk_library_id', { length: 36 })
      .notNull()
      .references(() => capabilityRiskLibrariesTable.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    confidence: decimal('confidence', { precision: 5, scale: 2 }),
    evidence: json('evidence'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityScanFindingsTable = mysqlTable(
  'security_scan_findings',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    taskId: varchar('task_id', { length: 36 })
      .notNull()
      .references(() => securityScanTasksTable.id, { onDelete: 'cascade' }),
    assetId: varchar('asset_id', { length: 36 }).references(() => agentAssetsTable.id, {
      onDelete: 'set null',
    }),
    assetVersion: varchar('asset_version', { length: 64 }),
    assetSnapshotId: varchar('asset_snapshot_id', { length: 36 }).references(
      () => agentAssetSnapshotsTable.id,
      { onDelete: 'set null' },
    ),
    componentVersions: json('component_versions'),
    caseLibraryId: varchar('case_library_id', { length: 36 }).references(
      () => securityCaseLibrariesTable.id,
      {
        onDelete: 'set null',
      },
    ),
    testCaseId: varchar('test_case_id', { length: 36 }).references(
      () => securityTestCasesTable.id,
      {
        onDelete: 'set null',
      },
    ),
    title: varchar('title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    category: varchar('category', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    description: text('description').notNull(),
    evidence: json('evidence'),
    recommendation: text('recommendation'),
    remediationTaskId: varchar('remediation_task_id', { length: 36 }),
    acceptedReason: text('accepted_reason'),
    detectedAt: timestamp('detected_at').defaultNow().notNull(),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityRemediationTasksTable = mysqlTable(
  'security_remediation_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    findingId: varchar('finding_id', { length: 36 })
      .notNull()
      .references(() => securityScanFindingsTable.id, { onDelete: 'cascade' }),
    taskId: varchar('task_id', { length: 36 }).references(() => securityScanTasksTable.id, {
      onDelete: 'set null',
    }),
    assetId: varchar('asset_id', { length: 36 }).references(() => agentAssetsTable.id, {
      onDelete: 'set null',
    }),
    sourceAssetVersion: varchar('source_asset_version', { length: 64 }),
    sourceSnapshotId: varchar('source_snapshot_id', { length: 36 }).references(
      () => agentAssetSnapshotsTable.id,
      { onDelete: 'set null' },
    ),
    targetAssetVersion: varchar('target_asset_version', { length: 64 }),
    targetSnapshotId: varchar('target_snapshot_id', { length: 36 }).references(
      () => agentAssetSnapshotsTable.id,
      { onDelete: 'set null' },
    ),
    title: varchar('title', { length: 255 }).notNull(),
    riskLevel: varchar('risk_level', { length: 32 }).notNull().default('medium'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    ownerName: varchar('owner_name', { length: 255 }),
    ownerId: varchar('owner_id', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    dueAt: timestamp('due_at'),
    remediationAdvice: text('remediation_advice').notNull(),
    evidenceSummary: text('evidence_summary'),
    retestStatus: varchar('retest_status', { length: 32 }).notNull().default('not_started'),
    finalDecision: varchar('final_decision', { length: 32 }),
    metadata: json('metadata'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    updatedBy: varchar('updated_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
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

export const securityRemediationEvidenceTable = mysqlTable(
  'security_remediation_evidence',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    remediationTaskId: varchar('remediation_task_id', { length: 36 })
      .notNull()
      .references(() => securityRemediationTasksTable.id, { onDelete: 'cascade' }),
    evidenceType: varchar('evidence_type', { length: 64 }).notNull().default('text'),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    attachments: json('attachments'),
    submittedBy: varchar('submitted_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  },
  (table) => ({
    orgTaskIdx: index('security_remediation_evidence_org_task_idx').on(
      table.organizationId,
      table.remediationTaskId,
    ),
  }),
);

export const securityRetestRecordsTable = mysqlTable(
  'security_retest_records',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    remediationTaskId: varchar('remediation_task_id', { length: 36 })
      .notNull()
      .references(() => securityRemediationTasksTable.id, { onDelete: 'cascade' }),
    findingId: varchar('finding_id', { length: 36 }).references(
      () => securityScanFindingsTable.id,
      {
        onDelete: 'set null',
      },
    ),
    retestTaskId: varchar('retest_task_id', { length: 36 }).references(
      () => securityScanTasksTable.id,
      {
        onDelete: 'set null',
      },
    ),
    retestAssetVersion: varchar('retest_asset_version', { length: 64 }),
    retestSnapshotId: varchar('retest_snapshot_id', { length: 36 }).references(
      () => agentAssetSnapshotsTable.id,
      { onDelete: 'set null' },
    ),
    result: varchar('result', { length: 32 }).notNull().default('pending'),
    conclusion: text('conclusion'),
    evidence: json('evidence'),
    createdBy: varchar('created_by', { length: 36 }).references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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

// ============ Dify 插件系统 ============

export const difyPluginsTable = mysqlTable(
  'dify_plugins',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    author: varchar('author', { length: 255 }),
    homepage: varchar('homepage', { length: 500 }),
    enabled: boolean('enabled').notNull().default(true),
    metadata: text('metadata'),
    installedAt: timestamp('installed_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    enabledIdx: index('dify_plugins_enabled_idx').on(table.enabled),
  }),
);

export const difyTargetConfigsTable = mysqlTable(
  'dify_target_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    source: varchar('source', { length: 50 }).notNull(),
    config: json('config').notNull(),
    pluginId: varchar('plugin_id', { length: 36 }).references(() => difyPluginsTable.id, {
      onDelete: 'set null',
    }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    sourceIdx: index('dify_target_configs_source_idx').on(table.source),
  }),
);

export const difyJudgeConfigsTable = mysqlTable(
  'dify_judge_configs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    apiBaseUrl: varchar('api_base_url', { length: 500 }),
    apiKey: varchar('api_key', { length: 500 }),
    temperature: decimal('temperature', { precision: 3, scale: 2 }).default('0'),
    pluginId: varchar('plugin_id', { length: 36 }).references(() => difyPluginsTable.id, {
      onDelete: 'set null',
    }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    providerIdx: index('dify_judge_configs_provider_idx').on(table.provider),
  }),
);

export const difyAttackCategoriesTable = mysqlTable(
  'dify_attack_categories',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }),
    description: text('description'),
    parentId: varchar('parent_id', { length: 36 }),
    source: varchar('source', { length: 50 }).notNull().default('built-in'),
    pluginId: varchar('plugin_id', { length: 36 }).references(() => difyPluginsTable.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    parentIdx: index('dify_attack_categories_parent_idx').on(table.parentId),
    sourceIdx: index('dify_attack_categories_source_idx').on(table.source),
  }),
);

export const difyAttackCommandsTable = mysqlTable(
  'dify_attack_commands',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }),
    riskLevel: varchar('risk_level', { length: 20 }),
    content: text('content').notNull(),
    categoryId: varchar('category_id', { length: 36 }),
    source: varchar('source', { length: 50 }).notNull().default('built-in'),
    pluginId: varchar('plugin_id', { length: 36 }).references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    enabled: boolean('enabled').notNull().default(true),
    version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
    attackTarget: text('attack_target'),
    expectedSuccess: text('expected_success'),
    nonVulnerability: text('non_vulnerability'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => ({
    categoryIdx: index('dify_attack_commands_category_idx').on(table.categoryId),
    sourceIdx: index('dify_attack_commands_source_idx').on(table.source),
    pluginIdx: index('dify_attack_commands_plugin_idx').on(table.pluginId),
    enabledIdx: index('dify_attack_commands_enabled_idx').on(table.enabled),
  }),
);

// ============ Relations ============

export const organizationsRelations = relations(organizationsTable, ({ many, one }) => ({
  teams: many(teamsTable),
  users: many(usersTable),
  subscriptions: one(organizationSubscriptionsTable),
  attackTasks: many(attackTasksTable),
  // Audit logs live in enterprise schema; relation omitted here to avoid cross-schema type issues
  targetAgents: many(targetAgentsTable),
}));

export const teamsRelations = relations(teamsTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [teamsTable.organizationId],
    references: [organizationsTable.id],
  }),
  userTeams: many(userTeamsTable),
}));

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [usersTable.organizationId],
    references: [organizationsTable.id],
  }),
  userTeams: many(userTeamsTable),
  // User activities live in enterprise schema; relation omitted here
  attackTasks: many(attackTasksTable),
}));

export const taskTypesRelations = relations(taskTypesTable, ({ many }) => ({
  attackTasks: many(attackTasksTable),
  reportBindings: many(taskTypeReportBindingsTable),
}));

export const attackTasksRelations = relations(attackTasksTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [attackTasksTable.organizationId],
    references: [organizationsTable.id],
  }),
  user: one(usersTable, {
    fields: [attackTasksTable.userId],
    references: [usersTable.id],
  }),
  taskType: one(taskTypesTable, {
    fields: [attackTasksTable.taskTypeId],
    references: [taskTypesTable.id],
  }),
  attackResults: many(attackResultsTable),
  scanRuns: many(scanRunsTable),
  findingRecords: many(findingRecordsTable),
  reportRuns: many(reportRunsTable),
}));

export const scanRunsRelations = relations(scanRunsTable, ({ one, many }) => ({
  task: one(attackTasksTable, {
    fields: [scanRunsTable.taskId],
    references: [attackTasksTable.id],
  }),
  artifacts: many(scanArtifactsTable),
  attackResults: many(attackResultsTable),
  findingRecords: many(findingRecordsTable),
}));

export const scanArtifactsRelations = relations(scanArtifactsTable, ({ one }) => ({
  scanRun: one(scanRunsTable, {
    fields: [scanArtifactsTable.scanRunId],
    references: [scanRunsTable.id],
  }),
}));

export const findingRecordsRelations = relations(findingRecordsTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [findingRecordsTable.organizationId],
    references: [organizationsTable.id],
  }),
  task: one(attackTasksTable, {
    fields: [findingRecordsTable.taskId],
    references: [attackTasksTable.id],
  }),
  scanRun: one(scanRunsTable, {
    fields: [findingRecordsTable.scanRunId],
    references: [scanRunsTable.id],
  }),
  report: one(reportsTable, {
    fields: [findingRecordsTable.reportId],
    references: [reportsTable.id],
  }),
  vulnerability: one(vulnerabilitiesTable, {
    fields: [findingRecordsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
  evidence: many(findingEvidenceTable),
}));

export const findingEvidenceRelations = relations(findingEvidenceTable, ({ one }) => ({
  finding: one(findingRecordsTable, {
    fields: [findingEvidenceTable.findingId],
    references: [findingRecordsTable.id],
  }),
}));

export const reportRunsRelations = relations(reportRunsTable, ({ one, many }) => ({
  task: one(attackTasksTable, {
    fields: [reportRunsTable.taskId],
    references: [attackTasksTable.id],
  }),
  organization: one(organizationsTable, {
    fields: [reportRunsTable.organizationId],
    references: [organizationsTable.id],
  }),
  outputReport: one(reportsTable, {
    fields: [reportRunsTable.outputReportId],
    references: [reportsTable.id],
  }),
  sections: many(reportSectionsTable),
}));

export const reportSectionsRelations = relations(reportSectionsTable, ({ one }) => ({
  reportRun: one(reportRunsTable, {
    fields: [reportSectionsTable.reportRunId],
    references: [reportRunsTable.id],
  }),
  report: one(reportsTable, {
    fields: [reportSectionsTable.reportId],
    references: [reportsTable.id],
  }),
}));

export const taskTypeReportBindingsRelations = relations(
  taskTypeReportBindingsTable,
  ({ one }) => ({
    taskType: one(taskTypesTable, {
      fields: [taskTypeReportBindingsTable.taskTypeId],
      references: [taskTypesTable.id],
    }),
    template: one(reportTemplatesTable, {
      fields: [taskTypeReportBindingsTable.templateId],
      references: [reportTemplatesTable.id],
    }),
  }),
);

// ============ 新增表的关联关系 ============

export const subscriptionPlansRelations = relations(subscriptionPlansTable, ({ many }) => ({
  subscriptions: many(organizationSubscriptionsTable),
}));

export const organizationSubscriptionsRelations = relations(
  organizationSubscriptionsTable,
  ({ one }) => ({
    organization: one(organizationsTable, {
      fields: [organizationSubscriptionsTable.organizationId],
      references: [organizationsTable.id],
    }),
    plan: one(subscriptionPlansTable, {
      fields: [organizationSubscriptionsTable.planId],
      references: [subscriptionPlansTable.id],
    }),
  }),
);

export const vulnerabilitiesRelations = relations(vulnerabilitiesTable, ({ one, many }) => ({
  createdBy: one(usersTable, {
    fields: [vulnerabilitiesTable.createdBy],
    references: [usersTable.id],
  }),
  updatedBy: one(usersTable, {
    fields: [vulnerabilitiesTable.updatedBy],
    references: [usersTable.id],
  }),
  attackCommands: many(attackCommandsTable),
  detectionRules: many(detectionRulesTable),
  solutions: many(solutionsTable),
  successIndicators: many(successIndicatorsTable),
  failureIndicators: many(failureIndicatorsTable),
  wafRules: many(wafRulesTable),
  llmReviewInstructions: many(llmReviewInstructionsTable),
  agentGuardStrategies: many(agentGuardStrategiesTable),
  socAlertRules: many(socAlertRulesTable),
  complianceStatements: many(complianceStatementsTable),
  configSignatures: many(configSignaturesTable),
  graphDetectionRules: many(graphDetectionRulesTable),
  validationFixtures: many(validationFixturesTable),
}));

export const attackCommandsRelations = relations(attackCommandsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [attackCommandsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const detectionRulesRelations = relations(detectionRulesTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [detectionRulesTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const solutionsRelations = relations(solutionsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [solutionsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const successIndicatorsRelations = relations(successIndicatorsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [successIndicatorsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const failureIndicatorsRelations = relations(failureIndicatorsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [failureIndicatorsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const wafRulesRelations = relations(wafRulesTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [wafRulesTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const llmReviewInstructionsRelations = relations(llmReviewInstructionsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [llmReviewInstructionsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const agentGuardStrategiesRelations = relations(agentGuardStrategiesTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [agentGuardStrategiesTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const socAlertRulesRelations = relations(socAlertRulesTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [socAlertRulesTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const complianceStatementsRelations = relations(complianceStatementsTable, ({ one }) => ({
  vulnerability: one(vulnerabilitiesTable, {
    fields: [complianceStatementsTable.vulnerabilityId],
    references: [vulnerabilitiesTable.id],
  }),
}));

export const reportTemplatesRelations = relations(reportTemplatesTable, ({ many }) => ({
  reports: many(reportsTable),
  taskTypeReportBindings: many(taskTypeReportBindingsTable),
}));

export const reportsRelations = relations(reportsTable, ({ one, many }) => ({
  task: one(attackTasksTable, {
    fields: [reportsTable.taskId],
    references: [attackTasksTable.id],
  }),
  organization: one(organizationsTable, {
    fields: [reportsTable.organizationId],
    references: [organizationsTable.id],
  }),
  template: one(reportTemplatesTable, {
    fields: [reportsTable.templateId],
    references: [reportTemplatesTable.id],
  }),
  findingRecords: many(findingRecordsTable),
}));

export const systemConfigsRelations = relations(systemConfigsTable, ({ one }) => ({
  updatedBy: one(usersTable, {
    fields: [systemConfigsTable.updatedBy],
    references: [usersTable.id],
  }),
}));

export const featureFlagsRelations = relations(featureFlagsTable, ({ one }) => ({
  updatedBy: one(usersTable, {
    fields: [featureFlagsTable.updatedBy],
    references: [usersTable.id],
  }),
}));

export const integrationConfigsRelations = relations(integrationConfigsTable, ({ one }) => ({
  updatedBy: one(usersTable, {
    fields: [integrationConfigsTable.updatedBy],
    references: [usersTable.id],
  }),
}));

export const managedLlmModelsRelations = relations(managedLlmModelsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [managedLlmModelsTable.organizationId],
    references: [organizationsTable.id],
  }),
}));

export const notificationConfigsRelations = relations(notificationConfigsTable, ({ one }) => ({
  updatedBy: one(usersTable, {
    fields: [notificationConfigsTable.updatedBy],
    references: [usersTable.id],
  }),
}));

export const securityPoliciesRelations = relations(securityPoliciesTable, ({ one }) => ({
  updatedBy: one(usersTable, {
    fields: [securityPoliciesTable.updatedBy],
    references: [usersTable.id],
  }),
}));

// ============ Dify 插件系统关联关系 ============

export const difyPluginsRelations = relations(difyPluginsTable, ({ many }) => ({
  targetConfigs: many(difyTargetConfigsTable),
  judgeConfigs: many(difyJudgeConfigsTable),
  attackCategories: many(difyAttackCategoriesTable),
  attackCommands: many(difyAttackCommandsTable),
}));

export const difyTargetConfigsRelations = relations(difyTargetConfigsTable, ({ one }) => ({
  plugin: one(difyPluginsTable, {
    fields: [difyTargetConfigsTable.pluginId],
    references: [difyPluginsTable.id],
  }),
}));

export const difyJudgeConfigsRelations = relations(difyJudgeConfigsTable, ({ one }) => ({
  plugin: one(difyPluginsTable, {
    fields: [difyJudgeConfigsTable.pluginId],
    references: [difyPluginsTable.id],
  }),
}));

export const difyAttackCategoriesRelations = relations(
  difyAttackCategoriesTable,
  ({ one, many }) => ({
    plugin: one(difyPluginsTable, {
      fields: [difyAttackCategoriesTable.pluginId],
      references: [difyPluginsTable.id],
    }),
    attackCommands: many(difyAttackCommandsTable),
  }),
);

export const difyAttackCommandsRelations = relations(difyAttackCommandsTable, ({ one }) => ({
  plugin: one(difyPluginsTable, {
    fields: [difyAttackCommandsTable.pluginId],
    references: [difyPluginsTable.id],
  }),
  category: one(difyAttackCategoriesTable, {
    fields: [difyAttackCommandsTable.categoryId],
    references: [difyAttackCategoriesTable.id],
  }),
}));
