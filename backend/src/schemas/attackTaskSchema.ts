/**
 * Attack task request schema shared by HTTP API, external API, agent mode, and CLI.
 */

import { z } from 'zod';

/** Create attack task schema (also used by public external API; keep fields backward compatible) */
export const createTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().optional(),
  targetType: z.enum(['agent', 'mcp', 'llm', 'tool', 'platform', 'composite']),
  targetConfig: z.record(z.unknown()),
  vulnerabilities: z.array(z.string()),
  attackMode: z.enum(['simple', 'conversation', 'composite']),
  compositeAttackConfig: z.record(z.unknown()).optional(),
  detectionConfig: z.object({
    useRule: z.boolean(),
    useLLM: z.boolean(),
    useKnowledgeBase: z.boolean(),
    ruleSetId: z.string().optional(),
    llmConfig: z
      .object({
        model: z.string().optional(),
        confidenceThreshold: z.number().min(0).max(1).optional(),
        successDescription: z.string().optional(),
      })
      .optional(),
  }),
  agentConfig: z
    .object({
      enabled: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      temperature: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  /** Redundant copy of metadata.configAudit so large/nested bodies are not lost by proxies; merged server-side before asset save. */
  configAudit: z
    .object({
      yaml: z.any().optional(),
      json: z.any().optional(),
      fileName: z.any().optional(),
    })
    .optional(),
  // MySQL v4 (optional; persisted only when DB_TYPE=mysql)
  taskTypeId: z.string().uuid().optional(),
  platformFamily: z.string().max(50).optional(),
  scanMode: z.enum(['static', 'runtime', 'hybrid']).optional(),
  entrypointType: z.string().max(50).optional(),
  artifactRefs: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(),
  judgeConfig: z.record(z.unknown()).optional(),
  reportPreference: z.record(z.unknown()).optional(),
  scheduleConfig: z.record(z.unknown()).optional(),
  retestOfTaskId: z.string().uuid().optional(),
  baselineTaskId: z.string().uuid().optional(),
  /** Persist metadata.configAudit as workflow_config_assets when MySQL/Postgres (see mergeWorkflowConfigAssetIntoTaskMetadata). */
  saveWorkflowConfigAsset: z.preprocess((val) => {
    if (val === undefined || val === null) {
      return undefined;
    }
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'number') {
      return val !== 0;
    }
    const s = String(val).trim().toLowerCase();
    if (s === '') {
      return undefined;
    }
    return s === 'true' || s === '1' || s === 'yes';
  }, z.boolean().optional()),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** CLI scan task: same fields as API body, plus optional local runner hints. */
export const scanTaskSchema = createTaskSchema.extend({
  runnerConfigPath: z.string().optional(),
  output: z
    .object({
      path: z.string().optional(),
      format: z.enum(['json', 'yaml', 'html']).optional(),
    })
    .optional(),
  execution: z
    .object({
      maxConcurrency: z.number().int().positive().optional(),
      delayMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type ScanTaskInput = z.infer<typeof scanTaskSchema>;
