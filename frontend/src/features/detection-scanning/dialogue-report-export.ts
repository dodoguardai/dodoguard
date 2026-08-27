import { isPatrolTask } from '@/features/launch-monitoring/patrol-utils';
import { DEFAULT_REPORT_BRAND_ORGANIZATION } from '@/features/reports/report-brand-config';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import {
  resolveCaseActualOutputDisplay,
  resolveCasePromptDisplay,
  resolveFindingRecommendationDisplay,
} from './dialogue-task-detail-utils';
import type { SecurityScanFinding, SecurityScanTask } from '@/types/entities';

import type {
  DialogueCaseRow,
  DialogueConclusionMeta,
  DialogueLibraryStatGroup,
  DialogueTaskDetailStats,
} from './dialogue-task-detail-utils';

type BuildDialogueReportHtmlParams = {
  task: SecurityScanTask;
  stats: DialogueTaskDetailStats;
  conclusion: DialogueConclusionMeta;
  findings: SecurityScanFinding[];
  caseRows: DialogueCaseRow[];
  libraryGroups: DialogueLibraryStatGroup[];
  passRateThreshold: number;
  coverImageDataUri?: string;
  logoDataUri?: string;
  brandOrganization?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFileName(value: string): string {
  return (
    value
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'report'
  );
}

function formatDate(value?: Date): string {
  return (value ?? new Date()).toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace('T', ' ');
  }
  return date
    .toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
}

function verdictFromRate(passRate: number, threshold: number, fail: number): string {
  if (fail === 0 || passRate >= threshold) {
    return '通过';
  }
  return '未通过';
}

function statusClassFromText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }
  if (
    !/^(通过|建议通过|条件通过|附条件通过|未通过|不通过|达标|未达标|已审核|待审核|失败|不安全（未通过）|未发现高优先级风险|存在高优先级风险)$/.test(
      text,
    )
  ) {
    return null;
  }
  if (/未通过|不通过|未达标|阻断|高优先级风险|失败/i.test(text)) {
    return 'danger';
  }
  if (/条件|附条件|待确认|待审核|少量|偏差/i.test(text)) {
    return 'warn';
  }
  if (/通过|达标|已审核|未发现/i.test(text)) {
    return 'success';
  }
  return null;
}

function tableCellHtml(value: unknown, options?: { colorize?: boolean; label?: boolean }): string {
  const text = escapeHtml(value ?? '—');
  if (options?.label) {
    return `<span class="status-pill success">${text}</span>`;
  }
  const statusClass = options?.colorize ? statusClassFromText(value) : null;
  return statusClass ? `<span class="status-pill ${statusClass}">${text}</span>` : text;
}

function table(
  headers: string[],
  rows: Array<Array<unknown>>,
  options?: { colorizeColumns?: number[]; labelColumns?: number[]; labelCells?: string[] },
): string {
  const colorizeColumns =
    options?.colorizeColumns ??
    headers
      .map((header, index) => (/判定|结论|结果|状态/.test(header) ? index : -1))
      .filter((index) => index >= 0);
  const labelColumns = options?.labelColumns ?? [];
  const labelCells = new Set(options?.labelCells ?? []);
  return `<table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(
      (row, rowIndex) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td>${tableCellHtml(cell, {
                colorize: colorizeColumns.includes(index),
                label: labelColumns.includes(index) || labelCells.has(`${rowIndex}:${index}`),
              })}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}

function plainTable(rows: Array<Array<unknown>>): string {
  return `<table><tbody>${rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => {
            const label = index > 0 ? String(row[index - 1] ?? '') : '';
            return `<td>${tableCellHtml(cell, { colorize: /风险|结论|结果|状态/.test(label) })}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}

function percent(value: number): string {
  return `${Number.isFinite(value) ? value.toFixed(2) : '0.00'}%`;
}

function riskDescriptionForLibrary(title: string): string {
  if (/提示词|prompt/i.test(title) && /泄露|leak/i.test(title)) {
    return '主要聚焦诱导模型泄露系统提示词、初始化指令、内部规则及隐藏配置等敏感信息的攻击场景。';
  }
  if (/篡改|注入|越权|jailbreak|inject/i.test(title)) {
    return '主要聚焦针对系统提示词的覆盖、改写、角色重置和越权指令注入攻击，验证智能体在对抗指令下的行为稳定性。';
  }
  if (/敏感|隐私|数据|泄露/i.test(title)) {
    return '主要聚焦敏感信息、隐私数据、内部上下文和业务数据的异常暴露风险。';
  }
  if (/合规|拒答|边界|违规/i.test(title)) {
    return '主要聚焦业务合规边界、拒答策略、风险话术和监管约束下的响应稳定性。';
  }
  return `主要聚焦「${title}」相关对话安全风险，验证智能体在该类攻击或异常输入下的安全控制效果。`;
}

function limitReportText(value: unknown, maxLength = 2400): string {
  const text = String(value ?? '').trim();
  if (!text) {
    return '—';
  }
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n\n（内容已截断，完整输出请查看原始数据导出）`
    : text;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function resolveJudgeModelLabel(task: SecurityScanTask, caseRows: DialogueCaseRow[] = []): string {
  const runConfig = readRecord(task.runConfig);
  const metadata = readRecord(task.metadata);
  const metadataRunConfig = readRecord(metadata?.runConfig);
  const taskWithJudge = task as SecurityScanTask & {
    evaluationModel?: unknown;
    judgeConfig?: unknown;
    judgeModel?: unknown;
    modelId?: unknown;
    selectedModel?: unknown;
  };
  const judgeConfig =
    readRecord(taskWithJudge.judgeConfig) ||
    readRecord(runConfig?.judgeConfig) ||
    readRecord(metadata?.judgeConfig) ||
    readRecord(metadataRunConfig?.judgeConfig);
  const singleTestMeta = readRecord(metadata?.singleTest);
  const firstCaseEvidence = caseRows
    .map((row) => readRecord(row.finding?.evidence))
    .find((evidence) => evidence);
  const firstCaseJudgeConfig = readRecord(firstCaseEvidence?.judgeConfig);
  const llmConfig = readRecord(runConfig?.llmConfig) || readRecord(metadataRunConfig?.llmConfig);
  const candidates = [
    taskWithJudge.judgeModel,
    taskWithJudge.evaluationModel,
    taskWithJudge.selectedModel,
    taskWithJudge.modelId,
    judgeConfig?.label,
    judgeConfig?.name,
    judgeConfig?.model,
    judgeConfig?.modelId,
    judgeConfig?.selectedModel,
    judgeConfig?.providerId,
    judgeConfig?.id,
    runConfig?.judgeModel,
    runConfig?.evaluationModel,
    runConfig?.selectedModel,
    metadata?.judgeModel,
    metadata?.evaluationModel,
    metadata?.selectedModel,
    singleTestMeta?.judgeModel,
    firstCaseJudgeConfig?.label,
    firstCaseJudgeConfig?.name,
    firstCaseJudgeConfig?.model,
    firstCaseJudgeConfig?.modelId,
    firstCaseJudgeConfig?.providerId,
    firstCaseJudgeConfig?.id,
    llmConfig?.label,
    llmConfig?.model,
    llmConfig?.modelId,
    llmConfig?.providerId,
  ];
  return candidates.map(readNonEmptyString).find(Boolean) || '—';
}

function formatCoverageText(librarySummaries: Array<{ title: string }>): string {
  const titles = librarySummaries.map((group) => group.title).filter(Boolean);
  if (titles.length === 0) {
    return '本次选择的风险维度';
  }
  if (titles.length === 1) {
    return `「${titles[0]}」风险维度`;
  }
  if (titles.length === 2) {
    return `「${titles[0]}」与「${titles[1]}」两类风险维度`;
  }
  return `「${titles.slice(0, 3).join('」「')}」等 ${titles.length} 类风险维度`;
}

function readJudgeConfidence(row: DialogueCaseRow): string {
  const evidence = readRecord(row.finding?.evidence);
  const judgeVerdict = row.judgeVerdict || readRecord(evidence?.judgeVerdict);
  const raw = judgeVerdict?.confidence ?? judgeVerdict?.score ?? evidence?.confidence;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw <= 1 ? percent(raw * 100) : String(raw);
  }
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '—';
}

function caseRiskDescription(row: DialogueCaseRow): string {
  return limitReportText(
    row.finding?.description ||
      row.expectedFail ||
      riskDescriptionForLibrary(row.libraryTitle || row.caseName || '该检测项'),
    900,
  );
}

function caseRiskBasis(row: DialogueCaseRow): string {
  const evidence = readRecord(row.finding?.evidence);
  const candidates = [
    row.riskBasis,
    evidence?.caseBasis,
    evidence?.basis,
    evidence?.detectionBasis,
    evidence?.riskBasis,
    evidence?.mappingBasis,
    evidence?.['检测依据'],
  ];
  return limitReportText(candidates.map(readNonEmptyString).find(Boolean) || '—', 900);
}

function resolveReportMaliciousOutputDisplay(row: DialogueCaseRow): string {
  const assistantTurns = (row.transcript || []).filter(
    (turn) => turn.role === 'assistant' && turn.content.trim(),
  );
  if (assistantTurns.length > 0) {
    return assistantTurns
      .map((turn, index) => {
        const content = formatDifyResponseForDisplay(turn.content);
        return `[轮次 ${index + 1}] Agent\n${content}`;
      })
      .join('\n\n');
  }
  return resolveCaseActualOutputDisplay(row);
}

function caseRemediationAdvice(row: DialogueCaseRow): string {
  return limitReportText(
    resolveFindingRecommendationDisplay(row.finding, row) ||
      '建议补充输入意图识别、拒答规则、输出审查与同题库回归测试；整改后使用相同题库执行复测。',
    900,
  );
}

function reportPassConclusionHtml(
  stats: DialogueTaskDetailStats,
  conclusion: DialogueConclusionMeta,
): string {
  const normalized = `${conclusion.pill} ${conclusion.title}`.trim();
  if (stats.total <= 0) {
    return '本次测试尚未形成可统计结论，建议在完成测试执行后重新导出报告。';
  }
  if (/未通过|不通过|风险|失败|阻断/i.test(normalized) || stats.fail > 0) {
    return `本次测试综合结论为<span class="result-verdict-label danger">不通过</span>，发现 ${escapeHtml(stats.fail)} 条未通过用例，建议完成整改后按相同题库执行复测。`;
  }
  return '本次测试综合结论为<span class="result-verdict-label success">通过</span>，当前评估范围内未发现未通过用例，可作为本轮安全评估归档依据。';
}

export function buildDialogueReportFileBaseName(task: SecurityScanTask): string {
  const reportTitle = isPatrolTask(task) ? '周期巡检报告' : '对话安全评估报告';
  return sanitizeFileName(`${reportTitle} · ${task.name || task.id}`);
}

export function buildDialogueReportHtml(params: BuildDialogueReportHtmlParams): string {
  const {
    task,
    stats,
    conclusion,
    caseRows,
    libraryGroups,
    passRateThreshold,
    coverImageDataUri,
    logoDataUri,
    brandOrganization,
  } = params;
  const patrolTask = isPatrolTask(task);
  const reportTitle = patrolTask ? '周期巡检报告' : '对话安全评估报告';
  const precisePassRate = stats.total > 0 ? (stats.pass / stats.total) * 100 : 0;
  const issuedDate = formatDate();
  const reportName = `${reportTitle} · ${task.name || task.id}`;
  const issuer = (brandOrganization?.trim() || DEFAULT_REPORT_BRAND_ORGANIZATION).slice(0, 140);
  const assessmentMode = patrolTask ? '周期巡检自动化测评' : '智能体对话安全自动化测评';
  const targetName = task.assetName || task.targetSummary || '—';
  const judgeModelLabel = resolveJudgeModelLabel(task, caseRows);
  const testStart = formatDateTime(task.startedAt || task.createdAt);
  const testEnd = formatDateTime(task.completedAt || task.updatedAt);
  const failedCases = caseRows.filter((row) => !row.pending && !row.passed);
  const maxExampleCount = 6;
  const maxExamplesPerFailedLibrary = 2;

  const librarySummaries = libraryGroups.map((group) => {
    const planned = group.planned || group.pass + group.fail;
    const rate = planned > 0 ? (group.pass / planned) * 100 : 0;
    return {
      libraryId: group.libraryId,
      title: group.title,
      planned,
      pass: group.pass,
      fail: group.fail,
      rate,
      verdict: verdictFromRate(rate, passRateThreshold, group.fail),
      description: riskDescriptionForLibrary(group.title),
    };
  });

  const topicSummaryRows = librarySummaries.map((group) => [
    group.title,
    group.pass,
    group.planned,
    percent(group.rate),
  ]);
  const tocLibrarySummaries = librarySummaries.slice(0, 8);
  const tocRemainingCount = Math.max(0, librarySummaries.length - tocLibrarySummaries.length);
  const failedCasesByLibrary = new Map<string, DialogueCaseRow[]>();
  for (const row of failedCases) {
    const keys = Array.from(
      new Set([row.libraryId, row.libraryTitle || '未归属测试项'].filter(Boolean)),
    );
    for (const key of keys) {
      const rows = failedCasesByLibrary.get(key) ?? [];
      rows.push(row);
      failedCasesByLibrary.set(key, rows);
    }
  }
  const renderFailedCase = (
    row: DialogueCaseRow,
    index: number,
    sectionNumber?: number,
  ) => `<section class="case-detail">
        <h4>${sectionNumber ? `${sectionNumber}.${index + 1}` : ''}（${escapeHtml(row.libraryTitle)}）</h4>
        ${table(
          ['字段', '内容'],
          [
            ['风险项', row.caseName || row.libraryTitle || '—'],
            ['原始题', limitReportText(resolveCasePromptDisplay(row), 900)],
            ['恶意输出片段', limitReportText(resolveReportMaliciousOutputDisplay(row), 1100)],
            ['评测结果', row.verdict],
            ['风险描述', caseRiskDescription(row)],
            ['风险依据', caseRiskBasis(row)],
            ['判定置信度', readJudgeConfidence(row)],
            ['整改建议', caseRemediationAdvice(row)],
            [
              '判定依据',
              '是否通过以评测结果为准；判定置信度表示模型对该结论的把握程度，不代表通过分数。',
            ],
          ],
        )}
      </section>`;
  const basicInfoHtml = `<div class="basic-info">
      <p><strong>测试智能体：</strong>${escapeHtml(targetName)}；评估模型：${escapeHtml(judgeModelLabel)}</p>
      <p><strong>测试时间：</strong>${escapeHtml(testStart)} 至 ${escapeHtml(testEnd)}</p>
      <p><strong>测试题目总数：</strong>${escapeHtml(stats.total)}，通过 ${escapeHtml(stats.pass)}，不通过 ${escapeHtml(stats.fail)}，总体通过率 ${escapeHtml(percent(precisePassRate))}。</p>
      <p>${reportPassConclusionHtml(stats, conclusion)}</p>
      <p>本报告依据智能体提示词安全评估流程，覆盖${escapeHtml(formatCoverageText(librarySummaries))}，用于评估智能体在提示词攻击场景下的安全防护能力。</p>
    </div>`;

  const resultRows = librarySummaries.map((group, index) => {
    const allExamples =
      failedCasesByLibrary.get(group.libraryId) ?? failedCasesByLibrary.get(group.title) ?? [];
    const examples = allExamples.slice(0, maxExamplesPerFailedLibrary);
    const omittedExampleCount = Math.max(0, allExamples.length - examples.length);
    const sectionNumber = index + 1;
    return `<section class="test-section">
      <h3>${sectionNumber} 检测项: ${escapeHtml(group.title)}</h3>
      <p class="result-text">${escapeHtml(group.description)} 共测试 ${escapeHtml(group.planned)} 条，通过 ${escapeHtml(group.pass)} 条，不通过 ${escapeHtml(group.fail)} 条，通过率 ${escapeHtml(percent(group.rate))}。</p>
      <p class="result-text result-verdict">判定结论：<span class="result-verdict-label ${statusClassFromText(group.verdict) || ''}">${escapeHtml(group.verdict)}</span>（标准通过率 ${escapeHtml(percent(passRateThreshold))}）。</p>
      ${examples.length ? `<p class="example-intro"><strong>以下为该检测项未通过用例的部分示例：</strong></p><div class="case-examples">${examples.map((row, exampleIndex) => renderFailedCase(row, exampleIndex, sectionNumber)).join('')}${omittedExampleCount > 0 ? `<p class="muted">另有 ${escapeHtml(omittedExampleCount)} 条未通过用例未在示例中展开，详见任务明细。</p>` : ''}</div>` : group.fail > 0 ? '<p class="example-intro"><strong>该检测项存在未通过记录，当前任务明细中未匹配到可展示示例。</strong></p>' : ''}
    </section>`;
  });

  const ungroupedFailedCaseDetails = librarySummaries.length
    ? ''
    : failedCases
        .slice(0, maxExampleCount)
        .map((row, index) => renderFailedCase(row, index))
        .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(buildDialogueReportFileBaseName(task))}</title>
  <style>
    :root {
      --text-main: #111827;
      --text-subtle: #6b7280;
      --border-color: #e5e7eb;
      --paper-bg: #ffffff;
      --shell-bg: #f3f4f6;
      --accent: #b91c1c;
      --section-bg: #f9fafb;
      --table-head: #f3f4f6;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
      margin: 0;
      background: var(--shell-bg);
      color: var(--text-main);
      font-size: 14px;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-shell { width: 100%; padding: 18px 0 30px; }
    .cover-card {
      max-width: 920px;
      height: 265mm;
      min-height: 265mm;
      max-height: 265mm;
      margin: 0 auto 24px;
      padding: 52px 0 42px;
      background: var(--paper-bg);
      border: 1px solid var(--border-color);
      box-shadow: 0 8px 28px rgba(17, 24, 39, 0.10);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
    }
    .cover-card.has-image::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.72) 42%, rgba(255,255,255,0.96) 100%),
        linear-gradient(125deg, rgba(255,255,255,0.22), rgba(255,255,255,0.14) 40%, rgba(185,28,28,0.025) 100%);
      z-index: 0;
      pointer-events: none;
    }
    .cover-card > *:not(.cover-art) { position: relative; z-index: 1; }
    .cover-art {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;
      background-position: center;
      background-repeat: no-repeat;
      background-size: cover;
    }
    .cover-art-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform: scale(1.01);
      filter: saturate(0.85) brightness(1.04) contrast(1.02);
    }
    .cover-art-gradient {
      background:
        linear-gradient(180deg, #ffffff 0%, #fafbfc 55%, #f6f8fa 100%),
        radial-gradient(circle at 70% 30%, rgba(185, 28, 28, 0.09), transparent 58%),
        radial-gradient(circle at 20% 80%, rgba(31, 41, 55, 0.04), transparent 62%),
        repeating-linear-gradient(135deg, rgba(17, 24, 39, 0.025), rgba(17, 24, 39, 0.025) 2px, transparent 2px, transparent 12px);
    }
    .cover-topbar { padding: 0 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .cover-logo { width: auto; height: 64px; max-width: 360px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; padding: 4px 12px; }
    .cover-logo img { width: auto; height: 100%; max-width: 320px; object-fit: contain; display: block; }
    .cover-topbar-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 220px; padding: 4px 0; }
    .cover-topbar-meta-label { font-size: 11px; letter-spacing: 1px; color: #6b7280; text-transform: uppercase; }
    .cover-topbar-meta-value { font-size: 14px; font-weight: 600; color: #111827; letter-spacing: 0.2px; text-align: right; }
    .cover-main { padding: 0 56px; position: relative; z-index: 2; display: flex; flex-direction: column; gap: 14px; }
    .cover-title { margin: 0; font-size: 46px; font-weight: 800; line-height: 1.22; letter-spacing: 1px; color: #0b1220; max-width: 760px; }
    .cover-separator { width: 112px; height: 2px; background: linear-gradient(90deg, var(--accent), rgba(185, 28, 28, 0.18)); }
    .cover-subtitle { margin: 0; color: #1f2937; font-size: 16px; letter-spacing: 0.4px; max-width: 760px; }
    .cover-org { margin: 0; color: #374151; font-size: 14px; letter-spacing: 0.2px; max-width: 760px; }
    .cover-footer { padding: 0 56px; z-index: 2; position: relative; }
    .cover-footer-headline { font-size: 12px; font-weight: 700; letter-spacing: 1.2px; color: #374151; margin-bottom: 8px; }
    .cover-meta-table { width: 100%; border-collapse: collapse; font-size: 14px; color: #374151; background: rgba(255,255,255,0.95); border: 1px solid var(--border-color); }
    .cover-meta-table th, .cover-meta-table td { border: 1px solid var(--border-color); padding: 10px 14px; text-align: left; vertical-align: middle; }
    .cover-meta-table th { width: 200px; font-weight: 600; background: #f8fafc; color: #111827; }
    .doc {
      max-width: 920px;
      margin: 0 auto;
      display: table;
      width: 100%;
      background: var(--paper-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0;
      box-shadow: 0 3px 12px rgba(17, 24, 39, 0.06);
      position: relative;
      overflow: hidden;
    }
    .doc-inner { display: table-row-group; position: relative; z-index: 1; padding: 26px 56px 32px; }
    .doc-inner-content { padding: 26px 56px 32px; }
    .page-break { page-break-after: always; }
    .doc-header { display: table-header-group; color: #111827; }
    .doc-header-frame { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 16px 36px; border-bottom: 1px solid var(--border-color); background: linear-gradient(90deg, rgba(185, 28, 28, 0.08), rgba(185, 28, 28, 0.02)); }
    .doc-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .doc-header-logo { width: 26px; height: 26px; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
    .doc-header-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .doc-header-title { font-weight: 800; letter-spacing: 0.6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 560px; }
    .doc-header-meta { color: #667085; font-size: 12px; letter-spacing: 0.2px; flex: 0 0 auto; white-space: nowrap; }
    .doc-footer { display: table-footer-group; }
    .doc-footer-frame { margin: 0 56px; padding: 8px 0 10px; border-top: 1px solid #e5e7eb; color: #667085; font-size: 11px; text-align: center; }
    h2 { margin: 1.35rem 0 0.72rem; padding: 11px 14px 11px 16px; border-left: 4px solid var(--accent); background: var(--section-bg); border-bottom: 1px solid var(--border-color); font-size: 17px; font-weight: 800; line-height: 1.35; }
    h3 { margin: 1.1rem 6px 0.52rem; font-size: 15px; font-weight: 800; line-height: 1.36; color: #0f172a; }
    h4 { margin: 0.95rem 6px 0.48rem; font-size: 13.5px; font-weight: 750; line-height: 1.36; color: #334155; }
    p { margin: 0.58rem 6px 0.72rem; line-height: 1.86; }
    .basic-info { margin: 0.76rem 6px 1.1rem; padding: 8px 0 2px; color: #111827; font-size: 13.5px; }
    .basic-info p { margin: 0 0 0.42rem; line-height: 1.9; }
    .basic-info p:last-child { margin-bottom: 0; }
    .copyright-notice { margin: 1.2rem 0 0; padding: 10px 0; border-top: 1px solid #d7dee8; background: #f8fafc; color: #334155; font-size: 12.5px; line-height: 1.86; }
    .copyright-notice p { width: min(86%, 720px); margin: 0 auto 0.48rem; line-height: 1.86; text-indent: 2em; }
    .copyright-notice p:last-child { margin-bottom: 0; }
    .result-text { margin: 0.44rem 6px 0.6rem; text-indent: 2em; line-height: 1.9; font-size: 13.5px; color: #1f2937; }
    .result-verdict { margin-top: 0.2rem; }
    .example-intro { margin: 0.7rem 6px 0.28rem; color: #334155; font-size: 13.5px; line-height: 1.75; }
    table { width: calc(100% - 12px); max-width: calc(100% - 12px); table-layout: fixed; border-collapse: collapse; margin: 0.76rem 6px; font-size: 13px; background: #fff; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: auto; break-inside: auto; page-break-after: auto; }
    th, td { border: 1px solid #d7dee8; padding: 8px 10px; text-align: left; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
    th { background: #f3f6fa; font-weight: 700; }
    .status-pill { display: inline-block; max-width: 100%; min-width: 52px; padding: 2px 9px; border-radius: 999px; font-weight: 700; line-height: 1.45; text-align: center; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .status-pill.success { color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; }
    .status-pill.warn { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
    .status-pill.danger { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; }
    .result-verdict-label { display: inline; margin: 0 4px; font-weight: 800; }
    .result-verdict-label.success { color: #059669; }
    .result-verdict-label.warn { color: #b45309; }
    .result-verdict-label.danger { color: #dc2626; }
    .muted { color: #667085; }
    .toc { margin: 0.9rem 6px 0; }
    .toc-row { display: flex; align-items: baseline; gap: 8px; padding: 7px 0; border-bottom: 1px dotted #cbd5e1; }
    .toc-row span:first-child { font-weight: 700; }
    .toc-row i { flex: 1; border-bottom: 1px dotted #cbd5e1; transform: translateY(-3px); }
    .toc-row em { color: #667085; font-style: normal; }
    .toc-sub { padding-left: 28px; font-size: 12.5px; }
    .toc-sub span:first-child { font-weight: 500; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 6px 14px; }
    .metric { border: 1px solid #d7dee8; background: #f8fafc; padding: 10px; }
    .metric strong { display: block; font-size: 20px; line-height: 1.2; color: #0b1220; }
    .metric span { display: block; margin-top: 4px; color: #667085; font-size: 11px; }
    .test-section { page-break-inside: auto; break-inside: auto; margin-bottom: 0.9rem; }
    .test-section > h3 { page-break-after: avoid; break-after: avoid-page; }
    .case-examples { margin: 0.35rem 0 0.9rem; padding-top: 0.1rem; page-break-inside: auto; break-inside: auto; }
    .case-detail { page-break-inside: auto; break-inside: auto; margin: 0.74rem 0 0.9rem; }
    .case-detail h4 { page-break-after: avoid; break-after: avoid-page; }
    .case-detail table { page-break-inside: auto; break-inside: auto; }
    .case-detail tr { page-break-inside: auto; break-inside: auto; }
    .avoid-break { page-break-inside: auto; break-inside: auto; }
    .notice { border-left: 3px solid #b91c1c; background: rgba(185, 28, 28, 0.06); padding: 8px 10px; margin: 10px 6px 0; }
    footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #667085; font-size: 11px; text-align: center; }
    @media print {
      body { background: #fff; }
      .page-shell { padding: 0; }
      .cover-card, .doc { box-shadow: none; border-color: #d7dee8; }
      .doc { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page-shell">
  <section class="cover-card ${coverImageDataUri ? 'has-image' : ''}">
    ${
      coverImageDataUri
        ? `<div class="cover-art" aria-hidden="true"><img class="cover-art-image" src="${escapeHtml(coverImageDataUri)}" alt="cover background" /></div>`
        : '<div class="cover-art cover-art-gradient" aria-hidden="true"></div>'
    }
    <div class="cover-topbar">
      <div class="cover-logo">${logoDataUri ? `<img src="${escapeHtml(logoDataUri)}" alt="logo" />` : '智安'}</div>
      <div class="cover-topbar-meta">
        <span class="cover-topbar-meta-label">Document Level</span>
        <span class="cover-topbar-meta-value">内部文档（请按需分发） · ${escapeHtml(issuedDate)}</span>
      </div>
    </div>
    <div class="cover-main">
      <h1 class="cover-title">${escapeHtml(reportName)}</h1>
      <div class="cover-separator"></div>
      <p class="cover-subtitle">面向企业 Agent API 的对话安全测评、周期巡检与风险闭环验证报告</p>
      <p class="cover-org">${escapeHtml(issuer)}</p>
    </div>
    <div class="cover-footer">
      <div class="cover-footer-headline">REPORT INFORMATION</div>
      <table class="cover-meta-table">
        <tbody>
          <tr><th>报告生成日期</th><td>${escapeHtml(issuedDate)}</td></tr>
          <tr><th>评估对象</th><td>${escapeHtml(targetName)}</td></tr>
          <tr><th>出具机构</th><td>${escapeHtml(issuer)}</td></tr>
          <tr><th>报告平台</th><td>智安 · 智能体安全验证平台</td></tr>
          <tr><th>文档级别</th><td>内部文档（请按需分发）</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  <main class="doc">
    <div class="doc-header">
      <div class="doc-header-frame">
        <div class="doc-header-left">
          <div class="doc-header-logo">${logoDataUri ? `<img src="${escapeHtml(logoDataUri)}" alt="logo" />` : ''}</div>
          <div class="doc-header-title">智安安全评估报告</div>
        </div>
        <div class="doc-header-meta">${escapeHtml(issuedDate)} · ${escapeHtml(issuer)}</div>
      </div>
    </div>
    <div class="doc-inner">
    <div class="doc-inner-content">
    <section class="page-break">
      <h2>目录</h2>
      <div class="toc">
        <div class="toc-row"><span>一、基本信息</span><i></i><em>评分与总体判定</em></div>
        <div class="toc-row"><span>二、测评结果</span><i></i><em>检测项结果</em></div>
        ${tocLibrarySummaries
          .map(
            (group, index) =>
              `<div class="toc-row toc-sub"><span>${index + 1} 检测项: ${escapeHtml(group.title)}</span><i></i><em>${escapeHtml(percent(group.rate))}</em></div>`,
          )
          .join('')}
        ${tocRemainingCount > 0 ? `<div class="toc-row toc-sub"><span>其余 ${tocRemainingCount} 个检测项</span><i></i><em>详见正文</em></div>` : ''}
        <div class="toc-row"><span>三、题库测评汇总</span><i></i><em>风险维度统计</em></div>
      </div>
    </section>

    <section class="page-break">
      <h2>文档信息</h2>
      ${plainTable([
        ['项目名称', reportTitle, '创建人', '自动生成'],
        ['审计方式', assessmentMode, '审计对象', targetName],
        [
          '总体风险',
          conclusion.pill,
          '审核状态',
          task.status === 'completed' ? '已审核' : '待审核',
        ],
      ])}
      <h3>修订记录</h3>
      ${table(['版本', '生效日期', '修订概览', '修订人'], [['V1.0', issuedDate, `创建文档，完成 ${stats.total} 项智能体安全评测`, '自动生成']])}
    </section>

    <h2>一、 基本信息</h2>
    ${basicInfoHtml}

    <h2>二、 测评结果</h2>
    ${resultRows.length ? resultRows.join('') : '<p>暂无可统计的检测项维度。</p>'}
    ${ungroupedFailedCaseDetails || (failedCases.length ? '' : '<p>未发现未通过用例。</p>')}

    <h2>三、题库测评汇总</h2>
    ${
      topicSummaryRows.length
        ? table(['风险维度', '通过数', '用例数', '通过率'], topicSummaryRows)
        : '<p>暂无题库测评汇总。</p>'
    }

    <h2>版权与保密声明</h2>
    <div class="copyright-notice">
      <p>本文件中出现的任何文字叙述、图片、方法、过程及相关内容，版权均归 ${escapeHtml(issuer)} 所有，并受有关知识产权及版权法律法规保护。</p>
      <p>本文件包含被检测系统的敏感信息。接受、查阅或持有本文件，即表示同意在未经 ${escapeHtml(issuer)} 及被检测单位书面授权许可的情况下，任何个人或机构不得以任何形式复制、引用、披露、传播、转交或散布本文件及其内容。</p>
    </div>
    </div>
    </div>
    <div class="doc-footer"><div class="doc-footer-frame">${escapeHtml(issuer)} · 智安 · 智能体安全验证平台</div></div>
  </main>
  </div>
</body>
</html>`;
}
