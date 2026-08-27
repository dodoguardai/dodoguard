import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

export function riskVariant(
  risk: SkillsMdAuditData['overallRisk'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (risk === 'critical' || risk === 'high') {
    return 'destructive';
  }
  if (risk === 'medium') {
    return 'default';
  }
  return 'secondary';
}

export function auditToMarkdown(
  data: SkillsMdAuditData,
  fileName?: string,
  opts?: { reportTitle?: string },
): string {
  const rawTitle = opts?.reportTitle?.trim();
  const heading =
    rawTitle && rawTitle.length > 0
      ? rawTitle.startsWith('#')
        ? rawTitle
        : `# ${rawTitle}`
      : '# SKILLS 技能包安全审计报告';
  const lines = [
    heading,
    '',
    fileName ? `**文件：** ${fileName}` : '',
    data.scannedFiles?.length
      ? `**已扫描文件：** ${data.scannedFiles.length}（${data.scannedFiles.map((s) => s.path).join('、')}）`
      : '',
    `**总体风险：** ${data.overallRisk}`,
    '',
    '## 摘要',
    data.summary,
    '',
  ];
  if (data.truncated || (data.warnings && data.warnings.length > 0)) {
    lines.push('## 警告与提示', ...(data.warnings ?? []), '输入内容可能已被截断。', '');
  }
  lines.push('## 发现项', '');
  for (const f of data.findings) {
    const dim = f.dimension ? `维度=${f.dimension}` : '';
    const src = f.sourceFile ? `文件=${f.sourceFile}` : '';
    const meta = [dim, src].filter(Boolean).join(' ');
    lines.push(
      `### [${f.severity.toUpperCase()}] ${f.category}${meta ? `（${meta}）` : ''} — ${f.location}`,
      '',
      f.issue,
      '',
      `*证据：* ${f.evidence}`,
      '',
      `*修复建议：* ${f.recommendation}`,
      '',
    );
  }
  if (data.recommendations.length > 0) {
    lines.push('## 通用建议', ...data.recommendations.map((r) => `- ${r}`), '');
  }
  return lines.filter(Boolean).join('\n');
}
