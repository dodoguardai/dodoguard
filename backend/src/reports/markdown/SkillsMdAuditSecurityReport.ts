import type { DifyConfigAuditResult } from '../../services/difyConfigAuditService';

type AuditFinding = DifyConfigAuditResult['findings'][number] & {
  dimension?: string;
  sourceFile?: string;
  processingStatus?: string;
};

function esc(s: string): string {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .slice(0, 4000);
}

function escBlock(s: string): string {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 6000);
}

function riskCn(r: string): string {
  const m: Record<string, string> = {
    low: '低危',
    medium: '中危',
    high: '高危',
    critical: '严重',
  };
  return m[String(r || '').toLowerCase()] ?? r;
}

function severityRank(r: string): number {
  const m: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return m[String(r || '').toLowerCase()] ?? 0;
}

function defaultTitle(kind: 'skills' | 'mcp'): string {
  return kind === 'mcp' ? 'MCP 源码安全审计报告' : 'SKILLS 技能包安全审计报告';
}

function isMachineSummary(summary: string): boolean {
  return /finding\(s\)|no obvious risks found|·\s*(standard|quick|deep|llm|debug|online)/i.test(
    summary,
  );
}

function countBySeverity(findings: AuditFinding[]): Record<string, number> {
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

function buildExecutiveSummary(
  audit: DifyConfigAuditResult,
  kind: 'skills' | 'mcp',
  fileName?: string,
): string {
  const objectLabel = kind === 'mcp' ? 'MCP 服务端源码包' : 'SKILLS 技能包';
  const target = fileName ? `「${fileName}」` : `该${objectLabel}`;
  const counts = countBySeverity(audit.findings as AuditFinding[]);
  const overall = riskCn(audit.overallRisk);

  if (!isMachineSummary(audit.summary) && audit.summary.trim()) {
    return audit.summary.trim();
  }

  if (audit.findings.length === 0) {
    return `本轮对${target}完成静态安全审计，未发现需立即处置的正式风险项，综合风险评定为${overall}。建议仍保持依赖与脚本来源可追溯，并定期复扫。`;
  }

  const parts = [
    `本轮对${target}完成静态安全审计，共识别 ${audit.findings.length} 项风险发现，综合风险评定为${overall}。`,
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
  } else {
    parts.push('建议按条目建议完成整改后复扫，确认风险收敛。');
  }
  return parts.join('');
}

function collectRecommendations(audit: DifyConfigAuditResult): string[] {
  const recs: string[] = [];
  const seen = new Set<string>();
  for (const r of audit.recommendations || []) {
    const text = String(r || '').trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      recs.push(text);
    }
  }
  for (const f of audit.findings) {
    const text = String(f.recommendation || '').trim();
    if (text && !seen.has(text)) {
      seen.add(text);
      recs.push(text);
    }
  }
  return recs.slice(0, 12);
}

export function renderSkillsMdAuditReportFromAuditResult(
  audit: DifyConfigAuditResult & { scannedFiles?: { path: string }[] },
  fileName?: string,
  opts?: { reportTitle?: string; kind?: 'skills' | 'mcp' },
): string {
  const kind = opts?.kind ?? 'skills';
  const title = opts?.reportTitle?.trim() || defaultTitle(kind);
  const objectLabel = kind === 'mcp' ? 'MCP 源码包' : 'SKILLS 技能包';
  const scannedFiles = audit.scannedFiles ?? [];
  const findings = [...(audit.findings as AuditFinding[])].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  const counts = countBySeverity(findings);
  const summary = buildExecutiveSummary(audit, kind, fileName);
  const recommendations = collectRecommendations(audit);
  const issuedAt = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `# ${title}`,
    '',
    `> **测试类型**：${objectLabel}静态安全审计  `,
    `> **综合风险**：${riskCn(audit.overallRisk)}（${audit.overallRisk}）  `,
    `> **被测对象**：${fileName ? esc(fileName) : objectLabel}  `,
    `> **出具日期**：${issuedAt}`,
    '',
    '## 1. 文档控制信息',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 报告名称 | ${esc(title)} |`,
    `| 被测文件 | ${fileName ? esc(fileName) : '—'} |`,
    `| 综合风险 | **${riskCn(audit.overallRisk)}** |`,
    `| 发现条数 | ${findings.length} |`,
    `| 出具日期 | ${issuedAt} |`,
    '| 执行平台 | 智安 |',
    '',
    '## 2. 执行摘要',
    '',
    summary,
    '',
    '## 3. 风险汇总',
    '',
    '| 严重度 | 数量 |',
    '| --- | ---: |',
    `| 严重 | ${counts.critical} |`,
    `| 高危 | ${counts.high} |`,
    `| 中危 | ${counts.medium} |`,
    `| 低危 | ${counts.low} |`,
    `| **合计** | **${findings.length}** |`,
    '',
    '## 4. 发现详情',
    '',
  ];

  if (findings.length === 0) {
    lines.push('未发现明确风险项。', '');
  } else {
    findings.forEach((finding, index) => {
      const dim = finding.dimension || finding.category || '未分类';
      const metaRows = [
        `| 严重度 | **${riskCn(finding.severity)}**（${finding.severity}） |`,
        `| 分类 / 维度 | ${esc(dim)} |`,
        `| 位置 | \`${esc(finding.location || '—')}\` |`,
      ];
      if (finding.sourceFile) {
        metaRows.push(`| 源文件 | \`${esc(finding.sourceFile)}\` |`);
      }
      if (finding.processingStatus) {
        metaRows.push(`| 处置状态 | ${esc(finding.processingStatus)} |`);
      }
      lines.push(
        `### 4.${index + 1} ${esc(finding.issue || '未命名风险')}`,
        '',
        `| 字段 | 内容 |`,
        `| --- | --- |`,
        ...metaRows,
        '',
        '**问题说明**',
        '',
        escBlock(finding.issue || '—'),
        '',
        '**证据**',
        '',
        '```',
        escBlock(finding.evidence || '—'),
        '```',
        '',
        '**整改建议**',
        '',
        escBlock(finding.recommendation || '请根据证据完成整改后复测。'),
        '',
      );
    });
  }

  lines.push('## 5. 总体建议', '');
  if (recommendations.length === 0) {
    lines.push('- 保持依赖与脚本来源可追溯，并定期复扫。', '');
  } else {
    for (const rec of recommendations) {
      lines.push(`- ${esc(rec)}`);
    }
    lines.push('');
  }

  if (audit.warnings && audit.warnings.length > 0) {
    lines.push('## 6. 告警与说明', '');
    for (const warning of audit.warnings) {
      lines.push(`- ${esc(warning)}`);
    }
    lines.push('');
  }

  if (scannedFiles.length > 0) {
    const sectionNo = audit.warnings && audit.warnings.length > 0 ? 7 : 6;
    lines.push(`## ${sectionNo}. 扫描文件清单`, '');
    lines.push(`共扫描 **${scannedFiles.length}** 个文件（最多展示前 100 项）：`, '');
    for (const file of scannedFiles.slice(0, 100)) {
      lines.push(`- \`${esc(file.path)}\``);
    }
    if (scannedFiles.length > 100) {
      lines.push(`- … 其余 ${scannedFiles.length - 100} 个文件已省略`);
    }
    lines.push('');
  }

  return lines.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
}
