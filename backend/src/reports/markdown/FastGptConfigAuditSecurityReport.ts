/**
 * FastGPT 工作流导出 JSON 配置静态审计 — 正文与术语独立于 Dify / Coze 模板。
 */

import {
  buildReportSection8ReferenceLines,
  buildReportSections9And10,
} from './ApiBlackboxSecurityReport';
import {
  buildRetestComparisonMarkdownLines,
  escMarkdownCell,
  escMarkdownCellMultiline,
  formatExecutionMinutesZhCell,
  resolveAgentOutput,
  verificationResultCountByVulnerabilityId,
} from './reportMarkdownUtils';
import { appendSingleTestReportTitleSuffix } from './singleTestReportEnrichment';

import type { DifyConfigAuditResult } from '../../services/difyConfigAuditService';
import {
  type DifyNodeInventoryItem,
  formatRuleHitConfigNodeDisplay,
} from '../../services/difyConfigStructure';
import { tryParseFastGptStructureForRules } from '../../services/fastgptConfigStructure';
import type { ReportData } from '../../services/reportTypes';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .slice(0, 4000);
}

function riskCn(r: string): string {
  const m: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  };
  return m[r] ?? r;
}

/** 独立 FastGPT 导出（JSON）审计结果 → 完整 Markdown（供 createAuditReport 使用） */
export function renderFastGptConfigAuditReportFromAuditResult(
  audit: DifyConfigAuditResult,
  fileName?: string,
  opts?: { reportTitle?: string },
): string {
  const h1 = opts?.reportTitle?.trim() || '大模型安全评估报告（FastGPT 工作流 · 配置静态审计）';
  const lines: string[] = [
    `# ${h1}`,
    '',
    `> **测试类型**：FastGPT 工作流导出 JSON 配置静态审计`,
    '',
    '## 文档控制信息',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    '| 报告名称 | FastGPT 工作流安全评估报告（配置审计） |',
    `| 被测文件 | ${fileName ? esc(fileName) : '—'} |`,
    `| 综合风险 | **${riskCn(audit.overallRisk)}（${audit.overallRisk}）** |`,
    `| 出具日期 | ${new Date().toISOString().slice(0, 10)} |`,
    '| 执行平台 | 智安 |',
    '',
    '---',
    '',
    '# 1. 执行摘要',
    '',
    esc(audit.summary),
    '',
    '本轮静态审计共输出 ' +
      String(audit.findings.length) +
      ' 条结构化发现；综合风险为 ' +
      riskCn(audit.overallRisk) +
      '。',
    '',
    '## 1.1 管理层摘要',
    '',
    '- **配置面**：关注工作流导出 JSON 中模型路由、插件/工具、知识库与变量等高危组合。',
    '- **证据**：每条发现含位置与证据片段，便于研发定位配置节点。',
    '',
    '## 1.2 关键结论',
    '',
    '- 请优先处理 critical / high 级别项，再安排中低优先级整改。',
    '',
    '---',
    '',
    '# 2. 测试目标',
    '',
    '1. 识别工作流中可能导致数据外泄、越权执行或危险默认的配置。',
    '2. 检查工具链、外部请求与敏感变量是否缺乏隔离与审计。',
    '',
    '---',
    '',
    '# 3. 测试对象与业务背景',
    '',
    `### 3.1 测试对象概述（配置审计）`,
    '',
    fileName ? `- **来源文件**：${esc(fileName)}` : '- **来源**：上传或导出的 FastGPT 工作流 JSON',
    '',
    '---',
    '',
    '# 4. 测试范围与限制',
    '',
    '- **纳入**：静态导出配置（JSON，兼容 YAML 包裹）可解析范围内的规则与 LLM 审计结论。',
    '- **未纳入**：运行时真实流量、租户侧 IAM 与基础设施层（除非导出配置中显式体现）。',
    '',
    '---',
    '',
    '# 5. 测试方法与判定标准',
    '',
    '- **方法**：规则/签名 + 可选 LLM 结构化审查。',
    '- **严重度**：按 findings[].severity 聚合为 overallRisk。',
    '',
    '---',
    '',
    '# 6. 总体结论与风险汇总',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 综合风险 | ${audit.overallRisk} |`,
    `| 发现条数 | ${audit.findings.length} |`,
    '',
    '---',
    '',
    '# 7. 详细发现',
    '',
  ];

  if (audit.truncated || (audit.warnings && audit.warnings.length)) {
    lines.push('> **提示**', '>');
    if (audit.warnings?.length) {
      for (const w of audit.warnings) {
        lines.push(`> - ${esc(w)}`);
      }
    }
    if (audit.truncated) {
      lines.push('> - 输入或工作流可能被截断，结论需在完整导出上复核。');
    }
    lines.push('');
  }

  audit.findings.forEach((f, i) => {
    lines.push(
      '## 7.' +
        String(i + 1) +
        ' [' +
        f.severity.toUpperCase() +
        '] ' +
        esc(f.category) +
        ' — ' +
        esc(f.location),
      '',
    );
    lines.push(f.issue, '');
    lines.push(`- **证据**：${esc(f.evidence)}`, '');
    lines.push(`- **修复建议**：${esc(f.recommendation)}`, '');
    lines.push('');
  });

  if (audit.recommendations.length) {
    lines.push('## 通用建议', '');
    for (const r of audit.recommendations) {
      lines.push(`- ${esc(r)}`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '# 8. 参考标准与依据',
    '',
    '- OWASP Agent / LLM 与组织内部基线（可补充）。',
    '',
  );
  lines.push('# 9. 管理结论与复测', '', '- 修复配置后请重新上传并执行审计任务以关闭发现项。', '');
  lines.push('---', '', '# 10. 保密与版权声明', '');
  lines.push('- **保密等级**：本报告默认按「内部保密/受控分发」处理，除非双方书面约定另行公开。');
  lines.push(
    '- **分发与存储**：仅限授权人员阅读；禁止在公共渠道传播（公开网盘、社交平台、公开工单/论坛等）。如需外部共享，应先脱敏并获得书面批准。',
  );
  lines.push(
    '- **内容使用限制**：报告内容（含截图、表格、结论与附录）不得用于对外营销、公开宣传或对第三方的法律主张，除非获得书面许可。',
  );
  lines.push(
    '- **第三方引用**：如引用 OWASP、MITRE、NIST、ISO 等公开资料，其版权归原权利人所有；本报告的引用仅用于安全评估说明。',
  );
  lines.push(
    '- **免责声明**：报告结论受测试时点的环境、配置、模型行为与可观测证据影响；本报告不构成对系统“绝对安全”的保证。整改后应以复测结果为准。',
  );
  lines.push(
    '- **版权声明**：除非另有约定，本报告模板与生成逻辑归 智安 所有；委托方获得对本报告的内部使用权与整改复测使用权。',
  );
  lines.push('');

  return lines.join('\n');
}

function isConfigStaticTask(data: ReportData): boolean {
  return (
    data.taskKind === 'config_static' ||
    String(data.taskTypeCode ?? '').toLowerCase() === 'dify_config_static'
  );
}

function formatRuntimeVerificationRuleStatsFromDetection(
  detectionResults: unknown,
): Map<string, number> {
  const d =
    detectionResults && typeof detectionResults === 'object'
      ? (detectionResults as Record<string, unknown>)
      : null;
  const hits = Array.isArray(d?.ruleHits) ? (d.ruleHits as unknown[]) : [];
  const stats = new Map<string, number>();
  for (const h of hits) {
    if (!h || typeof h !== 'object') {
      continue;
    }
    const o = h as Record<string, unknown>;
    const name = String(o.ruleName ?? '').trim();
    const id = String(o.ruleId ?? '').trim();
    const label = name || id;
    if (label) {
      stats.set(label, (stats.get(label) ?? 0) + 1);
    }
  }
  return stats;
}

/**
 * §7.2「配置节点」：在可解析任务 YAML 时映射为 Structured explorer 同款节点标题（类型 · id）；否则回退 logicalPath 或全文行号。
 */
function formatRuntimeConfigNodesFromRuleHits(
  detectionResults: unknown,
  dsl?: { yamlText: string; nodes: DifyNodeInventoryItem[] },
): string {
  const d =
    detectionResults && typeof detectionResults === 'object'
      ? (detectionResults as Record<string, unknown>)
      : null;
  const hits = Array.isArray(d?.ruleHits) ? (d.ruleHits as unknown[]) : [];
  const parts: string[] = [];
  const grouped = new Map<string, { count: number; rules: Set<string> }>();

  for (const h of hits) {
    if (!h || typeof h !== 'object') {
      continue;
    }
    const o = h as Record<string, unknown>;
    let cellLine = '—';
    if (dsl?.nodes?.length && dsl.yamlText) {
      const explorer = formatRuleHitConfigNodeDisplay(dsl.yamlText, dsl.nodes, o);
      if (explorer) {
        cellLine = explorer;
      }
    }
    if (cellLine === '—') {
      const lp = o.logicalPath != null ? String(o.logicalPath).trim() : '';
      if (lp) {
        cellLine = lp;
      }
    }
    if (cellLine === '—') {
      const sl = typeof o.startLine === 'number' && Number.isFinite(o.startLine) ? o.startLine : 0;
      const el = typeof o.endLine === 'number' && Number.isFinite(o.endLine) ? o.endLine : sl;
      const scope = o.matchScope != null ? String(o.matchScope) : '';
      const ms = typeof o.matchStart === 'number' ? o.matchStart : -1;
      if (sl > 0 && ms >= 0 && (scope === 'full_text' || scope === '')) {
        cellLine = el > sl ? `全文命中 · 约第 ${sl}–${el} 行` : `全文命中 · 约第 ${sl} 行`;
      }
    }
    const ruleName = String(o.ruleName ?? o.ruleId ?? '').trim();
    parts.push(cellLine);
    const existing = grouped.get(cellLine);
    if (existing) {
      existing.count += 1;
      if (ruleName) {
        existing.rules.add(ruleName);
      }
    } else {
      grouped.set(cellLine, {
        count: 1,
        rules: new Set(ruleName ? [ruleName] : []),
      });
    }
  }
  if (parts.length === 0) {
    return '—';
  }

  const summary = `节点聚合：${grouped.size} 个节点 / ${parts.length} 次命中`;
  const deduped = Array.from(grouped.entries()).map(([line, meta]) => {
    const countText = `（命中 ${meta.count} 次）`;
    const ruleText = meta.rules.size > 0 ? `；关联规则：${Array.from(meta.rules).join('、')}` : '';
    return `- ${line}${countText}${ruleText}`;
  });
  return [summary, ...deduped].join('\n');
}

type RuntimeReportRow = {
  detectionResults?: unknown;
  verificationCommand?: string;
  finalVerdict?: unknown;
};

function requestUrlString(r: { request?: unknown }): string {
  const req = r.request as Record<string, unknown> | string | null | undefined;
  if (req && typeof req === 'object' && 'url' in req) {
    return String((req as { url?: unknown }).url ?? '');
  }
  return '';
}

/** 配置 YAML 规则/命令级静态扫描回合（与 attack_results 持久化一致）。 */
function isStaticConfigYamlResult(r: { request?: unknown }): boolean {
  return requestUrlString(r) === 'static://config-json';
}

/** 验证命令主列 + 命令子 ID / finding_records 脚注（对齐 API 黑盒报告）。 */
function formatVerificationCommandMarkdownCell(
  r: { verificationCommand?: string; commandId?: string },
  cellFn: typeof escMarkdownCell,
): string {
  const commandIdRaw = r.commandId != null ? String(r.commandId).trim() : '';
  const commandText = String(r.verificationCommand ?? '').trim() || '—';
  const isSyntheticFindingCommandId = commandIdRaw.startsWith('finding_record:');
  const primaryCmd =
    commandText !== '—' ? commandText : isSyntheticFindingCommandId ? '—' : commandIdRaw || '—';
  const footnote = isSyntheticFindingCommandId
    ? '（出自 finding_records，命令以归一化记录为准）'
    : `命令子 ID：${cellFn(commandIdRaw || '—')}`;
  return `${cellFn(primaryCmd)}（${footnote}）`;
}

/** §7.3：优先 detection_results；无规则命中时回退为漏洞验证说明（verificationCommand）。 */
function formatRuntimeVerificationRulesForReportRow(r: RuntimeReportRow): {
  rules: string;
  hitCount: string;
} {
  const stats = formatRuntimeVerificationRuleStatsFromDetection(r.detectionResults);
  if (stats.size > 0) {
    const rows = Array.from(stats.entries());
    return {
      rules: rows.map(([rule]) => rule).join('\n'),
      hitCount: rows.map(([rule, count]) => `${rule} × ${count}`).join('\n'),
    };
  }
  const cmd = String(r.verificationCommand ?? '').trim();
  return { rules: cmd || '—', hitCount: '—' };
}

/** §7.3：配置节点仅来自验证规则 ruleHits（见 formatRuntimeConfigNodesFromRuleHits）。 */
function formatRuntimeConfigNodesForReportRow(
  r: RuntimeReportRow,
  dsl?: { yamlText: string; nodes: DifyNodeInventoryItem[] },
): string {
  return formatRuntimeConfigNodesFromRuleHits(r.detectionResults, dsl);
}

function resolveRetestStatusByVulnerabilityId(
  vulnerabilityId: string,
  cmp?: ReportData['retestComparison'],
): '老漏洞-已修复' | '老漏洞-未修复' | '新漏洞' | '—' {
  if (!cmp || !vulnerabilityId) {
    return '—';
  }
  if (cmp.newRiskIds.includes(vulnerabilityId)) {
    return '新漏洞';
  }
  if (cmp.unchangedRiskIds.includes(vulnerabilityId)) {
    return '老漏洞-未修复';
  }
  if (cmp.fixedRiskIds.includes(vulnerabilityId)) {
    return '老漏洞-已修复';
  }
  return '—';
}

export function getFastGptConfigTaskReportTitle(data: ReportData): string {
  const base = data.targetName || data.taskName || 'Attack Task';
  let title: string;
  if (isConfigStaticTask(data)) {
    title = `${base} FastGPT 工作流纯配置 JSON 扫描安全报告`;
  } else {
    title = `${base} FastGPT 工作流配置灰盒安全评估报告（静态审计 + 对抗验证）`;
  }
  return appendSingleTestReportTitleSuffix(title, data);
}

function configTaskRuntimeRiskLabel(data: ReportData): string {
  if (data.summary.highRiskCount > 0) {
    return '高风险（High）';
  }
  if (data.summary.mediumRiskCount > 0 || data.summary.vulnerableFindings > 0) {
    return '中风险（Medium）';
  }
  return '低风险（Low）';
}

/** 任务型报告：FastGPT 配置审计任务 + attack_results（若有），章节结构与 Dify / Coze 版平行。 */
export function renderFastGptConfigAuditReportFromTaskData(data: ReportData): string {
  const cell = escMarkdownCell;
  const meta = (data.taskMetadata || {}) as Record<string, unknown>;
  const configAudit = meta.configAudit as { json?: string; fileName?: string } | undefined;
  const staticSummary = meta.configAuditStaticSummary as
    | {
        summary?: string;
        overallRisk?: string;
        findingsCount?: number;
        findings?: Array<{
          severity?: string;
          category?: string;
          location?: string;
          issue?: string;
          evidence?: string;
          recommendation?: string;
        }>;
        recommendations?: string[];
        warnings?: string[];
        truncated?: boolean;
      }
    | undefined;

  const title = getFastGptConfigTaskReportTitle(data);
  const org = data.organizationName || data.organizationId;
  const taskName = data.taskName || 'Attack Task';
  const targetName = data.targetName || taskName;
  const targetDisplayType = data.targetDisplayType || data.targetType || '—';
  const issued = new Date().toISOString().slice(0, 10);

  const dslYamlForReport = String(configAudit?.json ?? '').trim();
  const dslStructureParsed = dslYamlForReport
    ? tryParseFastGptStructureForRules(dslYamlForReport)
    : null;
  const dslCtxForRuntimeNodes =
    dslStructureParsed?.inventory?.nodes?.length && dslYamlForReport
      ? { yamlText: dslYamlForReport, nodes: dslStructureParsed.inventory.nodes }
      : undefined;
  const testRange =
    data.summary.testStart && data.summary.testEnd
      ? `${data.summary.testStart.slice(0, 10)} 至 ${data.summary.testEnd.slice(0, 10)}`
      : '—';

  const staticOnly = isConfigStaticTask(data);
  const testTypeZh = staticOnly
    ? 'FastGPT 工作流导出 JSON 配置静态审计（无运行时对抗回合）'
    : 'FastGPT 工作流导出 JSON 静态审计，并辅以基于漏洞用例的 API / 应用对抗验证（灰盒）';
  const boundaryZh = staticOnly
    ? '以导出工作流结构与规则/可选 LLM 静态审查为主；本任务未执行运行时流量验证。'
    : '以导出工作流 JSON 结构、规则与静态审查结论为主；第 7.3 节运行时证据来自本任务触发的 API 回合，为补充证据，不等价于完整 API 黑盒渗透范围。';

  const dslFile =
    configAudit?.fileName != null && String(configAudit.fileName).trim() !== ''
      ? cell(String(configAudit.fileName).trim())
      : '—';
  const staticRiskCell =
    staticSummary?.overallRisk != null && String(staticSummary.overallRisk).trim() !== ''
      ? `**${riskCn(String(staticSummary.overallRisk))}（${cell(String(staticSummary.overallRisk))}）**`
      : '—';

  const { highRiskCount, mediumRiskCount, lowRiskCount, vulnerableFindings, totalFindings } =
    data.summary;

  const vulnerableResults = data.results.filter((r) => {
    const v = r.finalVerdict as Record<string, unknown> | undefined;
    return v?.vulnerable === true || String(v?.vulnerable).toLowerCase() === 'true';
  });
  const staticConfigYamlResults = data.results.filter(isStaticConfigYamlResult);
  const apiRuntimeVulnerableResults = vulnerableResults.filter((r) => !isStaticConfigYamlResult(r));

  const lines: string[] = [
    `# ${title}`,
    '',
    `> **测试类型**：${testTypeZh}`,
    '',
    '## 文档控制信息',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 报告名称 | ${cell(title)} |`,
    `| 测试对象 | ${cell(targetName)} |`,
    `| 任务名称 | ${cell(taskName)} |`,
    `| 测试类型 | ${cell(testTypeZh)} |`,
    `| 评估边界 | ${cell(boundaryZh)} |`,
    `| 参考标准 | ${cell('OWASP Agent, OWASP LLM, APAIS')} |`,
    `| 被测工作流导出文件（JSON） | ${dslFile} |`,
    `| 静态综合风险 | ${staticRiskCell} |`,
    `| 组织名称 | ${cell(org)} |`,
    `| 智能体类型/目标类型 | ${cell(targetDisplayType)} |`,
    `| 攻击模式 | ${cell(data.attackMode || '—')} |`,
    `| 测试周期 | ${cell(testRange)} |`,
    `| 出具日期 | ${issued} |`,
    '| 执行平台 | 智安 |',
    '',
    '---',
    '',
    '# 1. 执行摘要',
    '',
  ];

  if (staticSummary?.summary) {
    lines.push(esc(staticSummary.summary), '');
    lines.push(
      '本轮 **静态工作流导出 JSON 审计** 综合风险为 **' +
        riskCn(String(staticSummary.overallRisk ?? '—')) +
        '（' +
        cell(String(staticSummary.overallRisk ?? '—')) +
        '）**；结构化发现 **' +
        String(staticSummary.findingsCount ?? staticSummary.findings?.length ?? 0) +
        '** 条。',
      '',
    );
  } else {
    lines.push(
      '（未在任务元数据中找到 `configAuditStaticSummary`，可能尚未执行静态导出配置审计或未上传工作流导出 JSON。）',
      '',
    );
  }

  if (data.results.length > 0) {
    lines.push(
      `在记录的 **${totalFindings}** 条运行时执行结果（${data.resultsSource === 'finding_records' ? 'finding_records / 归一化' : 'attack_results'}）中，判定为存在安全风险（vulnerable）的共 **${vulnerableFindings}** 条；按漏洞维度汇总：高风险相关 **${highRiskCount}** 项、中风险 **${mediumRiskCount}** 项、低风险 **${lowRiskCount}** 项。**本节为对抗验证补充，仍以第 7.1 节配置静态发现为主证据。**`,
      '',
    );
    lines.push(`> **运行时综合风险等级（自动估算）**：**${configTaskRuntimeRiskLabel(data)}**`, '');
  }

  if (staticSummary?.overallRisk != null && String(staticSummary.overallRisk).trim() !== '') {
    lines.push(
      `> **静态审计综合风险**：**${riskCn(String(staticSummary.overallRisk))}（${cell(String(staticSummary.overallRisk))}）**`,
      '',
    );
  }

  lines.push(
    '## 1.1 管理层摘要',
    '',
    '- **配置面**：关注工作流导出 JSON 中模型路由、插件/工具、知识库与变量等高危组合；证据以 **配置节点位置（location）与证据片段** 为主。',
    '- **执行面（若存在）**：关注模型输出、工具/API 调用链路与 Judge 结论（`finalVerdict`），作为配置风险的运行时佐证。',
    '- **建议**：优先处理静态发现中的 **critical / high**，并对运行时 **vulnerable** 项组织复测闭环。',
    '',
    '## 1.2 关键结论',
    '',
    `- 静态：发现条数 ${String(staticSummary?.findingsCount ?? staticSummary?.findings?.length ?? 0)}；请优先整改高严重度配置项。`,
  );

  if (data.results.length > 0) {
    lines.push(
      `- 运行时：${totalFindings} 条结果；需处置（vulnerable）：${vulnerableFindings} 条。`,
    );
  } else {
    lines.push('- 运行时：本任务未产生执行结果记录；若以纯静态扫描为主，请以第 7.1 节为准。');
  }
  lines.push(
    `- 若静态摘要缺失，请确认任务已执行完成且已上传 FastGPT 工作流 JSON，且 \`configAuditStaticSummary\` 已写入。`,
    '',
    ...buildRetestComparisonMarkdownLines(data),
    '---',
    '',
    '# 2. 测试目标',
    '',
    '| 测试项 | 测试目标 |',
    '| --- | --- |',
    `| ${cell('工作流结构')} | ${cell('识别节点编排、模型路由、条件分支中可能导致数据外泄、越权执行或危险默认的配置。')} |`,
    `| ${cell('工具链与高影响路径')} | ${cell('在工具/插件/HTTP/SQL 已启用时，是否存在缺乏鉴权、参数注入面、SSRF 或 NL→可执行语句 等可触发路径？')} |`,
    `| ${cell('敏感变量与知识库')} | ${cell('会话变量、环境变量、知识库/检索器组合是否可能导致敏感信息进入模型上下文或对外部系统过度暴露？')} |`,
    `| ${cell('静态规则与可选 LLM 审计')} | ${cell('在可解析的导出配置结构（JSON，兼容 YAML 包裹）内，由规则/签名与可选结构化 LLM 审查输出可定位的发现项。')} |`,
  );
  if (!staticOnly) {
    lines.push(
      `| ${cell('用例化 API / Bot 对抗（灰盒）')} | ${cell('基于漏洞库与 Attack Commands，对运行中的 Bot / 开放 API 进行与配置相关的对抗验证，结论见第 7.3 节。')} |`,
    );
  }
  lines.push(
    '',
    '---',
    '',
    '# 3. 测试对象与业务背景',
    '',
    '## 3.1 测试对象概述',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 目标应用名称 | ${cell(targetName)} |`,
    `| 被测工作流导出文件（JSON） | ${dslFile} |`,
    `| 任务说明 | ${cell(data.taskDescription || '—')} |`,
    '',
    '## 3.2 资产与范围提示',
    '',
    '请结合业务实际补充：FastGPT 工作流 / 应用版本、租户与环境、数据分级，以及允许的插件与外部依赖范围（本段为固定提示，可在导出后编辑）。',
    '',
  );

  if (data.vulnerabilities?.length) {
    const resultCountByVuln = verificationResultCountByVulnerabilityId(data);
    lines.push('## 3.3 任务所选漏洞（库）', '');
    lines.push('| 漏洞名称 | 风险等级 | OWASP Agent | 验证规则数量 | 验证数据数量 |');
    lines.push('| --- | --- | --- | ---: | ---: |');
    for (const v of data.vulnerabilities) {
      const owasp =
        v.owaspId != null && String(v.owaspId).trim() !== '' ? cell(String(v.owaspId).trim()) : '—';
      const rulesCount =
        typeof v.detectionRulesCount === 'number' ? String(v.detectionRulesCount) : '—';
      const verificationCount =
        typeof v.verificationDataCount === 'number'
          ? v.verificationDataCount
          : (resultCountByVuln.get(v.id) ?? 0);
      lines.push(
        `| ${cell(v.name)} | ${cell(String(v.riskLevel || '—'))} | ${owasp} | ${rulesCount} | ${verificationCount} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    '## 3.4 风险评级',
    '',
    '| 等级 | 定义 |',
    '| --- | --- |',
    `| P0 / Critical | ${cell('存在会话越权、关键数据泄露、对象级授权缺陷或可直接形成高影响数据面风险。')} |`,
    `| P1 / High | ${cell('较少前提即可利用，可能造成越界回答、策略泄露、数据过量暴露或成本失控。')} |`,
    `| P2 / Medium | ${cell('需要特定前提或更多交互，主要削弱安全边界与治理完整性。')} |`,
    `| P3 / Low | ${cell('对稳健性、审计或运营成本有影响，建议纳入迭代优化。')} |`,
    '',
    '---',
    '',
    '# 4. 测试范围与限制',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 纳入 | ${cell('静态导出配置结构（JSON，兼容 YAML 包裹）可解析范围内的规则匹配、签名与可选 LLM 结构化审查结论。')} |`,
    `| 未纳入 | ${cell('租户侧 IAM、基础设施与 FastGPT 平台内核（除非导出 JSON 中显式体现）；纯静态任务不采集运行时真实流量。')} |`,
    `| 运行时补充（灰盒） | ${cell(staticOnly ? '本任务类型不包含运行时对抗回合。' : '运行时证据仅来自本任务触发的 API / Agent 验证，不等价于脱离配置上下文的完整黑盒渗透。')} |`,
    `| 限制 | ${cell('结论依赖导出时的工作流配置内容与解析范围；截断或部分导出需在完整配置上复核。')} |`,
    '',
    '---',
    '',
    '# 5. 测试方法与判定标准',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 静态分析 | ${cell('规则/签名扫描导出配置；可选结合 LLM 对结构风险做结构化输出。')} |`,
    `| 严重度 | ${cell('静态发现以 findings[].severity 与 overallRisk 表述；运行时以 finalVerdict.vulnerable 与 riskLevel 为准。')} |`,
    `| 判定标准（运行时） | ${cell('vulnerable=true 表示存在需关注的安全表现或与预期安全侧输出不一致；可结合规则引擎与 Judge。')} |`,
    '',
    '---',
    '',
    '# 6. 总体结论与风险汇总',
    '',
    '## 6.1 静态审计汇总',
    '',
    '| 指标 | 值 |',
    '| --- | --- |',
    `| 综合风险（静态） | ${cell(String(staticSummary?.overallRisk ?? '—'))} |`,
    `| 发现条数（静态） | ${String(staticSummary?.findingsCount ?? staticSummary?.findings?.length ?? 0)} |`,
    `| 截断/警告 | ${
      staticSummary?.truncated
        ? '是（输入或工作流可能被截断）'
        : staticSummary?.warnings?.length
          ? '见第 7.1 节提示'
          : '—'
    } |`,
    '',
  );

  if (data.results.length > 0) {
    lines.push(
      '## 6.2 运行时 / 对抗验证汇总',
      '',
      '| 指标 | 数值 |',
      '| --- | ---: |',
      `| 结果条数 | ${totalFindings} |`,
      `| 判定为 vulnerable | ${vulnerableFindings} |`,
      `| 高风险计数 | ${highRiskCount} |`,
      `| 中风险计数 | ${mediumRiskCount} |`,
      `| 低风险计数 | ${lowRiskCount} |`,
      `| Execution Time（执行耗时） | ${formatExecutionMinutesZhCell(data.summary.executionTime)} |`,
      '',
    );
  }

  lines.push(
    '---',
    '',
    '# 7. 详细发现',
    '',
    '> **本章结构**：**第 7.1 节**为导出工作流 JSON 的**大模型结构化审计**（表中「配置定位」为审计结论中的结构描述）；**第 7.2 节**为配置导出文本 **规则/命令级**静态扫描（数据源 `static://config-json`）；**第 7.3 节**为运行时 API / 对抗验证。**第 7.2 / 7.3 节**的「配置节点」由**验证规则**映射至工作流节点，与 7.1 节「配置定位」含义不同。',
    '',
    '## 7.1 导出 JSON 结构化审计（大模型）',
    '',
  );

  if (staticSummary?.truncated || (staticSummary?.warnings && staticSummary.warnings.length > 0)) {
    lines.push('> **提示**', '>');
    if (staticSummary.warnings?.length) {
      for (const w of staticSummary.warnings) {
        lines.push(`> - ${esc(w)}`);
      }
    }
    if (staticSummary.truncated) {
      lines.push('> - 输入或工作流可能被截断，结论需在完整导出上复核。');
    }
    lines.push('');
  }

  const staticFindings = Array.isArray(staticSummary?.findings) ? staticSummary.findings : [];
  if (staticFindings.length === 0) {
    lines.push('*（暂无结构化静态发现，或静态审计未执行。）*', '');
  } else {
    staticFindings.forEach((f, i) => {
      const sev = String(f?.severity ?? 'medium').toUpperCase();
      lines.push(`### 7.1.${i + 1} 第 ${i + 1} 条静态发现`, '');
      lines.push('| 字段 | 值 |');
      lines.push('| --- | --- |');
      lines.push(`| 严重度 | ${cell(sev)} |`);
      lines.push(`| 类别 | ${cell(String(f?.category ?? '—'))} |`);
      lines.push(`| 配置定位 | ${cell(String(f?.location ?? '—'))} |`);
      lines.push(`| 问题描述 | ${cell(String(f?.issue ?? '—'))} |`);
      lines.push(`| 证据 | ${cell(String(f?.evidence ?? '—'))} |`);
      lines.push(`| 修复建议 | ${cell(String(f?.recommendation ?? '—'))} |`);
      lines.push('');
    });
  }

  if (Array.isArray(staticSummary?.recommendations) && staticSummary.recommendations.length > 0) {
    lines.push('### 通用修复建议（静态）', '');
    for (const r of staticSummary.recommendations) {
      lines.push(`- ${esc(r)}`, '');
    }
  }

  lines.push(
    '## 7.2 配置导出文本规则与命令级检测',
    '',
    '*数据源：`attack_results` 中 `request.url` 为 `static://config-json` 的回合（规则/命令级 JSON 静态扫描）；**列出全部此类回合**（含通过 / 未通过）。*',
    '',
  );
  if (staticConfigYamlResults.length > 0) {
    staticConfigYamlResults.forEach((r, i) => {
      const v = r.finalVerdict as Record<string, unknown> | undefined;
      const vuln = v?.vulnerable === true || String(v?.vulnerable).toLowerCase() === 'true';
      const risk = String(v?.riskLevel ?? '—');
      const reason = String(v?.reason ?? '—');
      const vulnName = r.vulnerabilityName || String(r.vulnerabilityId ?? '');
      const retestStatus = resolveRetestStatusByVulnerabilityId(
        String(r.vulnerabilityId ?? ''),
        data.retestComparison,
      );
      const verificationRuleSummary = formatRuntimeVerificationRulesForReportRow(r);
      const configNodes = formatRuntimeConfigNodesForReportRow(r, dslCtxForRuntimeNodes);
      const expectedSuccess = String(r.expectedSuccess ?? '—');
      const nonVulnerability = String(r.nonVulnerability ?? '—');
      const agentOut = '—（静态配置扫描回合，无运行时智能体输出）';
      lines.push(`### 7.2.${i + 1} 第 ${i + 1} 条静态扫描回合`, '');
      lines.push('| 字段 | 值 |');
      lines.push('| --- | --- |');
      lines.push(`| 漏洞名称 | ${cell(vulnName)} |`);
      lines.push(`| 对比状态 | ${cell(retestStatus)} |`);
      lines.push(`| 验证命令 | ${formatVerificationCommandMarkdownCell(r, cell)} |`);
      lines.push(
        `| 验证规则 | ${escMarkdownCellMultiline(
          `${verificationRuleSummary.rules}\n${verificationRuleSummary.hitCount}`,
        )} |`,
      );
      lines.push(`| 配置节点画像 | ${escMarkdownCellMultiline(configNodes)} |`);
      lines.push(`| 智能体输出 | ${agentOut} |`);
      lines.push(`| Expected Success | ${cell(expectedSuccess)} |`);
      lines.push(`| Non-Vulnerability | ${cell(nonVulnerability)} |`);
      lines.push(`| 风险等级 | ${cell(risk)} |`);
      lines.push(`| 判定 | ${vuln ? '**存在风险（vulnerable）**' : '未发现风险'} |`);
      lines.push(`| 理由 | ${cell(reason)} |`);
      lines.push(`| 时间 | ${cell(r.createdAt)} |`);
      lines.push('');
    });
  } else {
    lines.push('*（未产生配置导出文本静态扫描回合，或未启用规则/命令级检测。）*', '');
  }

  lines.push(
    '## 7.3 运行时 API / 对抗验证',
    '',
    `*数据源：${data.resultsSource === 'finding_records' ? 'finding_records（归一化）' : 'attack_results'}；**排除** \`static://config-json\` 回合（见第 7.2 节）；仅列出判定为 **vulnerable** 的条目（与 API 黑盒报告一致）。无 \`url\` 的归一化行仍纳入本节。*`,
    '',
  );
  if (apiRuntimeVulnerableResults.length) {
    apiRuntimeVulnerableResults.forEach((r, i) => {
      const v = r.finalVerdict as Record<string, unknown> | undefined;
      const vuln = v?.vulnerable === true || String(v?.vulnerable).toLowerCase() === 'true';
      const risk = String(v?.riskLevel ?? '—');
      const reason = String(v?.reason ?? '—');
      const vulnName = r.vulnerabilityName || String(r.vulnerabilityId ?? '');
      const retestStatus = resolveRetestStatusByVulnerabilityId(
        String(r.vulnerabilityId ?? ''),
        data.retestComparison,
      );
      const verificationRuleSummary = formatRuntimeVerificationRulesForReportRow(r);
      const configNodes = formatRuntimeConfigNodesForReportRow(r, dslCtxForRuntimeNodes);
      const expectedSuccess = String(r.expectedSuccess ?? '—');
      const nonVulnerability = String(r.nonVulnerability ?? '—');
      const agentOut = escMarkdownCellMultiline(resolveAgentOutput(r.response));
      lines.push(`### 7.3.${i + 1} 第 ${i + 1} 条结果`, '');
      lines.push('| 字段 | 值 |');
      lines.push('| --- | --- |');
      lines.push(`| 漏洞名称 | ${cell(vulnName)} |`);
      lines.push(`| 对比状态 | ${cell(retestStatus)} |`);
      lines.push(`| 验证命令 | ${formatVerificationCommandMarkdownCell(r, cell)} |`);
      lines.push(
        `| 验证规则 | ${escMarkdownCellMultiline(
          `${verificationRuleSummary.rules}\n${verificationRuleSummary.hitCount}`,
        )} |`,
      );
      lines.push(`| 攻击模式 | ${cell(String(r.attackMode ?? '—'))} |`);
      lines.push(`| 配置节点画像 | ${escMarkdownCellMultiline(configNodes)} |`);
      lines.push(`| 智能体输出 | ${agentOut} |`);
      lines.push(`| Expected Success | ${cell(expectedSuccess)} |`);
      lines.push(`| Non-Vulnerability | ${cell(nonVulnerability)} |`);
      lines.push(`| 风险等级 | ${cell(risk)} |`);
      lines.push(`| 判定 | ${vuln ? '**存在风险（vulnerable）**' : '未发现风险'} |`);
      lines.push(`| 理由 | ${cell(reason)} |`);
      lines.push(`| 时间 | ${cell(r.createdAt)} |`);
      lines.push('');
    });
  } else {
    const hint =
      data.resultsSource === 'finding_records'
        ? '无可确认风险的 finding_records 记录'
        : '未发现可确认风险结果';
    lines.push(`*（${hint}。）*`, '');
  }

  lines.push(...buildReportSection8ReferenceLines({ fastgpt: true }));
  lines.push(...buildReportSections9And10(data, { section9Variant: 'dify_config' }));

  return lines.join('\n');
}
