/**
 * Dialogue-style chrome for configuration / capability audit reports.
 */

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type ConfigAuditOverallRisk = 'low' | 'medium' | 'high' | 'critical' | string;

export function riskLevelZh(risk: string | undefined): string {
  const key = String(risk || '').toLowerCase();
  const map: Record<string, string> = {
    low: '低危',
    medium: '中危',
    high: '高危',
    critical: '严重',
  };
  return map[key] || risk || '待评估';
}

export function reportStatusZh(status: string | undefined): string {
  const key = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    draft: '草稿',
    review: '评审中',
    published: '已发布',
    archived: '已归档',
  };
  return map[key] || status || '—';
}

export function configAuditKindLabelZh(reportType: string | undefined): string {
  switch (reportType) {
    case 'skills_md_audit':
      return 'SKILLS 安全评估';
    case 'mcp_source_audit':
      return 'MCP 源码安全评估';
    case 'coze_config_static':
      return 'Coze 配置灰盒扫描';
    case 'coze_config_audit':
      return 'Coze 配置灰盒与 API 黑盒扫描';
    case 'fastgpt_config_static':
      return 'FastGPT 配置灰盒扫描';
    case 'fastgpt_config_audit':
      return 'FastGPT 配置灰盒与 API 黑盒扫描';
    case 'n8n_config_audit':
      return 'n8n 配置安全评估';
    case 'dify_config_static':
      return 'Dify 配置灰盒扫描';
    case 'dify_config_audit':
    default:
      return 'Dify 配置灰盒与 API 黑盒扫描';
  }
}

export function configAuditReportTitleZh(reportType: string | undefined): string {
  switch (reportType) {
    case 'skills_md_audit':
      return 'SKILLS 安全评估报告';
    case 'mcp_source_audit':
      return 'MCP 源码安全评估报告';
    case 'coze_config_static':
    case 'coze_config_audit':
      return 'Coze 配置安全评估报告';
    case 'fastgpt_config_static':
    case 'fastgpt_config_audit':
      return 'FastGPT 配置安全评估报告';
    case 'n8n_config_audit':
      return 'n8n 配置安全评估报告';
    case 'dify_config_static':
    case 'dify_config_audit':
    default:
      return '配置文件风险检测报告';
  }
}

export function configAuditConclusion(params: {
  overallRisk?: string;
  findingsCount?: number;
  highCount?: number;
  mediumCount?: number;
  vulnerableFindings?: number;
}): { pill: string; title: string; desc: string; passed: boolean } {
  const risk = String(params.overallRisk || '').toLowerCase();
  const highish =
    risk === 'high' ||
    risk === 'critical' ||
    (params.highCount ?? 0) > 0 ||
    (params.vulnerableFindings ?? 0) > 0;
  const findingsCount = params.findingsCount ?? 0;

  if (!risk && findingsCount === 0 && !highish) {
    return {
      pill: '待评估',
      title: '结论待确认',
      desc: '报告尚未给出明确综合风险，请结合发现明细与完整正文人工确认。',
      passed: false,
    };
  }

  if (highish) {
    return {
      pill: '存在配置风险',
      title: '建议修复后再上线',
      desc: `综合风险为${riskLevelZh(risk || 'high')}，共 ${findingsCount} 项结构化发现（高危 ${params.highCount ?? 0}、中危 ${params.mediumCount ?? 0}）。建议优先处置严重/高危项并复扫确认。`,
      passed: false,
    };
  }

  if (risk === 'medium' || (params.mediumCount ?? 0) > 0) {
    return {
      pill: '需关注',
      title: '风险可控但仍需复核',
      desc: `综合风险为${riskLevelZh(risk || 'medium')}，共 ${findingsCount} 项发现。建议在变更窗口内完成复核与加固。`,
      passed: false,
    };
  }

  return {
    pill: '配置安全达标',
    title: '建议通过',
    desc:
      findingsCount > 0
        ? `综合风险为${riskLevelZh(risk || 'low')}，共 ${findingsCount} 项低优先级发现，可按计划跟进。`
        : `综合风险为${riskLevelZh(risk || 'low')}，本轮未发现需立即处置的配置风险。`,
    passed: true,
  };
}

export function ConfigAuditConclusionBand({
  conclusion,
}: {
  conclusion: ReturnType<typeof configAuditConclusion>;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border p-4',
        conclusion.passed
          ? 'border-emerald-200 bg-emerald-50/60'
          : 'border-red-200 bg-red-50/60',
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        综合结论
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        <strong className="text-base">{conclusion.title}</strong> — {conclusion.desc}
      </p>
    </section>
  );
}

export function ConfigAuditMetricTiles({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: string }>;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-muted/20 p-4">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className={cn('mt-1 text-2xl font-bold', item.tone)}>{item.value}</div>
        </div>
      ))}
    </section>
  );
}

export function ConfigAuditRiskPill({
  risk,
  passed,
}: {
  risk?: string;
  passed: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        passed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {risk ? riskLevelZh(risk) : passed ? '达标' : '存在风险'}
    </Badge>
  );
}
