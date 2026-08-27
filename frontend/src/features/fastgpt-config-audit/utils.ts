import type { FastGptConfigAuditData } from '@/services/api/fastgpt-config-audit';

export function riskVariant(
  risk: FastGptConfigAuditData['overallRisk'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (risk === 'critical' || risk === 'high') {
    return 'destructive';
  }
  if (risk === 'medium') {
    return 'default';
  }
  return 'secondary';
}

export function auditToMarkdown(data: FastGptConfigAuditData, fileName?: string): string {
  const lines = [
    '# FastGPT Config Audit Report',
    '',
    fileName ? `**File:** ${fileName}` : '',
    `**Overall risk:** ${data.overallRisk}`,
    '',
    '## Summary',
    data.summary,
    '',
  ];
  if (data.truncated || (data.warnings && data.warnings.length > 0)) {
    lines.push('## Warnings', ...(data.warnings ?? []), 'Input may have been truncated.', '');
  }
  lines.push('## Findings', '');
  for (const f of data.findings) {
    lines.push(
      `### [${f.severity.toUpperCase()}] ${f.category} — ${f.location}`,
      '',
      f.issue,
      '',
      `*Evidence:* ${f.evidence}`,
      '',
      `*Recommendation:* ${f.recommendation}`,
      '',
    );
  }
  if (data.recommendations.length > 0) {
    lines.push('## General recommendations', ...data.recommendations.map((r) => `- ${r}`), '');
  }
  return lines.filter(Boolean).join('\n');
}
