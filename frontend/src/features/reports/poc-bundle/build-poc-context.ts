import { format } from 'date-fns';

import type { AttackResult, AttackTask, TargetAgent } from '@/types/entities';

import { parseTaskRunProgress } from '@/features/tasks/task-run-progress';
import { formatTestingModeLabel } from '@/features/tasks/testing-mode-label';

const RISK_ORDER: Record<'critical' | 'high' | 'medium' | 'low', number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function safeFormat(iso: string | undefined, pattern: string): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return format(d, pattern);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusZh(status: AttackTask['status']): string {
  const map: Record<AttackTask['status'], string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消',
  };
  return map[status] ?? status;
}

function formatTaskKind(kind: unknown): string {
  if (kind === 'api_test') {
    return 'API 黑盒检测';
  }
  if (kind === 'config_audit') {
    return '配置审计';
  }
  if (kind === 'config_static') {
    return '静态配置检测';
  }
  return '—';
}

function formatScanMode(mode: AttackTask['scanMode']): string {
  if (mode === 'static') {
    return '静态';
  }
  if (mode === 'runtime') {
    return '运行时';
  }
  if (mode === 'hybrid') {
    return '混合';
  }
  if (mode && String(mode).trim()) {
    return String(mode);
  }
  return '—';
}

function riskLevelZh(level: string): string {
  const m: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低',
  };
  return m[level] ?? level;
}

/** PoC 文档内测试模式中文（与 formatTestingModeLabel 区分，面向交付件） */
function attackModeZh(mode: AttackTask['attackMode']): string {
  if (mode === 'simple') {
    return '简单扫描';
  }
  if (mode === 'conversation') {
    return '多轮会话';
  }
  if (mode === 'composite') {
    return '组合攻击';
  }
  return mode;
}

function buildDetectionConfigSummary(task: AttackTask): string {
  const d = task.detectionConfig;
  if (!d) {
    return '—';
  }
  const parts: string[] = [];
  if (d.useRule) {
    parts.push('规则检测');
  }
  if (d.useLLM) {
    parts.push('LLM 裁决');
  }
  if (d.useKnowledgeBase) {
    parts.push('知识库比对');
  }
  if (d.detectionMode === 'llm') {
    parts.push('检测模式：LLM');
  } else if (d.detectionMode === 'rule') {
    parts.push('检测模式：规则');
  }
  const model = d.llmConfig?.model?.trim();
  if (model) {
    parts.push(`模型：${model}`);
  }
  return parts.length > 0 ? parts.join('；') : '默认检测配置';
}

function buildFindingsDetailRows(
  results: AttackResult[],
  vulnNameById: Map<string, string>,
  limit: number,
): string {
  if (results.length === 0) {
    return `<tr><td colspan="7" style="text-align:left;color:#555;">暂无检测结果记录；任务执行完成后可重新导出本页。</td></tr>`;
  }
  const sorted = [...results].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return sorted
    .slice(0, limit)
    .map((r, i) => {
      const name = escapeHtml(vulnNameById.get(r.vulnerabilityId) || r.vulnerabilityId);
      const verdict = r.finalVerdict?.vulnerable ? '存在风险' : '未判定风险';
      const level = escapeHtml(riskLevelZh(r.finalVerdict?.riskLevel ?? 'low'));
      const conf =
        r.finalVerdict?.confidence != null && Number.isFinite(r.finalVerdict.confidence)
          ? String(Math.round(r.finalVerdict.confidence * 100) / 100)
          : '—';
      const t = escapeHtml(safeFormat(r.createdAt, 'MM-dd HH:mm'));
      const rawReason = r.finalVerdict?.reason?.trim();
      const reason = rawReason
        ? escapeHtml(rawReason.slice(0, 140)) + (rawReason.length > 140 ? '…' : '')
        : '—';
      return `<tr><td>${i + 1}</td><td style="text-align:left;">${name}</td><td>${verdict}</td><td>${level}</td><td>${conf}</td><td>${t}</td><td style="text-align:left;">${reason}</td></tr>`;
    })
    .join('');
}

function pickEndpointFromAgentConfig(agent: TargetAgent | null | undefined): string {
  if (!agent?.config || typeof agent.config !== 'object') {
    return '';
  }
  const c = agent.config as Record<string, unknown>;
  const candidates = [
    c.apiBaseUrl,
    c.webhookUrl,
    c.endpoint,
    c.serverUrl,
    c.baseUrl,
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

function pickEndpointFromTaskTargetConfig(task: AttackTask): string {
  const tc = task.targetConfig;
  if (!tc || typeof tc !== 'object') {
    return '';
  }
  const root = tc as Record<string, unknown>;
  const nestedKeys = ['agent', 'llm', 'mcp', 'tool', 'platform'] as const;
  for (const key of nestedKeys) {
    const block = root[key];
    if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>;
      for (const k of ['apiBaseUrl', 'apiUrl', 'serverUrl', 'endpoint', 'baseUrl']) {
        const v = b[k];
        if (typeof v === 'string' && v.trim()) {
          return v.trim();
        }
      }
    }
  }
  return '';
}

export function summarizeAttackResults(
  results: AttackResult[],
  vulnNameById: Map<string, string>,
): {
  resultsTotal: number;
  vulnerableCount: number;
  safeCount: number;
  riskCritical: number;
  riskHigh: number;
  riskMedium: number;
  riskLow: number;
  firstDetectionAt: string;
  lastDetectionAt: string;
  highestRiskLabel: string;
  topAggregatedFindings: Array<{
    vulnerabilityId: string;
    name: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    hitCount: number;
  }>;
} {
  const resultsTotal = results.length;
  const vulnerable = results.filter((r) => r.finalVerdict?.vulnerable === true);
  const vulnerableCount = vulnerable.length;
  const safeCount = Math.max(0, resultsTotal - vulnerableCount);

  let riskCritical = 0;
  let riskHigh = 0;
  let riskMedium = 0;
  let riskLow = 0;
  for (const r of vulnerable) {
    const lv = r.finalVerdict.riskLevel;
    if (lv === 'critical') {
      riskCritical += 1;
    } else if (lv === 'high') {
      riskHigh += 1;
    } else if (lv === 'medium') {
      riskMedium += 1;
    } else if (lv === 'low') {
      riskLow += 1;
    }
  }

  const timestamps = results
    .map((r) => r.createdAt)
    .filter(Boolean)
    .sort();
  const firstTs = timestamps[0];
  const lastTs = timestamps[timestamps.length - 1];
  const firstDetectionAt = firstTs ? safeFormat(firstTs, 'yyyy-MM-dd HH:mm') : '—';
  const lastDetectionAt = lastTs ? safeFormat(lastTs, 'yyyy-MM-dd HH:mm') : '—';

  const agg = new Map<
    string,
    { riskLevel: 'critical' | 'high' | 'medium' | 'low'; hitCount: number }
  >();
  for (const r of vulnerable) {
    const id = r.vulnerabilityId;
    const level = r.finalVerdict.riskLevel;
    const prev = agg.get(id);
    if (!prev) {
      agg.set(id, { riskLevel: level, hitCount: 1 });
    } else {
      const better =
        RISK_ORDER[level] > RISK_ORDER[prev.riskLevel] ? level : prev.riskLevel;
      agg.set(id, { riskLevel: better, hitCount: prev.hitCount + 1 });
    }
  }

  const topAggregatedFindings = [...agg.entries()]
    .map(([vulnerabilityId, v]) => ({
      vulnerabilityId,
      name: vulnNameById.get(vulnerabilityId)?.trim() || vulnerabilityId,
      riskLevel: v.riskLevel,
      hitCount: v.hitCount,
    }))
    .sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel])
    .slice(0, 12);

  let highestRiskLabel = '—';
  if (riskCritical > 0) {
    highestRiskLabel = '严重';
  } else if (riskHigh > 0) {
    highestRiskLabel = '高';
  } else if (riskMedium > 0) {
    highestRiskLabel = '中';
  } else if (riskLow > 0) {
    highestRiskLabel = '低';
  }

  return {
    resultsTotal,
    vulnerableCount,
    safeCount,
    riskCritical,
    riskHigh,
    riskMedium,
    riskLow,
    firstDetectionAt,
    lastDetectionAt,
    highestRiskLabel,
    topAggregatedFindings,
  };
}

export type PocFillContext = {
  taskName: string;
  taskNameHtml: string;
  taskId: string;
  taskIdHtml: string;
  vulnCount: number;
  docDate: string;
  createdDate: string;
  updatedDate: string;
  dateRange: string;
  statusLabel: string;
  taskTypeLabel: string;
  attackModeLabel: string;
  /** 测试模式中文（交付件） */
  attackModeZhHtml: string;
  targetType: string;
  platformFamily: string;
  taskDescriptionHtml: string;
  endpointUrl: string;
  endpointUrlHtml: string;
  targetAgentNameHtml: string;
  scanModeLabel: string;
  taskKindLabel: string;
  resultsTotal: number;
  vulnerableCount: number;
  safeCount: number;
  riskCritical: number;
  riskHigh: number;
  riskMedium: number;
  riskLow: number;
  riskDistributionText: string;
  firstDetectionAt: string;
  lastDetectionAt: string;
  highestRiskLabel: string;
  topFindingNamesText: string;
  topFindingsRemediationRowsHtml: string;
  /** 管理层摘要「风险与投入建议」表体（已转义） */
  topAggregatedRowsMgmtHtml: string;
  detectionSummaryHtml: string;
  evidenceVulnTitleHtml: string;
  coreRiskListHtml: string;
  /** 检测引擎/规则/LLM 等一句话（已转义） */
  detectionConfigSummaryHtml: string;
  /** 执行进度说明（已转义） */
  runProgressSummaryHtml: string;
  /** 检测过程叙述（含允许的标签） */
  processNarrativeHtml: string;
  /** 结果明细表 tbody 行（单元格已转义） */
  findingsDetailTbodyHtml: string;
  /** 执行过程记录：检测摘要侧栏（HTML） */
  execLogProcessAsideHtml: string;
  /** 会话/证据映射表：预填数据行（HTML） */
  evidenceMappingPrefillRowsHtml: string;
  /** 证据包：环境信息后「摘录」表同上 tbody */
  evidenceFindingsSectionHtml: string;
  /** 证据包：复现步骤第 1 行（HTML tr） */
  evidenceReproduceStep1RowHtml: string;
  /** 证据清单：预填 tr（HTML） */
  evidenceAttachmentPrefillRowsHtml: string;
  /** 总报告：替换原「三、检测结果」整块（HTML） */
  masterDetectionSectionHtml: string;
  /** 管理层：总体风险判断预填（HTML 片段） */
  mgmtOverallRiskPrefillHtml: string;
  /** 管理层：影响评估预填（HTML 片段） */
  mgmtImpactPrefillHtml: string;
  /** 管理层：可控性预填（HTML 片段） */
  mgmtControllabilityPrefillHtml: string;
  /** 整改：主要发现摘录（HTML） */
  remediationFindingDetailsHtml: string;
  /** 总报告：整改建议条目（HTML li…） */
  masterRemediationBulletsHtml: string;
  /** 总报告：测试结论草稿（HTML 片段） */
  masterConclusionDraftHtml: string;
};

export type BuildPocFillContextOptions = {
  results?: AttackResult[];
  vulnNameById?: Map<string, string>;
  targetAgent?: TargetAgent | null;
};

export function buildPocFillContext(
  task: AttackTask,
  taskTypeLabel: string,
  options: BuildPocFillContextOptions = {},
): PocFillContext {
  const taskName = task.name?.trim() || '—';
  const results = options.results ?? [];
  const vulnNameById = options.vulnNameById ?? new Map<string, string>();
  const stats = summarizeAttackResults(results, vulnNameById);

  const endpointRaw =
    pickEndpointFromAgentConfig(options.targetAgent ?? undefined) ||
    pickEndpointFromTaskTargetConfig(task);
  const agentName = options.targetAgent?.name?.trim() ?? '';

  const metaKind = (task.metadata as Record<string, unknown> | undefined)?.taskKind;
  const parts: string[] = [];
  if (stats.riskCritical) {
    parts.push(`严重 ${stats.riskCritical}`);
  }
  if (stats.riskHigh) {
    parts.push(`高 ${stats.riskHigh}`);
  }
  if (stats.riskMedium) {
    parts.push(`中 ${stats.riskMedium}`);
  }
  if (stats.riskLow) {
    parts.push(`低 ${stats.riskLow}`);
  }
  const riskDistributionText = parts.length > 0 ? parts.join('，') : '—';

  const topNames = stats.topAggregatedFindings.slice(0, 5).map((f) => f.name);
  const topFindingNamesText =
    topNames.length > 0 ? topNames.map((n) => escapeHtml(n)).join('；') : '—';

  const remediationRows = stats.topAggregatedFindings.slice(0, 8);
  const topFindingsRemediationRowsHtml =
    remediationRows.length > 0
      ? remediationRows
          .map((f, i) => {
            const idx = String(i + 1).padStart(3, '0');
            return `<tr><td>P-${idx}</td><td>${escapeHtml(f.name)}</td><td></td><td>${escapeHtml(riskLevelZh(f.riskLevel))}</td><td></td><td></td></tr>`;
          })
          .join('')
      : '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

  const mgmtRows = stats.topAggregatedFindings.slice(0, 8);
  const topAggregatedRowsMgmtHtml =
    mgmtRows.length > 0
      ? mgmtRows
          .map(
            (f) =>
              `<tr><td>${escapeHtml(f.name)}（${escapeHtml(riskLevelZh(f.riskLevel))}）</td><td></td><td></td><td></td><td></td><td></td></tr>`,
          )
          .join('')
      : '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';

  let detectionSummaryHtml = '';
  if (stats.resultsTotal === 0) {
    detectionSummaryHtml = `任务已配置 <strong>${task.vulnerabilities?.length ?? 0}</strong> 个测试项，当前尚无平台检测结果记录；请在执行完成后刷新本页或从「生成报告」导出材料。`;
  } else {
    detectionSummaryHtml = `平台共返回 <strong>${stats.resultsTotal}</strong> 条检测结果，其中 <strong>${stats.vulnerableCount}</strong> 条判定为存在风险、<strong>${stats.safeCount}</strong> 条未判定为风险。按裁决等级统计：${escapeHtml(riskDistributionText)}。`;
  }

  const evidenceTitles = stats.topAggregatedFindings.slice(0, 3).map((f) => f.name);
  const evidenceVulnTitleHtml =
    evidenceTitles.length > 0
      ? escapeHtml(evidenceTitles.join('；'))
      : stats.vulnerableCount === 0
        ? '—'
        : '（多条，见整改建议表）';

  const coreRiskListHtml = stats.topAggregatedFindings
    .slice(0, 5)
    .map((f) => {
      const reason = results.find(
        (r) => r.vulnerabilityId === f.vulnerabilityId && r.finalVerdict?.vulnerable,
      )?.finalVerdict?.reason;
      const reasonHtml = reason?.trim()
        ? escapeHtml(reason.trim().slice(0, 200))
        : '';
      const tail = reasonHtml ? `：${reasonHtml}${reason && reason.length > 200 ? '…' : ''}` : '';
      return `<li><strong>${escapeHtml(f.name)}（${escapeHtml(riskLevelZh(f.riskLevel))}）</strong>${tail}</li>`;
    })
    .join('');

  const desc = task.description?.trim() ?? '';
  const taskDescriptionHtml = desc ? escapeHtml(desc) : '';

  const runProgress = parseTaskRunProgress(task.metadata);
  let runProgressLine = '—';
  if (runProgress) {
    runProgressLine = `已完成 ${runProgress.completed}/${runProgress.total} 组（检测分组进度）`;
  } else if (task.status === 'running') {
    runProgressLine = '执行中，详见平台任务页';
  } else if (stats.resultsTotal > 0) {
    runProgressLine = `已汇总 ${stats.resultsTotal} 条结果记录`;
  }
  const runProgressSummaryHtml = escapeHtml(runProgressLine);

  const detCfgRaw = buildDetectionConfigSummary(task);
  const detectionConfigSummaryHtml = escapeHtml(detCfgRaw);

  const firstAtPlain = stats.firstDetectionAt;
  const lastAtPlain = stats.lastDetectionAt;
  const processNarrativeHtml =
    stats.resultsTotal > 0
      ? `<p style="margin:0;line-height:1.65;">任务创建于 <strong>${escapeHtml(safeFormat(task.createdAt, 'yyyy-MM-dd HH:mm'))}</strong>，当前状态 <strong>${escapeHtml(statusZh(task.status))}</strong>。任务形态 <strong>${escapeHtml(formatTaskKind(metaKind))}</strong>，目标类型 <strong>${escapeHtml(task.targetType ?? '—')}</strong>，测试模式 <strong>${escapeHtml(attackModeZh(task.attackMode))}</strong>，扫描方式 <strong>${escapeHtml(formatScanMode(task.scanMode))}</strong>。</p><p style="margin:0.55em 0 0;line-height:1.65;">检测引擎：<strong>${detectionConfigSummaryHtml}</strong>。平台已落库 <strong>${stats.resultsTotal}</strong> 条检测结果；其中 <strong>${stats.vulnerableCount}</strong> 条裁决为<strong>存在风险</strong>。首条结果时间 <strong>${escapeHtml(firstAtPlain)}</strong>，末条 <strong>${escapeHtml(lastAtPlain)}</strong>。</p>`
      : `<p style="margin:0;line-height:1.65;">任务创建于 <strong>${escapeHtml(safeFormat(task.createdAt, 'yyyy-MM-dd HH:mm'))}</strong>，当前状态 <strong>${escapeHtml(statusZh(task.status))}</strong>。任务形态 <strong>${escapeHtml(formatTaskKind(metaKind))}</strong>，测试模式 <strong>${escapeHtml(attackModeZh(task.attackMode))}</strong>，扫描方式 <strong>${escapeHtml(formatScanMode(task.scanMode))}</strong>。</p><p style="margin:0.55em 0 0;line-height:1.65;">检测引擎：<strong>${detectionConfigSummaryHtml}</strong>。</p><p style="margin:0.55em 0 0;color:#555;">尚未同步到检测结果明细，请在任务执行完成后刷新本页。</p>`;

  const findingsDetailTbodyHtml = buildFindingsDetailRows(results, vulnNameById, 15);

  const execLogProcessAsideHtml = `<div style="background:#f8f9fa;border-left:4px solid #0066cc;padding:12px 14px;margin:14px 0 18px;font-size:14px;">${processNarrativeHtml}<table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:13px;"><tr><td style="width:26%;border:1px solid #ddd;padding:8px;background:#fafafa;">执行进度</td><td style="border:1px solid #ddd;padding:8px;">${runProgressSummaryHtml}</td></tr><tr><td style="border:1px solid #ddd;padding:8px;background:#fafafa;">结果概况</td><td style="border:1px solid #ddd;padding:8px;">${detectionSummaryHtml}</td></tr></table></div>`;

  const evidenceMappingPrefillRowsHtml = `<tr><td style="vertical-align:top;">平台检测结果</td><td>${escapeHtml(task.id)}</td><td style="text-align:left;">共 ${stats.resultsTotal} 条记录，其中 ${stats.vulnerableCount} 条裁决为「存在风险」</td><td style="text-align:left;">本套件各 Tab / 任务详情</td></tr><tr><td>漏洞库测试项</td><td>—</td><td style="text-align:left;">${task.vulnerabilities?.length ?? 0} 项（任务配置）</td><td style="text-align:left;">任务配置 · 漏洞库</td></tr><tr><td>正式报告</td><td>导出</td><td style="text-align:left;">分项图表与原始证据链</td><td style="text-align:left;">任务页「生成报告」</td></tr>`;

  const evidenceFindingsSectionHtml = `<h2 style="font-size:16px;margin-top:22px;">2.1 检测结果摘录（平台）</h2><p style="font-size:13px;color:#555;margin:6px 0 10px;">按时间倒序至多 12 条；完整对话与请求体请以导出报告为准。</p><table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><th>#</th><th>测试项</th><th>裁决</th><th>等级</th><th>置信度</th><th>时间</th><th>说明（摘录）</th></tr>${buildFindingsDetailRows(results, vulnNameById, 12)}</table>`;

  const stepDesc = escapeHtml(
    `${formatTaskKind(metaKind)}，配置测试项 ${task.vulnerabilities?.length ?? 0} 个；平台返回 ${stats.resultsTotal} 条检测记录。`,
  );
  const evidenceReproduceStep1RowHtml = `<tr><td>1</td><td>自动化检测执行</td><td style="text-align:left;">${stepDesc}</td><td>按任务与漏洞库策略逐项执行</td><td style="text-align:left;">见 §2.1 摘录表</td><td>—</td></tr>`;

  const evidenceAttachmentPrefillRowsHtml = `<tr><td>E-01</td><td>结构化结果</td><td style="text-align:left;">平台检测落库数据（本页 §2.1）</td><td>${escapeHtml(task.id)}</td></tr><tr><td>E-02</td><td>正式报告</td><td style="text-align:left;">合规/交付用扫描报告（可选）</td><td>生成报告 · 导出</td></tr>`;

  const masterDetectionSectionHtml = `<h2>三、检测过程与结果</h2>
<h3>3.1 执行与配置</h3>
<table style="width:100%;border-collapse:collapse;margin:10px 0 16px;">
<tr><td style="width:24%;">任务状态</td><td>${escapeHtml(statusZh(task.status))}</td></tr>
<tr><td>任务形态 / 扫描方式</td><td>${escapeHtml(formatTaskKind(metaKind))} / ${escapeHtml(formatScanMode(task.scanMode))}</td></tr>
<tr><td>测试模式</td><td>${escapeHtml(attackModeZh(task.attackMode))}</td></tr>
<tr><td>检测引擎</td><td>${detectionConfigSummaryHtml}</td></tr>
<tr><td>执行进度</td><td>${runProgressSummaryHtml}</td></tr>
<tr><td>测试地址</td><td>${endpointRaw ? escapeHtml(endpointRaw) : '—'}</td></tr>
<tr><td>结果概况</td><td>${detectionSummaryHtml}</td></tr>
</table>
<h3>3.2 结果明细（至多 15 条，倒序）</h3>
<table style="width:100%;border-collapse:collapse;margin:10px 0;"><tr><th>#</th><th>测试项</th><th>裁决</th><th>等级</th><th>置信度</th><th>时间</th><th>说明（摘录）</th></tr>${findingsDetailTbodyHtml}</table>
<p style="font-size:13px;color:#666;margin:8px 0 0;">API/Config 维度拆分、会话与原始报文请以「生成报告」导出为准。</p>`;

  let mgmtOverallRiskPrefillHtml =
    '<span style="color:#666;">以下为技术侧参考，请管理层结合业务终裁。</span> ';
  if (stats.resultsTotal === 0) {
    mgmtOverallRiskPrefillHtml +=
      '当前无检测结果记录，平台侧无法给出量化风险分级；待执行检测后更新本页。';
  } else if (stats.riskCritical > 0 || stats.riskHigh > 0) {
    mgmtOverallRiskPrefillHtml += `<strong>技术参考：</strong>存在<strong>严重或高</strong>等级裁决，建议优先评估暴露面与是否收紧上线范围。`;
  } else if (stats.vulnerableCount > 0) {
    mgmtOverallRiskPrefillHtml += `<strong>技术参考：</strong>存在「存在风险」裁决（${escapeHtml(riskDistributionText)}），建议完成整改与回归后再评估上线。`;
  } else {
    mgmtOverallRiskPrefillHtml += `<strong>技术参考：</strong>当前记录均未裁决为「存在风险」，仍建议结合敏感数据与触达场景做业务侧确认。`;
  }

  let mgmtImpactPrefillHtml = '';
  if (stats.resultsTotal === 0) {
    mgmtImpactPrefillHtml =
      '待检测完成后，根据检出项与数据敏感度补充对客、对内业务影响；当前无平台数据支撑。';
  } else if (stats.vulnerableCount === 0) {
    mgmtImpactPrefillHtml = `本次 ${stats.resultsTotal} 条平台记录均未裁决为「存在风险」；若生产环境与测试配置一致，技术侧<strong>未见即时利用链证据</strong>，业务影响请结合真实数据流再确认。`;
  } else {
    mgmtImpactPrefillHtml = `平台侧记录 <strong>${stats.vulnerableCount}</strong> 条「存在风险」结果（分布：${escapeHtml(riskDistributionText)}）。代表测试项包括：${topFindingNamesText}。请结合客户数据、对外接口与合规要求评估实际影响面。`;
  }

  const mgmtControllabilityPrefillHtml =
    '技术上可通过基线加固、访问控制、提示与模型策略、日志审计等手段缓解；是否达到业务可接受水平需由业务与法务/合规共同确认。';

  const remediationTop = stats.topAggregatedFindings.slice(0, 6);
  const remediationFindingDetailsHtml =
    remediationTop.length === 0
      ? '<p style="color:#555;font-size:14px;">暂无「存在风险」聚合项；若仅有未裁决风险的结果，请结合导出报告人工归纳。</p>'
      : `<h3>主要发现（平台摘录）</h3><table style="width:100%;border-collapse:collapse;margin:10px 0 14px;"><tr><th>问题</th><th>等级</th><th>命中次数</th><th>裁决说明（摘录）</th></tr>${remediationTop
          .map((f) => {
            const hit = results.find(
              (r) => r.vulnerabilityId === f.vulnerabilityId && r.finalVerdict?.vulnerable,
            );
            const raw = hit?.finalVerdict?.reason?.trim();
            const reason = raw
              ? escapeHtml(raw.slice(0, 220)) + (raw.length > 220 ? '…' : '')
              : '—';
            return `<tr><td style="text-align:left;">${escapeHtml(f.name)}</td><td>${escapeHtml(riskLevelZh(f.riskLevel))}</td><td>${f.hitCount}</td><td style="text-align:left;">${reason}</td></tr>`;
          })
          .join('')}</table><p style="font-size:13px;color:#555;">下表为整改任务留白，请按上表逐项闭环。</p>`;

  const masterRemediationBulletsHtml =
    remediationTop.length === 0
      ? '<li>待检出明确问题后，按优先级拆解整改项并设定责任人与截止时间。</li><li>修复后安排同范围回归检测，并保留导出报告备查。</li><li>将本次基线纳入后续 Agent / 应用上线门禁。</li>'
      : remediationTop
          .slice(0, 5)
          .map((f) => {
            const lv = escapeHtml(riskLevelZh(f.riskLevel));
            const nm = escapeHtml(f.name);
            return `<li>针对「${nm}」（${lv}）：复核相关配置与策略，限制不必要的外联与敏感能力；修复后在平台对同任务执行回归并归档报告。</li>`;
          })
          .join('');

  let masterConclusionDraftHtml = '';
  if (stats.resultsTotal === 0) {
    masterConclusionDraftHtml =
      '<strong>技术结论（草稿）：</strong>尚无检测落库数据，无法给出上线建议；请先完成任务执行与复核。<span style="color:#666;">（请修订后签章）</span>';
  } else if (stats.riskCritical > 0 || stats.riskHigh > 0) {
    masterConclusionDraftHtml = `<strong>技术结论（草稿）：</strong>平台存在<strong>严重/高</strong>等级裁决，<strong>不建议</strong>在未完成整改与回归前默认同意上线；请业务方确认是否采取临时缓解与例外审批。<span style="color:#666;">（请修订后签章）</span>`;
  } else if (stats.vulnerableCount > 0) {
    masterConclusionDraftHtml = `<strong>技术结论（草稿）：</strong>存在「存在风险」记录，建议<strong>完成整改并通过回归</strong>后再评估上线；若接受残余风险，请书面确认范围与补偿控制。<span style="color:#666;">（请修订后签章）</span>`;
  } else {
    masterConclusionDraftHtml = `<strong>技术结论（草稿）：</strong>当前平台记录未裁决为「存在风险」，在技术配置与测试环境代表性成立的前提下，可作为<strong>低风险技术信号</strong>；仍建议保留例行检测与变更后再评估机制。<span style="color:#666;">（请修订后签章）</span>`;
  }

  return {
    taskName,
    taskNameHtml: escapeHtml(taskName),
    taskId: task.id,
    taskIdHtml: escapeHtml(task.id),
    vulnCount: Array.isArray(task.vulnerabilities) ? task.vulnerabilities.length : 0,
    docDate: safeFormat(task.updatedAt, 'yyyy-MM-dd'),
    createdDate: safeFormat(task.createdAt, 'yyyy-MM-dd'),
    updatedDate: safeFormat(task.updatedAt, 'yyyy-MM-dd'),
    dateRange: `${safeFormat(task.createdAt, 'yyyy-MM-dd')} ~ ${safeFormat(task.updatedAt, 'yyyy-MM-dd')}`,
    statusLabel: statusZh(task.status),
    taskTypeLabel: escapeHtml(taskTypeLabel),
    attackModeLabel: escapeHtml(formatTestingModeLabel(task.attackMode)),
    targetType: escapeHtml(task.targetType ?? '—'),
    platformFamily: escapeHtml(
      task.platformFamily && String(task.platformFamily).trim()
        ? String(task.platformFamily)
        : '—',
    ),
    taskDescriptionHtml,
    endpointUrl: endpointRaw,
    endpointUrlHtml: endpointRaw ? escapeHtml(endpointRaw) : '',
    targetAgentNameHtml: agentName ? escapeHtml(agentName) : '',
    scanModeLabel: escapeHtml(formatScanMode(task.scanMode)),
    taskKindLabel: escapeHtml(formatTaskKind(metaKind)),
    resultsTotal: stats.resultsTotal,
    vulnerableCount: stats.vulnerableCount,
    safeCount: stats.safeCount,
    riskCritical: stats.riskCritical,
    riskHigh: stats.riskHigh,
    riskMedium: stats.riskMedium,
    riskLow: stats.riskLow,
    riskDistributionText: escapeHtml(riskDistributionText),
    firstDetectionAt: escapeHtml(stats.firstDetectionAt),
    lastDetectionAt: escapeHtml(stats.lastDetectionAt),
    highestRiskLabel: escapeHtml(stats.highestRiskLabel),
    topFindingNamesText,
    topFindingsRemediationRowsHtml,
    topAggregatedRowsMgmtHtml,
    detectionSummaryHtml,
    evidenceVulnTitleHtml,
    coreRiskListHtml,
    attackModeZhHtml: escapeHtml(attackModeZh(task.attackMode)),
    detectionConfigSummaryHtml,
    runProgressSummaryHtml,
    processNarrativeHtml,
    findingsDetailTbodyHtml,
    execLogProcessAsideHtml,
    evidenceMappingPrefillRowsHtml,
    evidenceFindingsSectionHtml,
    evidenceReproduceStep1RowHtml,
    evidenceAttachmentPrefillRowsHtml,
    masterDetectionSectionHtml,
    mgmtOverallRiskPrefillHtml,
    mgmtImpactPrefillHtml,
    mgmtControllabilityPrefillHtml,
    remediationFindingDetailsHtml,
    masterRemediationBulletsHtml,
    masterConclusionDraftHtml,
  };
}
