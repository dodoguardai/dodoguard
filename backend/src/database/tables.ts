import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  type AtomicTestCase,
  type CompletedPrompt,
  type EvaluateSummaryV2,
  type GradingResult,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
  type UnifiedConfig,
} from '../types/index';

import type { ModelAuditScanResults } from '../types/modelAudit';

// ------------ Prompts ------------

export const promptsTable = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    prompt: text('prompt').notNull(),
  },
  (table) => ({
    createdAtIdx: index('prompts_created_at_idx').on(table.createdAt),
  }),
);

// ------------ Tags ------------

export const tagsTable = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    nameIdx: index('tags_name_idx').on(table.name),
    uniqueNameValue: uniqueIndex('tags_name_value_unique').on(table.name, table.value),
  }),
);

// ------------ Evals ------------

export const evalsTable = sqliteTable(
  'evals',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    author: text('author'),
    description: text('description'),
    results: text('results', { mode: 'json' }).$type<EvaluateSummaryV2 | object>().notNull(),
    config: text('config', { mode: 'json' }).$type<Partial<UnifiedConfig>>().notNull(),
    prompts: text('prompts', { mode: 'json' }).$type<CompletedPrompt[]>(),
    vars: text('vars', { mode: 'json' }).$type<string[]>(),
    runtimeOptions: text('runtime_options', { mode: 'json' }).$type<
      Partial<import('../types').EvaluateOptions>
    >(),
    isRedteam: integer('is_redteam', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    createdAtIdx: index('evals_created_at_idx').on(table.createdAt),
    authorIdx: index('evals_author_idx').on(table.author),
    isRedteamIdx: index('evals_is_redteam_idx').on(table.isRedteam),
  }),
);

export const evalResultsTable = sqliteTable(
  'eval_results',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    promptIdx: integer('prompt_idx').notNull(),
    testIdx: integer('test_idx').notNull(),

    testCase: text('test_case', { mode: 'json' }).$type<AtomicTestCase>().notNull(),
    prompt: text('prompt', { mode: 'json' }).$type<Prompt>().notNull(),
    promptId: text('prompt_id').references(() => promptsTable.id),

    // Provider-related fields
    provider: text('provider', { mode: 'json' }).$type<ProviderOptions>().notNull(),

    latencyMs: integer('latency_ms'),
    cost: real('cost'),

    // Output-related fields
    response: text('response', { mode: 'json' }).$type<ProviderResponse>(),
    error: text('error'),
    failureReason: integer('failure_reason').default(ResultFailureReason.NONE).notNull(),

    // Result-related fields
    success: integer('success', { mode: 'boolean' }).notNull(),
    score: real('score').notNull(),
    gradingResult: text('grading_result', { mode: 'json' }).$type<GradingResult>(),
    namedScores: text('named_scores', { mode: 'json' }).$type<Record<string, number>>(),

    // Metadata fields
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, string>>(),
  },
  (table) => ({
    evalIdIdx: index('eval_result_eval_id_idx').on(table.evalId),
    testIdxIdx: index('eval_result_test_idx').on(table.testIdx),

    evalTestIdx: index('eval_result_eval_test_idx').on(table.evalId, table.testIdx),
    evalSuccessIdx: index('eval_result_eval_success_idx').on(table.evalId, table.success),
    evalFailureIdx: index('eval_result_eval_failure_idx').on(table.evalId, table.failureReason),
    evalTestSuccessIdx: index('eval_result_eval_test_success_idx').on(
      table.evalId,
      table.testIdx,
      table.success,
    ),

    responseIdx: index('eval_result_response_idx').on(table.response),

    gradingResultReasonIdx: index('eval_result_grading_result_reason_idx').on(
      sql`json_extract(${table.gradingResult}, '$.reason')`,
    ),
    gradingResultCommentIdx: index('eval_result_grading_result_comment_idx').on(
      sql`json_extract(${table.gradingResult}, '$.comment')`,
    ),
    testCaseVarsIdx: index('eval_result_test_case_vars_idx').on(
      sql`json_extract(${table.testCase}, '$.vars')`,
    ),
    testCaseMetadataIdx: index('eval_result_test_case_metadata_idx').on(
      sql`json_extract(${table.metadata}, '$')`,
    ),
    namedScoresIdx: index('eval_result_named_scores_idx').on(
      sql`json_extract(${table.namedScores}, '$')`,
    ),
    metadataIdx: index('eval_result_metadata_idx').on(sql`json_extract(${table.metadata}, '$')`),

    metadataPluginIdIdx: index('eval_result_metadata_plugin_id_idx').on(
      sql`json_extract(${table.metadata}, '$.pluginId')`,
    ),
    metadataStrategyIdIdx: index('eval_result_metadata_strategy_id_idx').on(
      sql`json_extract(${table.metadata}, '$.strategyId')`,
    ),
  }),
);

export const evalsToPromptsTable = sqliteTable(
  'evals_to_prompts',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id, { onDelete: 'cascade' }),
    promptId: text('prompt_id')
      .notNull()
      .references(() => promptsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.promptId] }),
    evalIdIdx: index('evals_to_prompts_eval_id_idx').on(t.evalId),
    promptIdIdx: index('evals_to_prompts_prompt_id_idx').on(t.promptId),
  }),
);

export const promptsRelations = relations(promptsTable, ({ many }) => ({
  evalsToPrompts: many(evalsToPromptsTable),
}));

export const evalsToTagsTable = sqliteTable(
  'evals_to_tags',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tagsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.tagId] }),
    evalIdIdx: index('evals_to_tags_eval_id_idx').on(t.evalId),
    tagIdIdx: index('evals_to_tags_tag_id_idx').on(t.tagId),
  }),
);

export const tagsRelations = relations(tagsTable, ({ many }) => ({
  evalsToTags: many(evalsToTagsTable),
}));

export const evalsToTagsRelations = relations(evalsToTagsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToTagsTable.evalId],
    references: [evalsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [evalsToTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

// ------------ Datasets ------------

export const datasetsTable = sqliteTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    tests: text('tests', { mode: 'json' }).$type<UnifiedConfig['tests']>(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index('datasets_created_at_idx').on(table.createdAt),
  }),
);

export const evalsToDatasetsTable = sqliteTable(
  'evals_to_datasets',
  {
    evalId: text('eval_id')
      .notNull()
      .references(() => evalsTable.id),
    // Drizzle doesn't support this migration for sqlite, so we remove foreign keys manually.
    //.references(() => evals.id, { onDelete: 'cascade' }),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasetsTable.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evalId, t.datasetId] }),
    evalIdIdx: index('evals_to_datasets_eval_id_idx').on(t.evalId),
    datasetIdIdx: index('evals_to_datasets_dataset_id_idx').on(t.datasetId),
  }),
);

export const datasetsRelations = relations(datasetsTable, ({ many }) => ({
  evalsToDatasets: many(evalsToDatasetsTable),
}));

// ------------ Evals ------------

export const evalsRelations = relations(evalsTable, ({ many }) => ({
  evalsToPrompts: many(evalsToPromptsTable),
  evalsToDatasets: many(evalsToDatasetsTable),
  evalsToTags: many(evalsToTagsTable),
}));

export const evalsToPromptsRelations = relations(evalsToPromptsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToPromptsTable.evalId],
    references: [evalsTable.id],
  }),
  prompt: one(promptsTable, {
    fields: [evalsToPromptsTable.promptId],
    references: [promptsTable.id],
  }),
}));

export const evalsToDatasetsRelations = relations(evalsToDatasetsTable, ({ one }) => ({
  eval: one(evalsTable, {
    fields: [evalsToDatasetsTable.evalId],
    references: [evalsTable.id],
  }),
  dataset: one(datasetsTable, {
    fields: [evalsToDatasetsTable.datasetId],
    references: [datasetsTable.id],
  }),
}));

// ------------ LLM Pentest Instruction Library ------------

export const llmPentestInstructionSetsTable = sqliteTable(
  'llm_pentest_instruction_sets',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id').notNull(),
    riskCategory: text('risk_category'),
    title: text('title').notNull(),
    description: text('description'),
    sourceType: text('source_type').notNull().default('built-in'),
    version: text('version').notNull().default('1.0.0'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    moduleIdIdx: index('llm_pentest_instruction_sets_module_idx').on(table.moduleId),
    riskCategoryIdx: index('llm_pentest_instruction_sets_risk_category_idx').on(table.riskCategory),
    sourceTypeIdx: index('llm_pentest_instruction_sets_source_type_idx').on(table.sourceType),
    enabledIdx: index('llm_pentest_instruction_sets_enabled_idx').on(table.enabled),
  }),
);

export const llmPentestInstructionsTable = sqliteTable(
  'llm_pentest_instructions',
  {
    id: text('id').primaryKey(),
    instructionSetId: text('instruction_set_id')
      .notNull()
      .references(() => llmPentestInstructionSetsTable.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    metadata: text('metadata'),
    order: integer('order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    instructionSetIdx: index('llm_pentest_instructions_set_idx').on(table.instructionSetId),
    orderIdx: index('llm_pentest_instructions_order_idx').on(table.order),
  }),
);

// ------------ Dify Pentest Instruction Library ------------

export const difyPentestInstructionSetsTable = sqliteTable(
  'dify_pentest_instruction_sets',
  {
    id: text('id').primaryKey(),
    moduleId: text('module_id').notNull(),
    riskCategory: text('risk_category'),
    title: text('title').notNull(),
    description: text('description'),
    sourceType: text('source_type').notNull().default('built-in'),
    version: text('version').notNull().default('1.0.0'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    moduleIdIdx: index('dify_pentest_instruction_sets_module_idx').on(table.moduleId),
    riskCategoryIdx: index('dify_pentest_instruction_sets_risk_category_idx').on(
      table.riskCategory,
    ),
    sourceTypeIdx: index('dify_pentest_instruction_sets_source_type_idx').on(table.sourceType),
    enabledIdx: index('dify_pentest_instruction_sets_enabled_idx').on(table.enabled),
  }),
);

export const difyPentestInstructionsTable = sqliteTable(
  'dify_pentest_instructions',
  {
    id: text('id').primaryKey(),
    instructionSetId: text('instruction_set_id')
      .notNull()
      .references(() => difyPentestInstructionSetsTable.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    metadata: text('metadata'),
    order: integer('order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    instructionSetIdx: index('dify_pentest_instructions_set_idx').on(table.instructionSetId),
    orderIdx: index('dify_pentest_instructions_order_idx').on(table.order),
  }),
);

// ------------ Dify Pentest Redux Tables ------------

// 插件注册表
export const difyPluginsTable = sqliteTable(
  'dify_plugins',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    version: text('version').notNull().default('1.0.0'),
    author: text('author'),
    homepage: text('homepage'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    installedAt: integer('installed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    enabledIdx: index('dify_plugins_enabled_idx').on(table.enabled),
  }),
);

// Dify 目标配置
export const difyTargetConfigsTable = sqliteTable(
  'dify_target_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    apiBaseUrl: text('api_base_url').notNull(),
    apiKey: text('api_key').notNull(),
    userId: text('user_id'),
    conversationId: text('conversation_id'),
    responseMode: text('response_mode').default('blocking'),
    source: text('source').notNull().default('user'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceIdx: index('dify_target_configs_source_idx').on(table.source),
  }),
);

// LLM 判定模型配置
export const difyJudgeConfigsTable = sqliteTable(
  'dify_judge_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    apiBaseUrl: text('api_base_url'),
    apiKey: text('api_key'),
    temperature: real('temperature').default(0),
    topP: real('top_p').default(1),
    rubric: text('rubric'), // 审查指令
    threshold: real('threshold').default(0.7), // 通过阈值
    source: text('source').notNull().default('user'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceIdx: index('dify_judge_configs_source_idx').on(table.source),
  }),
);

export const difyAttackCategoriesTable = sqliteTable(
  'dify_attack_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type'),
    description: text('description'),
    parentId: text('parent_id'),
    source: text('source').notNull().default('built-in'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    parentIdx: index('dify_attack_categories_parent_idx').on(table.parentId),
    sourceIdx: index('dify_attack_categories_source_idx').on(table.source),
  }),
);

export const difyAttackCommandsTable = sqliteTable(
  'dify_attack_commands',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type'),
    riskLevel: text('risk_level'),
    content: text('content').notNull(),
    categoryId: text('category_id'),
    source: text('source').notNull().default('built-in'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    version: text('version').notNull().default('1.0.0'),
    // 攻击描述字段
    attackTarget: text('attack_target'),
    expectedSuccess: text('expected_success'),
    nonVulnerability: text('non_vulnerability'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    categoryIdx: index('dify_attack_commands_category_idx').on(table.categoryId),
    sourceIdx: index('dify_attack_commands_source_idx').on(table.source),
    pluginIdx: index('dify_attack_commands_plugin_idx').on(table.pluginId),
    enabledIdx: index('dify_attack_commands_enabled_idx').on(table.enabled),
  }),
);

export const difyAttackCommandVersionsTable = sqliteTable(
  'dify_attack_command_versions',
  {
    id: text('id').primaryKey(),
    commandId: text('command_id')
      .notNull()
      .references(() => difyAttackCommandsTable.id),
    version: text('version').notNull(),
    content: text('content'),
    diff: text('diff'),
    metadata: text('metadata'),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    commandIdx: index('dify_attack_command_versions_cmd_idx').on(table.commandId),
    uniqueVersion: uniqueIndex('dify_attack_command_versions_unique').on(
      table.commandId,
      table.version,
    ),
  }),
);

export const difyAttackCommandTagsTable = sqliteTable(
  'dify_attack_command_tags',
  {
    commandId: text('command_id')
      .notNull()
      .references(() => difyAttackCommandsTable.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => ({
    uniqueTag: uniqueIndex('dify_attack_command_tags_unique').on(table.commandId, table.tag),
    tagIdx: index('dify_attack_command_tags_tag_idx').on(table.tag),
  }),
);

export const difyFuzzTasksTable = sqliteTable(
  'dify_fuzz_tasks',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    description: text('description'),
    mode: text('mode').notNull().default('quick'),
    // 关联配置（外键引用）
    targetConfigId: text('target_config_id').references(() => difyTargetConfigsTable.id),
    judgeConfigId: text('judge_config_id').references(() => difyJudgeConfigsTable.id),
    ruleSetId: text('rule_set_id'), // 延迟引用，避免循环依赖
    useLlmJudge: integer('use_llm_judge', { mode: 'boolean' }).default(false),
    // 运行参数
    delayMs: integer('delay_ms').default(0),
    maxConcurrency: integer('max_concurrency').default(1),
    status: text('status').notNull().default('pending'),
    strategyConfig: text('strategy_config'),
    createdBy: text('created_by'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index('dify_fuzz_tasks_status_idx').on(table.status),
    modeIdx: index('dify_fuzz_tasks_mode_idx').on(table.mode),
  }),
);

export const difyFuzzTaskAttacksTable = sqliteTable(
  'dify_fuzz_task_attacks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => difyFuzzTasksTable.id, { onDelete: 'cascade' }),
    commandId: text('command_id')
      .notNull()
      .references(() => difyAttackCommandsTable.id, { onDelete: 'cascade' }),
    attackMode: text('attack_mode'),
    weight: real('weight').default(1),
    businessPrompt: text('business_prompt'),
    metadata: text('metadata'),
    order: integer('order').default(0),
  },
  (table) => ({
    taskIdx: index('dify_fuzz_task_attacks_task_idx').on(table.taskId),
  }),
);

export const difyFuzzTaskRunsTable = sqliteTable(
  'dify_fuzz_task_runs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => difyFuzzTasksTable.id, { onDelete: 'cascade' }),
    mode: text('mode'),
    status: text('status').notNull().default('pending'),
    stats: text('stats'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    configSnapshot: text('config_snapshot'),
  },
  (table) => ({
    taskIdx: index('dify_fuzz_task_runs_task_idx').on(table.taskId),
    statusIdx: index('dify_fuzz_task_runs_status_idx').on(table.status),
  }),
);

export const difyPentestRequestsTable = sqliteTable(
  'dify_pentest_requests',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => difyFuzzTaskRunsTable.id, { onDelete: 'cascade' }),
    attackId: text('attack_id').references(() => difyAttackCommandsTable.id),
    requestType: text('request_type'),
    httpPretty: text('http_pretty'),
    httpRaw: text('http_raw'),
    httpHeaders: text('http_headers'),
    payloadVars: text('payload_vars'),
    latencyMs: integer('latency_ms'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runIdx: index('dify_pentest_requests_run_idx').on(table.runId),
  }),
);

export const difyPentestResponsesTable = sqliteTable('dify_pentest_responses', {
  requestId: text('request_id')
    .primaryKey()
    .references(() => difyPentestRequestsTable.id, { onDelete: 'cascade' }),
  statusCode: integer('status_code'),
  bodyText: text('body_text'),
  bodyJson: text('body_json'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  receivedAt: integer('received_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const difyDetectionRulesTable = sqliteTable(
  'dify_detection_rules',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    pattern: text('pattern').notNull(),
    severityDefault: text('severity_default'),
    confidenceDefault: real('confidence_default'),
    source: text('source').notNull().default('built-in'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    typeIdx: index('dify_detection_rules_type_idx').on(table.type),
    sourceIdx: index('dify_detection_rules_source_idx').on(table.source),
    pluginIdx: index('dify_detection_rules_plugin_idx').on(table.pluginId),
    enabledIdx: index('dify_detection_rules_enabled_idx').on(table.enabled),
  }),
);

export const difyRuleSetsTable = sqliteTable(
  'dify_rule_sets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    mode: text('mode').notNull().default('rule-only'),
    thresholds: text('thresholds'),
    source: text('source').notNull().default('user'),
    pluginId: text('plugin_id').references(() => difyPluginsTable.id),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    sourceIdx: index('dify_rule_sets_source_idx').on(table.source),
  }),
);

export const difyRuleSetRulesTable = sqliteTable(
  'dify_rule_set_rules',
  {
    ruleSetId: text('rule_set_id')
      .notNull()
      .references(() => difyRuleSetsTable.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id')
      .notNull()
      .references(() => difyDetectionRulesTable.id, { onDelete: 'cascade' }),
    weight: real('weight').default(1),
    order: integer('order').default(0),
  },
  (table) => ({
    uniqueEntry: uniqueIndex('dify_rule_set_rules_unique').on(table.ruleSetId, table.ruleId),
  }),
);

export const difyRuleHitsTable = sqliteTable(
  'dify_rule_hits',
  {
    id: text('id').primaryKey(),
    responseId: text('response_id')
      .notNull()
      .references(() => difyPentestResponsesTable.requestId, { onDelete: 'cascade' }),
    ruleId: text('rule_id').references(() => difyDetectionRulesTable.id),
    ruleType: text('rule_type'),
    severity: text('severity'),
    confidence: real('confidence'),
    evidence: text('evidence'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    responseIdx: index('dify_rule_hits_response_idx').on(table.responseId),
    ruleIdx: index('dify_rule_hits_rule_idx').on(table.ruleId),
  }),
);

export const difyLlmJudgmentsTable = sqliteTable(
  'dify_llm_judgments',
  {
    id: text('id').primaryKey(),
    responseId: text('response_id')
      .notNull()
      .references(() => difyPentestResponsesTable.requestId, { onDelete: 'cascade' }),
    judgeConfigId: text('judge_config_id').references(() => difyJudgeConfigsTable.id),
    riskLevel: text('risk_level'),
    reason: text('reason'),
    confidence: real('confidence'),
    rawOutput: text('raw_output'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    responseUnique: uniqueIndex('dify_llm_judgments_response_idx').on(table.responseId),
  }),
);

export const difyPentestMetricsTable = sqliteTable(
  'dify_pentest_metrics',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => difyFuzzTaskRunsTable.id, { onDelete: 'cascade' }),
    payloadSuccessRate: real('payload_success_rate'),
    ruleHitBreakdown: text('rule_hit_breakdown'),
    jailbreakCount: integer('jailbreak_count'),
    systemPromptLeakCount: integer('system_prompt_leak_count'),
    firstFailureAt: integer('first_failure_at'),
    customMetrics: text('custom_metrics'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runUnique: uniqueIndex('dify_pentest_metrics_run_idx').on(table.runId),
  }),
);

// ------------ Configs ------------

export const configsTable = sqliteTable(
  'configs',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    name: text('name').notNull(),
    type: text('type').notNull(), // e.g. 'redteam', 'eval', etc.
    config: text('config', { mode: 'json' }).notNull(),
  },
  (table) => ({
    createdAtIdx: index('configs_created_at_idx').on(table.createdAt),
    typeIdx: index('configs_type_idx').on(table.type),
  }),
);

// ------------ Outputs ------------
// We're just recording these on eval.results for now...

/*
export const llmOutputs = sqliteTable(
  'llm_outputs',
  {
    id: text('id')
      .notNull()
      .unique(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    evalId: text('eval_id')
      .notNull()
      .references(() => evals.id),
    promptId: text('prompt_id')
      .notNull()
      .references(() => prompts.id),
    providerId: text('provider_id').notNull(),
    vars: text('vars', {mode: 'json'}),
    response: text('response', {mode: 'json'}),
    error: text('error'),
    latencyMs: integer('latency_ms'),
    gradingResult: text('grading_result', {mode: 'json'}),
    namedScores: text('named_scores', {mode: 'json'}),
    cost: real('cost'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id] }),
  }),
);

export const llmOutputsRelations = relations(llmOutputs, ({ one }) => ({
  eval: one(evals, {
    fields: [llmOutputs.evalId],
    references: [evals.id],
  }),
  prompt: one(prompts, {
    fields: [llmOutputs.promptId],
    references: [prompts.id],
  }),
}));
*/

// ------------ Model Audits ------------

export const modelAuditsTable = sqliteTable(
  'model_audits',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),

    // Basic audit information
    name: text('name'), // Optional name/identifier for the audit
    author: text('author'), // Optional author/user who ran the audit
    modelPath: text('model_path').notNull(), // Path to the model/file being audited
    modelType: text('model_type'), // Optional: type of model (e.g., 'pytorch', 'tensorflow', etc.)

    // Audit results as JSON blob
    results: text('results', { mode: 'json' }).$type<ModelAuditScanResults>().notNull(),

    // Extracted checks and issues from results for easier querying
    checks: text('checks', { mode: 'json' }).$type<ModelAuditScanResults['checks']>(),
    issues: text('issues', { mode: 'json' }).$type<ModelAuditScanResults['issues']>(),

    // Summary fields for quick filtering/querying
    hasErrors: integer('has_errors', { mode: 'boolean' }).notNull(),
    totalChecks: integer('total_checks'),
    passedChecks: integer('passed_checks'),
    failedChecks: integer('failed_checks'),

    // Optional metadata
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  },
  (table) => ({
    createdAtIdx: index('model_audits_created_at_idx').on(table.createdAt),
    modelPathIdx: index('model_audits_model_path_idx').on(table.modelPath),
    hasErrorsIdx: index('model_audits_has_errors_idx').on(table.hasErrors),
    modelTypeIdx: index('model_audits_model_type_idx').on(table.modelType),
  }),
);

// ------------ Traces ------------

export const tracesTable = sqliteTable(
  'traces',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id').notNull().unique(),
    evaluationId: text('evaluation_id')
      .notNull()
      .references(() => evalsTable.id),
    testCaseId: text('test_case_id').notNull(),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  },
  (table) => ({
    evaluationIdx: index('traces_evaluation_idx').on(table.evaluationId),
    traceIdIdx: index('traces_trace_id_idx').on(table.traceId),
  }),
);

export const spansTable = sqliteTable(
  'spans',
  {
    id: text('id').primaryKey(),
    traceId: text('trace_id')
      .notNull()
      .references(() => tracesTable.traceId),
    spanId: text('span_id').notNull(),
    parentSpanId: text('parent_span_id'),
    name: text('name').notNull(),
    startTime: integer('start_time').notNull(),
    endTime: integer('end_time'),
    attributes: text('attributes', { mode: 'json' }).$type<Record<string, any>>(),
    statusCode: integer('status_code'),
    statusMessage: text('status_message'),
  },
  (table) => ({
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    spanIdIdx: index('spans_span_id_idx').on(table.spanId),
  }),
);

// ------------ Trace Relations ------------

export const tracesRelations = relations(tracesTable, ({ one, many }) => ({
  eval: one(evalsTable, {
    fields: [tracesTable.evaluationId],
    references: [evalsTable.id],
  }),
  spans: many(spansTable),
}));

export const spansRelations = relations(spansTable, ({ one }) => ({
  trace: one(tracesTable, {
    fields: [spansTable.traceId],
    references: [tracesTable.traceId],
  }),
}));

// ============ Vulnerability Related Tables ============

export const vulnerabilitiesTable = sqliteTable(
  'vulnerabilities',
  {
    id: text('id').primaryKey(),
    avdId: text('avd_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // agent, mcp, llm, tool, platform
    category: text('category'),
    riskLevel: text('risk_level').notNull(), // critical, high, medium, low
    cvssScore: real('cvss_score'), // CVSS score (0.0-10.0)
    status: text('status').notNull(),
    disclosedAt: integer('disclosed_at'),
    description: text('description'),
    affectedTargets: text('affected_targets'),
    impactScope: text('impact_scope'),
    cweId: text('cwe_id'),
    mitreId: text('mitre_id'),
    owaspId: text('owasp_id'),
    owaspLlmTop10Mapping: text('owasp_llm_top10_mapping'),
    exploitability: text('exploitability'),
    patchStatus: text('patch_status'),
    auditNotes: text('audit_notes'),
    tags: text('tags'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
  },
  (table) => ({
    avdIdIdx: index('vulnerabilities_avd_id_idx').on(table.avdId),
    typeIdx: index('vulnerabilities_type_idx').on(table.type),
    riskLevelIdx: index('vulnerabilities_risk_level_idx').on(table.riskLevel),
    cvssScoreIdx: index('vulnerabilities_cvss_score_idx').on(table.cvssScore),
    statusIdx: index('vulnerabilities_status_idx').on(table.status),
  }),
);

export const successIndicatorsTable = sqliteTable(
  'success_indicators',
  {
    id: text('id').primaryKey(),
    vulnerabilityId: text('vulnerability_id')
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    pattern: text('pattern').notNull(),
    description: text('description'),
    confidence: real('confidence').notNull().default(0.8),
    severity: text('severity').notNull().default('medium'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    vulnerabilityIdIdx: index('success_indicators_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('success_indicators_type_idx').on(table.type),
    enabledIdx: index('success_indicators_enabled_idx').on(table.enabled),
  }),
);

export const failureIndicatorsTable = sqliteTable(
  'failure_indicators',
  {
    id: text('id').primaryKey(),
    vulnerabilityId: text('vulnerability_id')
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    pattern: text('pattern').notNull(),
    description: text('description'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    vulnerabilityIdIdx: index('failure_indicators_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('failure_indicators_type_idx').on(table.type),
    enabledIdx: index('failure_indicators_enabled_idx').on(table.enabled),
  }),
);

export const wafRulesTable = sqliteTable(
  'waf_rules',
  {
    id: text('id').primaryKey(),
    vulnerabilityId: text('vulnerability_id')
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    rule: text('rule').notNull(),
    description: text('description'),
    textPattern: text('text_pattern'),
    textMatchType: text('text_match_type'),
    semanticPrompt: text('semantic_prompt'),
    semanticThreshold: real('semantic_threshold'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    priority: integer('priority').default(0),
    action: text('action').default('alert'),
    applicableScenarios: text('applicable_scenarios'),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    vulnerabilityIdIdx: index('waf_rules_vulnerability_id_idx').on(table.vulnerabilityId),
    typeIdx: index('waf_rules_type_idx').on(table.type),
    enabledIdx: index('waf_rules_enabled_idx').on(table.enabled),
  }),
);

export const llmReviewInstructionsTable = sqliteTable(
  'llm_review_instructions',
  {
    id: text('id').primaryKey(),
    vulnerabilityId: text('vulnerability_id')
      .notNull()
      .references(() => vulnerabilitiesTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    content: text('content').notNull(),
    description: text('description'),
    model: text('model'),
    temperature: real('temperature'),
    maxTokens: integer('max_tokens'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    priority: integer('priority').default(0),
    metadata: text('metadata'),
    createdAt: integer('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    vulnerabilityIdIdx: index('llm_review_instructions_vulnerability_id_idx').on(
      table.vulnerabilityId,
    ),
    typeIdx: index('llm_review_instructions_type_idx').on(table.type),
    enabledIdx: index('llm_review_instructions_enabled_idx').on(table.enabled),
  }),
);
