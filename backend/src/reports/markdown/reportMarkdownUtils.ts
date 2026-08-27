/**
 * Shared helpers for Markdown security reports (API blackbox + config audit).
 */
import type { ReportData } from '../../services/reportTypes';
import { parseCozePreview } from '../../util/cozeResponsePreview';

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ');
}

function looksLikeCozeV2Json(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith('{') || !t.includes('"messages"')) {
    return false;
  }
  return t.includes('"conversation_id"') || (t.includes('"code"') && t.includes('"msg"'));
}

function isTrivialAgentOutput(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'success' || t === 'ok' || t === '—' || t === '-' || t === '"success"';
}

function agentOutputCandidateToString(c: unknown): string {
  if (typeof c === 'string') {
    return c.trim();
  }
  if (c != null && typeof c === 'object') {
    try {
      return JSON.stringify(c);
    } catch {
      return '';
    }
  }
  return '';
}

/** Escape cell text for Markdown tables (pipe/newline). */
export function escMarkdownCell(s: string, maxLen = 2000): string {
  return stripHtmlTags(String(s ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .slice(0, maxLen);
}

/**
 * Table cell with intentional line breaks (e.g. multiple rule names).
 * Uses `<br>` so GitHub / typical Markdown renderers show one item per line.
 */
export function escMarkdownCellMultiline(s: string, maxLen = 4000): string {
  return stripHtmlTags(String(s ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join(' / ')
    .slice(0, maxLen);
}

/** 第 6 节表格：执行耗时数值（分钟，最多两位小数）；未知或非正毫秒返回 null。 */
export function executionMinutesFromMs(ms: number): number | null {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const minutes = ms / 60_000;
  return Math.round(minutes * 100) / 100;
}

/** 表格单元格：有有效耗时时为「x.xx 分钟」，否则为「—」（避免「— 分钟」）。 */
export function formatExecutionMinutesZhCell(ms: number): string {
  const m = executionMinutesFromMs(ms);
  return m == null ? '—' : `${m} 分钟`;
}

/** @deprecated 优先用 formatExecutionMinutesZhCell，以免与「分钟」后缀重复。 */
export function formatExecutionMinutesZh(ms: number): string {
  const m = executionMinutesFromMs(ms);
  return m == null ? '—' : String(m);
}

/** 按漏洞维度统计本报告 results 条数（作「验证数据数量」回退） */
export function verificationResultCountByVulnerabilityId(data: ReportData): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of data.results) {
    const vid = String(r.vulnerabilityId ?? '');
    if (!vid) {
      continue;
    }
    m.set(vid, (m.get(vid) ?? 0) + 1);
  }
  return m;
}

export function resolveAgentOutput(
  response: unknown,
  opts?: { platformFamily?: string | null; taskTypeCode?: string | null },
): string {
  if (!response || typeof response !== 'object') {
    return '—';
  }
  const res = response as Record<string, unknown>;
  const cozeFamily =
    String(opts?.platformFamily ?? '').toLowerCase() === 'coze' ||
    String(opts?.taskTypeCode ?? '')
      .toLowerCase()
      .includes('coze');
  // `summary`：finding_records 映射在无法合并 attack_results 时仍可能比整段 JSON.stringify 更可读
  const directCandidates = [res.preview, res.full, res.output, res.text, res.content, res.summary];
  for (const c of directCandidates) {
    const raw = agentOutputCandidateToString(c);
    if (!raw) {
      continue;
    }
    const useCozeParser =
      cozeFamily || looksLikeCozeV2Json(raw) || (raw.startsWith('{') && raw.includes('"messages"'));
    if (useCozeParser) {
      const parsed = parseCozePreview(raw).trim();
      if (!isTrivialAgentOutput(parsed)) {
        return parsed.slice(0, 4000);
      }
      continue;
    }
    return raw.slice(0, 4000);
  }
  if (res.error != null) {
    const e = String(res.error).trim();
    if (e) {
      const errText = cozeFamily || looksLikeCozeV2Json(e) ? parseCozePreview(e).trim() : e;
      return `ERROR: ${errText.slice(0, 3000)}`;
    }
  }
  try {
    const dumped = JSON.stringify(res, null, 2);
    if (cozeFamily || looksLikeCozeV2Json(dumped)) {
      const out = parseCozePreview(dumped).trim();
      if (!isTrivialAgentOutput(out)) {
        return out.slice(0, 4000);
      }
    }
    return dumped.slice(0, 4000);
  } catch {
    return String(response).slice(0, 4000);
  }
}

export function buildRetestComparisonMarkdownLines(data: ReportData): string[] {
  const cmp = data.retestComparison;
  if (!cmp) {
    return [];
  }
  const lines: string[] = [
    '## 1.3 首次测试 vs 复测风险对比',
    '',
    '| 对比项 | 首次测试 | 复测（最新） |',
    '| --- | --- | --- |',
    `| 统计窗口 | ${escMarkdownCell(cmp.baselineAt ? cmp.baselineAt.slice(0, 19).replace('T', ' ') : cmp.baselineLabel)} | ${escMarkdownCell(cmp.currentAt ? cmp.currentAt.slice(0, 19).replace('T', ' ') : cmp.currentLabel)} |`,
    `| 高风险（含严重） | ${cmp.baselineRisk.high} | ${cmp.currentRisk.high} |`,
    `| 中风险 | ${cmp.baselineRisk.medium} | ${cmp.currentRisk.medium} |`,
    `| 低风险 | ${cmp.baselineRisk.low} | ${cmp.currentRisk.low} |`,
    `| 风险项总数（按漏洞去重） | ${cmp.baselineRisk.total} | ${cmp.currentRisk.total} |`,
    '',
    `- **已修复风险**：${cmp.fixedRiskIds.length} 项`,
    `- **仍未修复风险**：${cmp.unchangedRiskIds.length} 项`,
    `- **新增风险**：${cmp.newRiskIds.length} 项`,
  ];
  const toList = (ids: string[]) =>
    ids
      .slice(0, 12)
      .map((x) => `\`${escMarkdownCell(x, 200)}\``)
      .join('、');
  if (cmp.fixedRiskIds.length > 0) {
    lines.push(`- 已修复（示例）：${toList(cmp.fixedRiskIds)}`);
  }
  if (cmp.unchangedRiskIds.length > 0) {
    lines.push(`- 未修复（示例）：${toList(cmp.unchangedRiskIds)}`);
  }
  if (cmp.newRiskIds.length > 0) {
    lines.push(`- 新增（示例）：${toList(cmp.newRiskIds)}`);
  }
  lines.push('');
  return lines;
}
