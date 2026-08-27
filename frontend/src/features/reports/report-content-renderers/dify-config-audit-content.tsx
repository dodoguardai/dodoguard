/**
 * Custom report content renderer for structured config / capability audits.
 * Chinese-first layout for SKILLS / MCP / Dify-style auditData.
 */

import { Badge } from '@/components/ui/badge';
import { riskVariant } from '@/features/dify-config-audit/utils';

export interface DifyAuditData {
  summary: string;
  overallRisk: string;
  findings: Array<{
    severity: string;
    category: string;
    location: string;
    issue: string;
    evidence: string;
    recommendation: string;
    dimension?: string;
    sourceFile?: string;
    processingStatus?: string;
  }>;
  recommendations: string[];
  warnings?: string[];
  truncated?: boolean;
}

export interface DifyConfigAuditReportContentProps {
  auditData: DifyAuditData;
  fileName?: string;
  /** Override default truncation message (e.g. SKILLS.md vs Dify workflow). */
  truncationMessage?: string;
  /**
   * Shown when the UI falls back to structured audit data without persisted report body
   * (e.g. Dify 配置灰盒需在「生成报告」后才有完整 Markdown）。
   */
  fallbackFullReportNote?: string;
  /** Prefer Chinese labels (default true for product UI). */
  locale?: 'zh' | 'en';
  variant?: 'dify' | 'skills' | 'mcp' | 'coze' | 'fastgpt';
}

function riskCn(r: string): string {
  const map: Record<string, string> = {
    low: '低危',
    medium: '中危',
    high: '高危',
    critical: '严重',
  };
  return map[String(r || '').toLowerCase()] ?? r;
}

function isMachineSummary(summary: string): boolean {
  return /finding\(s\)|no obvious risks found|·\s*(standard|quick|deep|llm|debug|online)/i.test(
    summary,
  );
}

/** Hide hints / false positives / scan-integrity from formal finding details. */
function isFormalDisplayFinding(f: DifyAuditData['findings'][number]): boolean {
  const status = String(f.processingStatus || '').toLowerCase();
  if (status === 'hint' || status === 'reference_sample' || status === 'false_positive') {
    return false;
  }
  const category = String(f.category || '').toUpperCase();
  if (category === 'SCAN_INTEGRITY') {
    return false;
  }
  if (/关键扫描引擎 .+ (?:执行失败|未执行)/i.test(String(f.issue || ''))) {
    return false;
  }
  return true;
}

function countBySeverity(findings: DifyAuditData['findings']) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    const key = String(f.severity || 'medium').toLowerCase();
    if (key in counts) {
      counts[key as keyof typeof counts] += 1;
    } else {
      counts.medium += 1;
    }
  }
  return counts;
}

function buildReadableSummary(
  auditData: DifyAuditData,
  fileName: string | undefined,
  variant: DifyConfigAuditReportContentProps['variant'],
  isZh: boolean,
): string {
  if (!isMachineSummary(auditData.summary) && auditData.summary.trim()) {
    return auditData.summary.trim();
  }
  const objectLabel =
    variant === 'mcp'
      ? isZh
        ? 'MCP 源码包'
        : 'MCP package'
      : variant === 'skills'
        ? isZh
          ? 'SKILLS 技能包'
          : 'SKILLS package'
        : isZh
          ? '配置包'
          : 'config package';
  const target = fileName ? `「${fileName}」` : objectLabel;
  const counts = countBySeverity(auditData.findings);
  const overall = isZh ? riskCn(auditData.overallRisk) : auditData.overallRisk;

  if (auditData.findings.length === 0) {
    return isZh
      ? `本轮对${target}完成安全审计，未发现需立即处置的正式风险项，综合风险评定为${overall}。`
      : `Audit of ${target} completed with no formal risks. Overall risk: ${overall}.`;
  }

  if (!isZh) {
    return `Audit of ${target} found ${auditData.findings.length} issue(s). Overall risk: ${overall} (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium}, low ${counts.low}).`;
  }

  const parts = [
    `本轮对${target}完成安全审计，共识别 ${auditData.findings.length} 项风险发现，综合风险评定为${overall}。`,
  ];
  const breakdown: string[] = [];
  if (counts.critical > 0) {
    breakdown.push(`严重 ${counts.critical}`);
  }
  if (counts.high > 0) {
    breakdown.push(`高危 ${counts.high}`);
  }
  if (counts.medium > 0) {
    breakdown.push(`中危 ${counts.medium}`);
  }
  if (counts.low > 0) {
    breakdown.push(`低危 ${counts.low}`);
  }
  if (breakdown.length > 0) {
    parts.push(`其中：${breakdown.join('、')}。`);
  }
  if (counts.critical > 0 || counts.high > 0) {
    parts.push('建议优先修复严重/高危项后再安装或上线，并复扫确认。');
  }
  return parts.join('');
}

export function DifyConfigAuditReportContent({
  auditData,
  fileName,
  truncationMessage = 'Part of the workflow was truncated for model limits.',
  fallbackFullReportNote,
  locale = 'zh',
  variant = 'dify',
}: DifyConfigAuditReportContentProps) {
  const isZh = locale !== 'en';
  const displayFindings = auditData.findings.filter(isFormalDisplayFinding);
  const counts = countBySeverity(displayFindings);
  const summary = buildReadableSummary(
    { ...auditData, findings: displayFindings },
    fileName,
    variant,
    isZh,
  );
  const sortedFindings = [...displayFindings].sort((a, b) => {
    const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (rank[b.severity] || 0) - (rank[a.severity] || 0);
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground text-xs">{isZh ? '被测文件' : 'File'}</p>
          <p className="mt-1 text-sm font-medium break-all">{fileName || '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{isZh ? '综合风险' : 'Overall risk'}</p>
          <div className="mt-1">
            <Badge
              variant={riskVariant(auditData.overallRisk as 'low' | 'medium' | 'high' | 'critical')}
            >
              {isZh ? riskCn(auditData.overallRisk) : auditData.overallRisk}
            </Badge>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{isZh ? '发现条数' : 'Findings'}</p>
          <p className="mt-1 text-sm font-medium tabular-nums">{displayFindings.length}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{isZh ? '严重度分布' : 'Severity'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isZh
              ? `严重 ${counts.critical} · 高危 ${counts.high} · 中危 ${counts.medium} · 低危 ${counts.low}`
              : `C ${counts.critical} · H ${counts.high} · M ${counts.medium} · L ${counts.low}`}
          </p>
        </div>
      </div>

      {auditData.truncated && (
        <p className="text-amber-600 text-sm dark:text-amber-500">{truncationMessage}</p>
      )}

      <div>
        <h3 className="mb-2 text-base font-semibold">{isZh ? '执行摘要' : 'Summary'}</h3>
        <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
          {summary}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold">
          {isZh ? `发现详情（${sortedFindings.length}）` : `Findings (${sortedFindings.length})`}
        </h3>
        {sortedFindings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {isZh ? '未发现明确风险项。' : 'No findings.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {sortedFindings.map((f, i) => (
              <li
                key={`${f.location}-${i}`}
                className="rounded-lg border border-border bg-background p-4 text-sm shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">#{i + 1}</span>
                  <Badge
                    variant={riskVariant(f.severity as 'low' | 'medium' | 'high' | 'critical')}
                  >
                    {isZh ? riskCn(f.severity) : f.severity}
                  </Badge>
                  <span className="font-medium">
                    {f.dimension || f.category || (isZh ? '未分类' : 'Uncategorized')}
                  </span>
                </div>
                <p className="mb-3 font-medium leading-relaxed text-foreground">{f.issue}</p>
                <div className="space-y-2 text-xs">
                  <p className="text-muted-foreground break-all">
                    <strong className="text-foreground">{isZh ? '位置' : 'Location'}：</strong>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {f.location || '—'}
                    </code>
                  </p>
                  {f.sourceFile ? (
                    <p className="text-muted-foreground break-all">
                      <strong className="text-foreground">{isZh ? '源文件' : 'Source'}：</strong>
                      {f.sourceFile}
                    </p>
                  ) : null}
                  <div className="rounded-md border bg-muted/40 p-3">
                    <p className="mb-1 font-medium text-foreground">{isZh ? '证据' : 'Evidence'}</p>
                    <p className="text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {f.evidence || '—'}
                    </p>
                  </div>
                  <p className="leading-relaxed">
                    <strong>{isZh ? '整改建议' : 'Recommendation'}：</strong>
                    {f.recommendation ||
                      (isZh ? '请根据证据完成整改后复测。' : 'Remediate and retest.')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {auditData.recommendations.length > 0 && (
        <div>
          <h3 className="mb-2 text-base font-semibold">
            {isZh ? '总体建议' : 'General recommendations'}
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {auditData.recommendations.map((r, i) => (
              <li key={i} className="text-muted-foreground leading-relaxed">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fallbackFullReportNote ? (
        <p className="text-muted-foreground border-border mt-2 border-t pt-4 text-sm">
          {fallbackFullReportNote}
        </p>
      ) : null}
    </div>
  );
}
