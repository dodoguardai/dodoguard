/** 任务报告类型：API 黑盒类 vs 配置静态审计（Dify / Coze / FastGPT 分流） */
export type TaskReportKind =
  | 'api_blackbox'
  | 'dify_config_audit'
  | 'dify_config_static'
  | 'coze_config_audit'
  | 'coze_config_static'
  | 'fastgpt_config_audit'
  | 'fastgpt_config_static';

export type TaskReportKindInput = {
  taskTypeCode?: string;
  taskKind?: 'api_test' | 'config_audit' | 'config_static' | 'single_test';
  /** `attack_tasks.platform_family`：Coze 配置任务与 Dify 共用 task type code 时需按此分流报告模板与 reportType */
  platformFamily?: string | null;
  /** 原始 metadata；单次测试上传配置时复用 config_audit 报告模板 */
  taskMetadata?: Record<string, unknown>;
};

/** 单次测试是否附带配置文件（YAML/JSON），与创建表单 metadata.configAudit 一致 */
export function singleTestHasConfigAudit(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  const ca = metadata.configAudit;
  if (!ca || typeof ca !== 'object') {
    return false;
  }
  const o = ca as Record<string, unknown>;
  return Boolean(String(o.yaml ?? '').trim() || String(o.json ?? '').trim());
}

/** 单次测试是否填写了探测指令（metadata.singleTest.prompt） */
export function singleTestHasPrompt(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  const st = metadata.singleTest;
  if (!st || typeof st !== 'object') {
    return false;
  }
  return Boolean(String((st as { prompt?: unknown }).prompt ?? '').trim());
}

/** 单次测试在报告生成时映射到与常规任务相同的模板类型 */
function resolveEffectiveTaskKind(data: TaskReportKindInput): TaskReportKindInput['taskKind'] {
  if (data.taskKind !== 'single_test') {
    return data.taskKind;
  }
  const hasConfig = singleTestHasConfigAudit(data.taskMetadata);
  const hasPrompt = singleTestHasPrompt(data.taskMetadata);
  if (hasConfig && hasPrompt) {
    return 'config_audit';
  }
  if (hasConfig) {
    return 'config_static';
  }
  return 'api_test';
}

function resolveBaseConfigReportKind(data: TaskReportKindInput): TaskReportKind {
  const code = data.taskTypeCode?.trim().toLowerCase();
  if (code === 'dify_config_static') {
    return 'dify_config_static';
  }
  if (code === 'dify_config_audit') {
    return 'dify_config_audit';
  }
  const kind = resolveEffectiveTaskKind(data);
  if (kind === 'config_static') {
    return 'dify_config_static';
  }
  if (kind === 'config_audit') {
    return 'dify_config_audit';
  }
  return 'api_blackbox';
}

/**
 * 优先使用 task_types.code；否则回退 attack_tasks.metadata.taskKind。
 * `platform_family === 'coze'` / `'fastgpt'` 且为配置审计类任务时，返回对应 `*_config_*`，避免报告误标为 Dify。
 */
export function resolveTaskReportKind(data: TaskReportKindInput): TaskReportKind {
  const base = resolveBaseConfigReportKind(data);
  if (base !== 'dify_config_audit' && base !== 'dify_config_static') {
    return base;
  }
  const pf = String(data.platformFamily ?? '')
    .trim()
    .toLowerCase();
  if (pf === 'coze') {
    return base === 'dify_config_static' ? 'coze_config_static' : 'coze_config_audit';
  }
  if (pf === 'fastgpt') {
    return base === 'dify_config_static' ? 'fastgpt_config_static' : 'fastgpt_config_audit';
  }
  return base;
}
