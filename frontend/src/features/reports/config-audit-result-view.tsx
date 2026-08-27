/**
 * Shared dialogue-style body for config audit results (wizard + local history + aligned with ReportDetail).
 */

import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Copy, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DifyConfigAuditData } from '@/services/api/dify-config-audit';
import {
  ConfigAuditConclusionBand,
  ConfigAuditMetricTiles,
  ConfigAuditRiskPill,
  configAuditConclusion,
  configAuditKindLabelZh,
  configAuditReportTitleZh,
  riskLevelZh,
} from './config-audit-report-chrome';
import { riskVariant } from '@/features/dify-config-audit/utils';

export type ConfigAuditPlatform = 'dify' | 'coze' | 'fastgpt' | 'n8n';

const PLATFORM_REPORT_TYPE: Record<ConfigAuditPlatform, string> = {
  dify: 'dify_config_static',
  coze: 'coze_config_static',
  fastgpt: 'fastgpt_config_static',
  n8n: 'n8n_config_audit',
};

function countBySeverity(findings: DifyConfigAuditData['findings']) {
  let high = 0;
  let medium = 0;
  let critical = 0;
  for (const f of findings) {
    const s = String(f.severity || '').toLowerCase();
    if (s === 'critical') {
      critical += 1;
    } else if (s === 'high') {
      high += 1;
    } else if (s === 'medium') {
      medium += 1;
    }
  }
  return { high, medium, critical, highish: high + critical };
}

export type ConfigAuditResultViewProps = {
  platform: ConfigAuditPlatform;
  result: DifyConfigAuditData;
  fileName?: string;
  createdAt?: string;
  reportId?: string;
  /** When set, show back button / link in the header. */
  backHref?: {
    to: '/expert-toolbox/platform-config-audit' | '/reports/audit-center';
    search?: Record<string, unknown>;
  };
  onCopyMd?: () => void;
  /** Wizard embed: skip page-level title chrome padding. */
  embedded?: boolean;
  /** Hide the primary “open report” CTA (already on the report page). */
  hideOpenReport?: boolean;
  extraActions?: ReactNode;
};

export function ConfigAuditResultView({
  platform,
  result,
  fileName,
  createdAt,
  reportId,
  backHref,
  onCopyMd,
  embedded = false,
  hideOpenReport = false,
  extraActions,
}: ConfigAuditResultViewProps) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const reportType = PLATFORM_REPORT_TYPE[platform];
  const counts = useMemo(() => countBySeverity(result.findings), [result.findings]);
  const conclusion = useMemo(
    () =>
      configAuditConclusion({
        overallRisk: result.overallRisk,
        findingsCount: result.findings.length,
        highCount: counts.highish,
        mediumCount: counts.medium,
        vulnerableFindings: counts.highish,
      }),
    [result.overallRisk, result.findings.length, counts],
  );

  const titleDefault = isZh
    ? configAuditReportTitleZh(reportType)
    : `${platform.toUpperCase()} Config Audit Report`;
  const kindLabel = isZh
    ? configAuditKindLabelZh(reportType)
    : `${platform} config audit`;
  const timeLabel = createdAt
    ? new Date(createdAt).toLocaleString(isZh ? 'zh-CN' : undefined)
    : undefined;

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6'}>
      <div
        className={
          embedded
            ? 'flex flex-wrap items-start justify-between gap-4'
            : 'flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm'
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {backHref ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0"
                onClick={() => {
                  void navigate({
                    to: backHref.to,
                    search: backHref.search as never,
                  });
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                {isZh
                  ? `${titleDefault}${fileName ? ` · ${fileName}` : ''}`
                  : fileName
                    ? `${titleDefault} · ${fileName}`
                    : titleDefault}
              </h1>
              <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{kindLabel}</Badge>
                <ConfigAuditRiskPill risk={result.overallRisk} passed={conclusion.passed} />
                {timeLabel ? <span>· {timeLabel}</span> : null}
                {result.truncated ? (
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    {tr('Truncated', '内容截断')}
                  </Badge>
                ) : null}
              </div>
              {fileName ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  {tr('Config file', '配置文件')} ·{' '}
                  <span className="font-mono">{fileName}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reportId && !hideOpenReport ? (
            <Button variant="default" size="sm" asChild>
              <Link
                to="/reports/$reportId"
                params={{ reportId }}
                search={{ fromCategory: 'config' }}
              >
                <Eye className="mr-1 size-4" />
                {tr('Open report', '打开报告详情')}
              </Link>
            </Button>
          ) : null}
          {onCopyMd ? (
            <Button variant="outline" size="sm" onClick={onCopyMd}>
              <Copy className="mr-1 size-4" />
              {tr('Copy Markdown', '复制 Markdown')}
            </Button>
          ) : null}
          {extraActions}
        </div>
      </div>

      {(result.warnings && result.warnings.length > 0) || result.truncated ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {result.truncated
            ? tr(
                'Part of the workflow was truncated for model limits. ',
                '部分工作流内容因模型长度限制被截断。',
              )
            : null}
          {result.warnings?.join(' ')}
        </div>
      ) : null}

      <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <ConfigAuditConclusionBand
          conclusion={
            isZh
              ? conclusion
              : {
                  ...conclusion,
                  pill: conclusion.passed ? 'Pass' : conclusion.pill,
                  title: conclusion.passed ? 'Recommended pass' : 'Remediate before launch',
                  desc: result.summary,
                }
          }
        />
        <ConfigAuditMetricTiles
          items={[
            {
              label: tr('Findings', '发现总数'),
              value: String(result.findings.length),
            },
            {
              label: tr('High / Critical', '风险命中'),
              value: String(counts.highish),
              tone: counts.highish > 0 ? 'text-red-700' : 'text-emerald-700',
            },
            {
              label: tr('High / Medium', '高危 / 中危'),
              value: `${counts.highish} / ${counts.medium}`,
              tone:
                counts.highish > 0
                  ? 'text-red-700'
                  : counts.medium > 0
                    ? 'text-amber-700'
                    : undefined,
            },
            {
              label: tr('Overall risk', '综合风险'),
              value: isZh ? riskLevelZh(result.overallRisk) : result.overallRisk,
              tone:
                counts.highish > 0
                  ? 'text-red-700'
                  : counts.medium > 0
                    ? 'text-amber-700'
                    : 'text-emerald-700',
            },
          ]}
        />

        <section className="rounded-xl border bg-muted/20 p-4">
          <h3 className="mb-2 text-sm font-semibold">{tr('Summary', '执行摘要')}</h3>
          <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
            {result.summary}
          </p>
        </section>

        <section>
          <h3 className="mb-3 font-semibold">
            {tr(`Findings (${result.findings.length})`, `发现项（${result.findings.length}）`)}
          </h3>
          {result.findings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tr('No findings.', '未发现明确风险项。')}
            </p>
          ) : (
            <ul className="space-y-3">
              {result.findings.map((f, i) => (
                <li key={`${f.location}-${i}`} className="rounded-lg border p-4 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={riskVariant(f.severity)}>
                      {isZh ? riskLevelZh(f.severity) : f.severity}
                    </Badge>
                    <span className="font-medium">{f.category}</span>
                    <span className="text-muted-foreground text-xs">{f.location}</span>
                  </div>
                  <p className="mb-2">{f.issue}</p>
                  <p className="text-muted-foreground mb-2 text-xs">
                    <strong>{tr('Evidence:', '证据：')}</strong> {f.evidence}
                  </p>
                  <p className="text-xs">
                    <strong>{tr('Recommendation:', '建议：')}</strong> {f.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {result.recommendations.length > 0 ? (
          <section className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">
              {tr('General recommendations', '通用建议')}
            </h3>
            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
              {result.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
