import { getSingleTestPrompt } from '@/features/tasks/run-source-label';
import type { AttackTask, TaskType } from '@/types/entities';

/** Values persisted on `task.metadata.taskKind` from the configuration wizard */
export type ReportEntryTaskKind =
  | 'api_test'
  | 'config_audit'
  | 'config_static'
  | 'single_test'
  | 'commercial_api_test';

export function getTaskKindFromMetadata(
  metadata: Record<string, unknown> | undefined,
): ReportEntryTaskKind | null {
  const k = metadata?.taskKind;
  if (k === 'api_test' || k === 'config_audit' || k === 'config_static' || k === 'single_test' || k === 'commercial_api_test') {
    return k;
  }
  return null;
}

/** 单次测试是否上传了配置文件（与后端 metadata.configAudit 一致） */
export function singleTestHasConfigAudit(
  metadata: Record<string, unknown> | undefined,
): boolean {
  if (!metadata) {
    return false;
  }
  const ca = metadata.configAudit;
  if (!ca || typeof ca !== 'object') {
    return false;
  }
  const o = ca as Record<string, unknown>;
  return Boolean(String(o.yaml ?? '').trim() || String(o.json ?? '').trim());
}

/**
 * 报告入口使用的任务类型：单次测试复用 api_test / config_static / config_audit 模板与文案。
 */
export function getReportKindForLabels(
  metadata: Record<string, unknown> | undefined,
): ReportEntryTaskKind | null {
  const k = getTaskKindFromMetadata(metadata);
  if (k === 'single_test') {
    const hasConfig = singleTestHasConfigAudit(metadata);
    const hasPrompt = Boolean(getSingleTestPrompt(metadata)?.trim());
    if (hasConfig && hasPrompt) {
      return 'config_audit';
    }
    if (hasConfig) {
      return 'config_static';
    }
    return 'api_test';
  }
  return k;
}

/** Task list → multi-template report suite (six HTML templates) */
export function getPocSuiteMenuLabel(): string {
  return 'Generate report suite';
}

/** Task list → Reports: primary menu label */
export function getGenerateReportMenuLabel(kind: ReportEntryTaskKind | null): string {
  if (kind === 'config_audit') {
    return 'Generate report (config + API)';
  }
  if (kind === 'config_static') {
    return 'Generate report (config only)';
  }
  return 'Generate Report';
}

/** Secondary line for combined gray-box + API tasks; null = omit */
export function getGenerateReportMenuDescription(kind: ReportEntryTaskKind | null): string | null {
  if (kind === 'config_audit') {
    return 'Includes §7.1 static findings and §7.2 runtime results.';
  }
  return null;
}

export function getGenerateReportDialogTitle(kind: ReportEntryTaskKind | null): string {
  if (kind === 'config_audit') {
    return 'Generate report (config + API)';
  }
  if (kind === 'config_static') {
    return 'Generate report (config only)';
  }
  return 'Generate Report';
}

export function getGenerateReportDialogDescription(kind: ReportEntryTaskKind | null): string {
  if (kind === 'config_audit') {
    return 'One report covers static YAML/DSL audit (section 7.1) and runtime / adversarial verification (section 7.2). Choose an export format below.';
  }
  if (kind === 'config_static') {
    return 'This task type produces a static configuration audit report (no runtime attack rounds). Choose an export format below.';
  }
  return 'Select a task and format to generate a report.';
}

/** Wizard / metadata.taskKind → 与创建表单一致的展示名（按 platform_family 区分 Coze / Dify） */
export function formatTaskKindFromMetadata(
  taskKind: unknown,
  platformFamily?: string | null,
): string | null {
  const pf = String(platformFamily ?? '').toLowerCase();
  const coze = pf === 'coze';
  const fastgpt = pf === 'fastgpt';
  const n8n = pf === 'n8n';
  if (taskKind === 'api_test') {
    if (coze) {
      return 'Coze API Security Scanning Task';
    }
    if (fastgpt) {
      return 'FastGPT API Security Scanning Task';
    }
    if (n8n) {
      return 'n8n API Security Scanning Task';
    }
    return 'Dify API Security Scanning Task';
  }
  if (taskKind === 'config_static') {
    if (coze) {
      return 'Coze Config Gray-Box Scanning Task';
    }
    if (fastgpt) {
      return 'FastGPT Config Gray-Box Scanning Task';
    }
    if (n8n) {
      return 'n8n Config Gray-Box Scanning Task';
    }
    return 'Dify Config Gray-Box Scanning Task';
  }
  if (taskKind === 'config_audit') {
    if (coze) {
      return 'Coze Config Gray-Box & API Black-Box Scanning Task';
    }
    if (fastgpt) {
      return 'FastGPT Config Gray-Box & API Black-Box Scanning Task';
    }
    if (n8n) {
      return 'n8n Config Gray-Box & API Black-Box Scanning Task';
    }
    return 'Dify Config Gray-Box & API Black-Box Scanning Task';
  }
  if (taskKind === 'single_test') {
    return 'Single Test Task';
  }
  if (taskKind === 'commercial_api_test') {
    return 'Commercial API Black-Box Scan Task';
  }
  return null;
}

/**
 * 列表、详情展示用：优先 product task_types 名称，否则 metadata.taskKind，否则 —。
 */
export function getAttackTaskTypeLabel(task: AttackTask, taskTypes: TaskType[]): string {
  // UI 展示优先对齐“创建页面 Task type”的选择（metadata.taskKind），
  // 避免将 v4 的 taskTypeId（例如 dify_api_scan）误当成用户选择的“API test type”。
  const taskKindLabel = formatTaskKindFromMetadata(
    (task.metadata as Record<string, unknown> | undefined)?.taskKind,
    task.platformFamily,
  );
  if (taskKindLabel) {
    return taskKindLabel;
  }

  // Fallback: 兼容历史数据/非默认 taskKind 的情况
  if (task.taskTypeId) {
    const name = taskTypes.find((t) => t.id === task.taskTypeId)?.name;
    if (name) {
      return name;
    }
    const id = task.taskTypeId;
    return id.length > 12 ? `${id.slice(0, 8)}…` : id;
  }

  return '—';
}
