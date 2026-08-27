import { type ReactNode, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { RiskBadge, Shell } from '@/features/compliance-case-library/shared';
import {
  formatCaseDuration,
  type DialogueCaseRow,
  type DialogueConclusionMeta,
  type DialogueLibraryStatGroup,
  type DialogueSampleType,
  type DialogueTranscriptTurn,
  type DialogueTaskDetailStats,
} from '@/features/detection-scanning/dialogue-task-detail-utils';
import { buildDialogueReportHtml } from '@/features/detection-scanning/dialogue-report-export';
import {
  DEFAULT_REPORT_BRAND_ORGANIZATION,
  normalizeReportBrandConfig,
  REPORT_BRAND_CONFIG_KEY,
} from '@/features/reports/report-brand-config';
import {
  buildRetestResultDisplayModel,
  buildRetestRunSummaryFromRetestTask,
  collectRetestReports,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  type EnrichedRiskRow,
  enrichRemediationRows,
  type RetestReportSummary,
  type RetestResultDisplayModel,
  relatedRiskRowsForRetestRun,
  indexRetestExecutions,
  readTechnicalExecutionsFromTask,
  resolveRetestExecutionForRow,
  resolveRetestOutcomeForBatch,
  resolveRiskRowLibraryLabel,
  resolveRetestScanTaskForReport,
  retestRunToScanTask,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { reportsApi } from '@/services/api/reports';
import { systemConfigApi } from '@/services/api/system-config';
import type { SecurityScanFinding, SecurityScanTask } from '@/types/entities';
import '@/features/risk-closed-loop/risk-retest-report.css';

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    return '刚刚';
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return date.toLocaleString('zh-CN');
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function downloadBlobFile(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

let reportTurndown: TurndownService | null = null;

function getReportTurndown(): TurndownService {
  if (!reportTurndown) {
    reportTurndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    reportTurndown.use(gfm);
  }
  return reportTurndown;
}

function reportHtmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('style, script').forEach((el) => el.remove());
  return getReportTurndown().turndown(doc.body).trim();
}

function resolveReport(
  reportId: string,
  taskId: string,
  rows: EnrichedRiskRow[],
  retestRuns: Awaited<ReturnType<typeof detectionScanningApi.listRetestRuns>>,
): RetestReportSummary | null {
  const reports = collectRetestReports(rows, retestRuns);
  const hit =
    reports.find((r) => r.id === reportId || r.retestPlanId === reportId) ??
    reports.find(
      (r) => r.taskId === taskId && (r.id.includes(reportId) || reportId.includes(r.id)),
    );
  if (hit) {
    return hit;
  }

  const matchedRun = resolveRetestScanTaskForReport(reportId, retestRuns);
  if (matchedRun) {
    const taskRows = rows.filter((row) => row.taskId === taskId);
    const sample = taskRows[0];
    const summary = buildRetestRunSummaryFromRetestTask(matchedRun, taskRows);
    return {
      id: summary.reportId,
      taskId,
      taskName: sample?.scanTask?.name || taskId,
      agentName: sample?.agentName || '—',
      title: `${sample?.scanTask?.name || taskId} · 风险整改复测报告`,
      createdAt: summary.time,
      status:
        summary.status === 'partial'
          ? 'partial'
          : summary.fail > 0
            ? 'draft'
            : summary.pass > 0
              ? 'archived'
              : 'draft',
      riskCount: summary.total,
      passedCount: summary.pass,
      failedCount: summary.fail,
      retestPlanId: summary.batchId,
    };
  }

  const taskRow = rows.find((r) => r.taskId === taskId);
  if (!taskRow) {
    return null;
  }
  return {
    id: reportId,
    taskId,
    taskName: taskRow.scanTask?.name || taskId,
    agentName: taskRow.agentName,
    title: `${taskRow.scanTask?.name || taskId} · 风险整改复测报告`,
    createdAt: new Date().toISOString(),
    status: 'draft',
    riskCount: 0,
    passedCount: 0,
    failedCount: 0,
    retestPlanId: reportId.startsWith('RT-') ? reportId : undefined,
  };
}

function formatResponseText(raw?: string): string {
  if (!raw?.trim()) {
    return '—';
  }
  return formatDifyResponseForDisplay(raw);
}

function readEvidenceRecord(finding?: SecurityScanFinding): Record<string, unknown> {
  return finding?.evidence && typeof finding.evidence === 'object' ? finding.evidence : {};
}

function asDialogueSampleType(value: unknown): DialogueSampleType | undefined {
  return value === 'single' ||
    value === 'multi_turn' ||
    value === 'file_input' ||
    value === 'file_output'
    ? value
    : undefined;
}

function normalizeTranscript(
  transcript: Array<{ role?: string; content?: string }> | undefined,
): DialogueTranscriptTurn[] | undefined {
  const normalized = (transcript ?? [])
    .map((turn) => ({
      role: typeof turn.role === 'string' && turn.role.trim() ? turn.role : 'user',
      content: typeof turn.content === 'string' ? turn.content : '',
    }))
    .filter((turn) => turn.content.trim());
  return normalized.length > 0 ? normalized : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function buildSyntheticFinding(row: EnrichedRiskRow): SecurityScanFinding | undefined {
  if (row.finding) {
    return row.finding;
  }
  return {
    id: row.findingId || row.id,
    organizationId: row.organizationId,
    taskId: row.taskId,
    title: row.title,
    riskLevel: row.riskLevel,
    category: resolveRiskRowLibraryLabel(row),
    status: 'open',
    description: row.evidenceSummary || row.title,
    recommendation: row.remediationAdvice || null,
    remediationTaskId: row.id,
    detectedAt: row.createdAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildRetestDialogueReportSnapshot(input: {
  report: RetestReportSummary;
  retestPlanId: string;
  sourceTask?: SecurityScanTask | null;
  retestScanTask?: SecurityScanTask | null;
  outcomes: Array<{ row: EnrichedRiskRow; outcome: 'passed' | 'failed' | 'pending' }>;
  verdictTitle: string;
  verdictSubtitle: string;
  brandOrganization?: string;
  coverImageDataUri?: string;
  logoDataUri?: string;
}): string {
  const executionIndex = indexRetestExecutions(
    readTechnicalExecutionsFromTask(input.retestScanTask),
  );
  const stats: DialogueTaskDetailStats = {
    total: input.outcomes.length,
    pass: input.outcomes.filter((item) => item.outcome === 'passed').length,
    fail: input.outcomes.filter((item) => item.outcome === 'failed').length,
    pending: input.outcomes.filter((item) => item.outcome === 'pending').length,
  };
  const failedRiskRows = input.outcomes
    .filter((item) => item.outcome === 'failed')
    .map((item) => item.row);
  const findings = failedRiskRows
    .map((row) => buildSyntheticFinding(row))
    .filter((item): item is SecurityScanFinding => Boolean(item));

  const groups = new Map<string, DialogueLibraryStatGroup>();
  for (const { row, outcome } of input.outcomes) {
    const title = resolveRiskRowLibraryLabel(row) || row.finding?.category || '复测风险项';
    const key = title || 'retest';
    const group =
      groups.get(key) ??
      ({
        libraryId: key,
        title: key,
        planned: 0,
        pass: 0,
        fail: 0,
      } satisfies DialogueLibraryStatGroup);
    group.planned += 1;
    if (outcome === 'passed') {
      group.pass += 1;
    } else if (outcome === 'failed') {
      group.fail += 1;
    }
    groups.set(key, group);
  }
  const libraryGroups = [...groups.values()];

  const caseRows: DialogueCaseRow[] = input.outcomes.map(({ row, outcome }) => {
    const execution = resolveRetestExecutionForRow(row, executionIndex);
    const finding = buildSyntheticFinding(row);
    const evidence = readEvidenceRecord(finding);
    const libraryTitle =
      readString(execution?.libraryTitle) || resolveRiskRowLibraryLabel(row) || '复测风险项';
    const prompt =
      readString(execution?.prompt) ||
      readString(evidence.prompt) ||
      row.finding?.description ||
      row.evidenceSummary ||
      row.title;
    const actualOutput =
      readString(execution?.responsePreview) ||
      readString(evidence.responsePreview) ||
      row.evidenceSummary ||
      '—';
    const passed = outcome === 'passed';
    const pending = outcome === 'pending';
    return {
      caseId: readString(execution?.caseId) || readString(row.finding?.testCaseId) || row.id,
      caseCode: readString(execution?.caseCode) || row.violationNo || row.id.slice(0, 8),
      caseName: readString(execution?.caseName) || row.finding?.title || row.title,
      libraryId:
        readString(execution?.libraryId) || readString(row.finding?.caseLibraryId) || libraryTitle,
      libraryTitle,
      prompt,
      promptSummary: prompt,
      expectedPass: readString(execution?.expectedPass) || readString(evidence.expectedPass),
      expectedFail: readString(execution?.expectedFail) || readString(evidence.expectedFail),
      expectedOutput:
        readString(execution?.expectedPass) ||
        readString(execution?.expectedFail) ||
        readString(evidence.expectedPass) ||
        readString(evidence.expectedFail) ||
        '—',
      actualOutput,
      verdict: pending ? '待确认' : passed ? '通过' : '失败',
      durationLabel: formatCaseDuration(execution?.responseTimeMs),
      passed,
      pending,
      riskLevel: row.riskLevel,
      responsePreview: actualOutput,
      sampleType: asDialogueSampleType(execution?.sampleType),
      transcript: normalizeTranscript(execution?.transcript),
      judgeVerdict:
        execution?.judgeVerdict ||
        (evidence.judgeVerdict && typeof evidence.judgeVerdict === 'object'
          ? (evidence.judgeVerdict as Record<string, unknown>)
          : undefined),
      finding,
    };
  });

  const sourceTask = input.sourceTask;
  const retestTask = input.retestScanTask;
  const retestSubjectName =
    readString(input.report.agentName) ||
    readString(input.sourceTask?.assetName) ||
    readString(input.sourceTask?.targetSummary) ||
    readString(input.sourceTask?.name) ||
    '风险整改';
  const exportTask: SecurityScanTask = {
    ...(sourceTask ||
      retestTask || {
        id: input.report.taskId,
        organizationId: '',
        name: input.report.taskName,
        source: 'manual',
        scanType: 'security_baseline',
        targetKind: 'agent',
        status: 'completed',
        progress: 100,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        createdAt: input.report.createdAt,
        updatedAt: input.report.createdAt,
      }),
    id: retestTask?.id || input.report.taskId,
    name: `${retestSubjectName} · 复测 ${input.retestPlanId}`,
    source: 'risk_retest',
    status: retestTask?.status || 'completed',
    progress: retestTask?.progress ?? 100,
    targetSummary: input.report.agentName,
    assetName: input.report.agentName,
    completedAt: retestTask?.completedAt || input.report.createdAt,
    highCount: failedRiskRows.filter(
      (row) => row.riskLevel === 'critical' || row.riskLevel === 'high',
    ).length,
    mediumCount: failedRiskRows.filter((row) => row.riskLevel === 'medium').length,
    lowCount: failedRiskRows.filter((row) => row.riskLevel === 'low').length,
    metadata: {
      ...(sourceTask?.metadata || {}),
      ...(retestTask?.metadata || {}),
      retestPlanId: input.retestPlanId,
    },
  };

  const conclusion: DialogueConclusionMeta = {
    pill: input.verdictTitle,
    pillCls: stats.fail > 0 ? (stats.pass > 0 ? 'orange' : 'red') : 'green',
    title: input.verdictTitle,
    desc: `${input.verdictSubtitle}。本次复测共 ${stats.total} 项，通过 ${stats.pass} 项，未通过 ${stats.fail} 项，待确认 ${stats.pending} 项。`,
    actions: [],
  };

  return buildDialogueReportHtml({
    task: exportTask,
    stats,
    conclusion,
    findings,
    caseRows,
    libraryGroups,
    passRateThreshold: 95,
    coverImageDataUri: input.coverImageDataUri,
    logoDataUri: input.logoDataUri,
    brandOrganization: input.brandOrganization,
  });
}

function DetailTableSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; value: ReactNode; mono?: boolean }>;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/30 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
        {title}
      </div>
      <Table>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key} className="hover:bg-transparent">
              <TableCell className="w-32 bg-muted/20 align-top font-medium whitespace-normal text-muted-foreground">
                {row.label}
              </TableCell>
              <TableCell
                className={cn('min-w-0 align-top whitespace-normal', row.mono ? 'p-0' : 'text-sm')}
              >
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailPreBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap bg-muted/40 p-3 text-sm">
      {children}
    </pre>
  );
}

export function RiskRetestReportPage({
  reportId,
  taskId,
  returnTo = '/scan/remediation',
}: {
  reportId: string;
  taskId: string;
  returnTo?: string;
}) {
  const navigate = useNavigate();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<EnrichedRiskRow | null>(null);
  const [isExportingTemplate, setIsExportingTemplate] = useState(false);

  const remediationsQuery = useQuery({
    queryKey: ['security-remediations', 'retest-report', reportId],
    queryFn: () => detectionScanningApi.listRemediations({ limit: 300 }),
  });
  const findingsQuery = useQuery({
    queryKey: ['security-scan-findings', 'retest-report', reportId],
    queryFn: () => detectionScanningApi.listFindings({ limit: 300 }),
  });
  const tasksQuery = useQuery({
    queryKey: ['security-scan-tasks', 'retest-report', reportId],
    queryFn: () => detectionScanningApi.listTasks({ limit: 300 }),
  });
  const retestRunsQuery = useQuery({
    queryKey: ['security-retest-runs', taskId, 'retest-report', reportId],
    queryFn: () => detectionScanningApi.listRetestRuns(taskId),
    enabled: Boolean(taskId),
  });
  const sourceTaskQuery = useQuery({
    queryKey: ['security-scan-task', taskId],
    queryFn: () => detectionScanningApi.getTask(taskId),
    enabled: Boolean(taskId),
  });
  const reportBrandConfigQuery = useQuery({
    queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY, 'retest-report'],
    queryFn: async () => {
      try {
        const row = await systemConfigApi.getByKey(REPORT_BRAND_CONFIG_KEY);
        return normalizeReportBrandConfig(row.value);
      } catch (error) {
        if ((error as { status?: number; code?: string })?.status === 404) {
          return normalizeReportBrandConfig(null);
        }
        throw error;
      }
    },
  });

  const enrichedRows = useMemo(
    () =>
      enrichRemediationRows(
        remediationsQuery.data?.data || [],
        findingsQuery.data?.data || [],
        tasksQuery.data?.data || [],
      ),
    [remediationsQuery.data?.data, findingsQuery.data?.data, tasksQuery.data?.data],
  );

  const retestRuns = retestRunsQuery.data ?? [];

  const matchedRetestRun = useMemo(
    () => resolveRetestScanTaskForReport(reportId, retestRuns),
    [reportId, retestRuns],
  );

  const report = useMemo(
    () => resolveReport(reportId, taskId, enrichedRows, retestRuns),
    [reportId, taskId, enrichedRows, retestRuns],
  );

  const risks = useMemo(
    () =>
      report ? relatedRiskRowsForRetestRun(matchedRetestRun, enrichedRows, taskId, report) : [],
    [report, matchedRetestRun, enrichedRows, taskId],
  );

  const batchOutcomes = useMemo(
    () =>
      risks.map((row) => ({
        row,
        outcome: resolveRetestOutcomeForBatch(row, matchedRetestRun),
      })),
    [risks, matchedRetestRun],
  );

  const passedRows = batchOutcomes
    .filter((item) => item.outcome === 'passed')
    .map((item) => item.row);
  const failedRows = batchOutcomes
    .filter((item) => item.outcome === 'failed')
    .map((item) => item.row);
  const pendingRows = batchOutcomes
    .filter((item) => item.outcome === 'pending')
    .map((item) => item.row);

  const retestScanTask = useMemo(
    () => (matchedRetestRun ? retestRunToScanTask(matchedRetestRun) : null),
    [matchedRetestRun],
  );

  const detailModel: RetestResultDisplayModel | null = useMemo(() => {
    if (!detailRow) {
      return null;
    }
    return buildRetestResultDisplayModel(detailRow, retestScanTask);
  }, [detailRow, retestScanTask]);

  const verdict: 'pass' | 'warn' | 'fail' =
    failedRows.length === 0 && passedRows.length > 0
      ? 'pass'
      : passedRows.length > 0 && failedRows.length > 0
        ? 'warn'
        : 'fail';

  const verdictTitle =
    verdict === 'pass' ? '复测通过' : verdict === 'warn' ? '部分通过' : '复测未通过';
  const verdictSubtitle =
    verdict === 'pass'
      ? '建议关闭整改任务'
      : verdict === 'warn'
        ? '不建议关闭整改任务'
        : '需重新整改';

  const warnSummary =
    verdict === 'warn'
      ? `${passedRows.length} 项通过 · ${failedRows.length} 项仍失败 · 请确认关闭已通过项`
      : null;

  const isLoading =
    remediationsQuery.isLoading ||
    findingsQuery.isLoading ||
    tasksQuery.isLoading ||
    retestRunsQuery.isLoading;

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载复测报告…
        </div>
      </Shell>
    );
  }

  if (!report) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <p className="text-muted-foreground">未找到复测报告 {reportId}</p>
          <Button type="button" variant="outline" className="mt-4" asChild>
            <Link to={returnTo}>返回风险闭环</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const scanTask = sourceTaskQuery.data;
  const retestPlanId =
    matchedRetestRun?.planId ||
    report.retestPlanId ||
    (reportId.startsWith('RT-') ? reportId : reportId.replace(/^RPT-RETEST-/, 'RT-'));
  const exportBaseName = sanitizeFileName(`风险整改复测报告-${retestPlanId}`);
  const buildUnifiedReportHtml = async () => {
    const [coverImageDataUri, logoDataUri] = await Promise.all([
      reportsApi.getAssetDataUri('cover-image').catch(() => undefined),
      reportsApi.getAssetDataUri('logo').catch(() => undefined),
    ]);
    return buildRetestDialogueReportSnapshot({
      report,
      retestPlanId,
      sourceTask: scanTask,
      retestScanTask,
      outcomes: batchOutcomes,
      verdictTitle,
      verdictSubtitle,
      brandOrganization:
        reportBrandConfigQuery.data?.organization || DEFAULT_REPORT_BRAND_ORGANIZATION,
      coverImageDataUri,
      logoDataUri,
    });
  };
  const exportReportHtml = () => {
    void (async () => {
      try {
        const html = await buildUnifiedReportHtml();
        downloadTextFile(html, `${exportBaseName}.html`, 'text/html;charset=utf-8');
        toast.success('HTML 报告已开始下载');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '导出失败');
      }
    })();
  };
  const exportReportMarkdown = () => {
    void (async () => {
      try {
        const html = await buildUnifiedReportHtml();
        const markdown = reportHtmlToMarkdown(html);
        downloadTextFile(`${markdown}\n`, `${exportBaseName}.md`, 'text/markdown;charset=utf-8');
        toast.success('Markdown 报告已开始下载');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '导出失败');
      }
    })();
  };
  const exportReportJson = () => {
    const payload = {
      report: {
        id: report.id,
        title: report.title,
        taskId: report.taskId,
        taskName: report.taskName,
        agentName: report.agentName,
        createdAt: report.createdAt,
        status: report.status,
        retestPlanId,
        conclusion: report.conclusion,
      },
      sourceTask: scanTask
        ? {
            id: scanTask.id,
            name: scanTask.name,
            scanType: scanTask.scanType,
            status: scanTask.status,
            completedAt: scanTask.completedAt,
          }
        : null,
      summary: {
        verdict,
        verdictTitle,
        verdictSubtitle,
        total: risks.length,
        passed: passedRows.length,
        failed: failedRows.length,
        pending: pendingRows.length,
      },
      risks: batchOutcomes.map(({ row, outcome }) => ({
        id: row.id,
        title: row.title,
        violationNo: row.violationNo,
        riskLevel: row.riskLevel,
        category: row.finding?.category,
        displayStatus: row.displayStatus,
        retestOutcome: outcome,
        ownerName: row.ownerName,
        ownerId: row.ownerId,
        department: row.department,
        remediationAdvice: row.remediationAdvice,
        updatedAt: row.updatedAt,
      })),
    };
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `${exportBaseName}.json`,
      'application/json;charset=utf-8',
    );
    toast.success('JSON 数据已开始下载');
  };
  const exportReportCsv = () => {
    const rows = [
      [
        'id',
        'title',
        'violationNo',
        'riskLevel',
        'category',
        'displayStatus',
        'retestOutcome',
        'ownerName',
        'department',
        'remediationAdvice',
        'updatedAt',
      ],
      ...batchOutcomes.map(({ row, outcome }) => [
        row.id,
        row.title,
        row.violationNo || '',
        row.riskLevel,
        row.finding?.category || '',
        row.displayStatus,
        outcome,
        row.ownerName || '',
        row.department || '',
        row.remediationAdvice || '',
        row.updatedAt || '',
      ]),
    ];
    const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
    const content = rows.map((row) => row.map(escape).join(',')).join('\n');
    downloadTextFile(`\uFEFF${content}`, `${exportBaseName}.csv`, 'text/csv;charset=utf-8');
    toast.success('CSV 数据已开始下载');
  };
  const exportReportPdf = async () => {
    setIsExportingTemplate(true);
    try {
      const title = `风险整改复测报告-${retestPlanId}`;
      const html = await buildUnifiedReportHtml();
      const blob = await reportsApi.renderHtmlPdf({ title, html });
      downloadBlobFile(blob, `${exportBaseName}.pdf`);
      toast.success('PDF 报告已开始下载');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExportingTemplate(false);
    }
  };
  const exportReportDocx = async () => {
    setIsExportingTemplate(true);
    try {
      const title = `风险整改复测报告-${retestPlanId}`;
      const html = await buildUnifiedReportHtml();
      const blob = await reportsApi.renderHtmlDocx({ title, html });
      downloadBlobFile(blob, `${exportBaseName}.docx`);
      toast.success('Word 报告已开始下载');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExportingTemplate(false);
    }
  };

  return (
    <Shell>
      <div id="secReportRoot" data-testid="retest-report-root" className="rtr-tst-page space-y-4">
        <div className="rtr-tst-topbar">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to={returnTo}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {report.status === 'archived' ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-800"
              >
                已归档
              </Badge>
            ) : report.status === 'partial' ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                部分关闭
              </Badge>
            ) : (
              <Badge variant="outline">草稿</Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (scanTask?.scanType?.includes('合规')) {
                  void navigate({
                    to: '/scan/compliance-tasks/$taskId',
                    params: { taskId },
                    search: { returnTo },
                  });
                } else {
                  void navigate({ to: '/scan/technical-risks' });
                }
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              查看原检测
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  <Download className="mr-1 h-4 w-4" />
                  {isExportingTemplate ? '导出中…' : '导出'}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>报告模板导出</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => void exportReportPdf()}
                  disabled={isExportingTemplate}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  PDF (.pdf)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void exportReportDocx()}
                  disabled={isExportingTemplate}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Word (.docx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportReportMarkdown}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportReportHtml}>
                  <FileCode2 className="mr-2 h-4 w-4" />
                  HTML (.html)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>原始数据导出</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportReportJson}>
                  <FileJson className="mr-2 h-4 w-4" />
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportReportCsv}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  导出 CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="rtr-tst-hero">
          <p className="rtr-tst-eyebrow">风险整改 · Agent 安全复测</p>
          <h1 className="rtr-tst-title">风险整改复测报告</h1>
          <p className="rtr-tst-desc">
            一次复测任务一份 ·
            采用「总—分—总」结构：先给复测结论，再按风险类型与清单说明依据，最后形成是否关闭与整改处置判断。
          </p>
        </div>

        <section className="rtr-tst-meta">
          <div className="rtr-tst-meta-item">
            <div className="rtr-tst-meta-item-label">Agent 名称</div>
            <div className="rtr-tst-meta-item-value">{report.agentName}</div>
          </div>
          <div className="rtr-tst-meta-item">
            <div className="rtr-tst-meta-item-label">评估任务</div>
            <div className="rtr-tst-meta-item-value">{report.taskName}</div>
          </div>
          <div className="rtr-tst-meta-item">
            <div className="rtr-tst-meta-item-label">复测批次 / 时间</div>
            <div className="rtr-tst-meta-item-value">
              {retestPlanId} · {formatRelativeTime(report.createdAt)}
            </div>
          </div>
          <div className="rtr-tst-meta-item">
            <div className="rtr-tst-meta-item-label">复测人员 / 部门</div>
            <div className="rtr-tst-meta-item-value">{risks[0]?.department || '—'}</div>
          </div>
        </section>

        <section className="rtr-tst-section">
          <div className="rtr-tst-section-head">
            <div>
              <h2 className="rtr-tst-section-title">
                <span className="mark">总</span>
                复测结论
              </h2>
              <p className="rtr-tst-section-note">第一屏只呈现安全人员需要立即判断的结论。</p>
            </div>
          </div>
          <div className="rtr-tst-content">
            <div className="rtr-tst-conclusion-grid">
              <div
                className={cn(
                  'rtr-tst-verdict-card',
                  verdict === 'pass' && 'pass',
                  verdict === 'warn' && 'warn',
                )}
              >
                <div className="flex items-start gap-3">
                  {verdict === 'pass' ? (
                    <CheckCircle2 className="mt-1 h-7 w-7 text-emerald-600" />
                  ) : (
                    <XCircle
                      className={cn(
                        'mt-1 h-7 w-7',
                        verdict === 'warn' ? 'text-amber-600' : 'text-red-600',
                      )}
                    />
                  )}
                  <div>
                    <h3 className="text-lg font-bold">
                      {verdictTitle}
                      <span className="mt-1 block text-sm font-normal text-muted-foreground">
                        {verdictSubtitle}
                      </span>
                    </h3>
                    {warnSummary ? (
                      <p className="mt-2 text-sm text-muted-foreground">{warnSummary}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rtr-tst-stats-card">
                <div className="rtr-tst-stat">
                  <strong>{risks.length}</strong>
                  <span>复测风险总数</span>
                </div>
                <div className="rtr-tst-stat">
                  <strong className="text-red-600">{failedRows.length}</strong>
                  <span>未通过</span>
                </div>
                <div className="rtr-tst-stat">
                  <strong className="text-blue-600">{pendingRows.length}</strong>
                  <span>待确认</span>
                </div>
                <div className="rtr-tst-stat">
                  <strong className="text-emerald-600">{passedRows.length}</strong>
                  <span>已通过</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rtr-tst-section">
          <div className="rtr-tst-section-head">
            <div>
              <h2 className="rtr-tst-section-title">
                <span className="mark">分</span>
                风险项明细
              </h2>
              <p className="rtr-tst-section-note">按风险发现项列出复测结果与处置建议。</p>
            </div>
          </div>
          <div className="rtr-tst-content">
            {risks.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无关联风险项</p>
            ) : (
              <div className="rtr-tst-risk-list">
                {batchOutcomes.map(({ row, outcome }) => {
                  const isPass = outcome === 'passed';
                  const isFail = outcome === 'failed';
                  return (
                    <div
                      key={row.id}
                      className="rtr-tst-risk-item cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setDetailRow(row);
                        setDetailOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') {
                          return;
                        }
                        e.preventDefault();
                        setDetailRow(row);
                        setDetailOpen(true);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.title}</span>
                          <RiskBadge level={row.riskLevel} />
                          <Badge
                            variant="outline"
                            className={DISPLAY_STATUS_CLASS[row.displayStatus]}
                          >
                            {DISPLAY_STATUS_LABEL[row.displayStatus]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.violationNo || row.id} · {row.finding?.category || '—'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          isPass
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : isFail
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-blue-200 bg-blue-50 text-blue-800'
                        }
                      >
                        {isPass ? '通过' : isFail ? '未通过' : '待确认'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <Dialog
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) {
              setDetailRow(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            {detailModel ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    <span>{detailModel.title}</span>
                    <RiskBadge level={detailModel.riskLevel} />
                  </DialogTitle>
                  <DialogDescription>
                    {detailRow
                      ? resolveRetestOutcomeForBatch(detailRow, matchedRetestRun) === 'passed'
                        ? '复测通过'
                        : resolveRetestOutcomeForBatch(detailRow, matchedRetestRun) === 'failed'
                          ? '复测未通过'
                          : '待确认'
                      : '—'}
                    {' · '}执行详情（复测报告 {reportId}）
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <DetailTableSection
                    title="风险概览"
                    rows={[
                      { key: 'library', label: '场景库', value: detailModel.libraryTitle },
                      { key: 'attack', label: '攻击方式', value: detailModel.attackTypeLabel },
                      { key: 'case', label: '用例编号', value: detailModel.caseCode },
                      ...(detailModel.expectedPass
                        ? [
                            {
                              key: 'expected-pass',
                              label: '期望通过行为',
                              value: detailModel.expectedPass,
                            },
                          ]
                        : []),
                      ...(detailModel.expectedFail
                        ? [
                            {
                              key: 'expected-fail',
                              label: '期望拒绝表现',
                              value: detailModel.expectedFail,
                            },
                          ]
                        : []),
                      ...(detailModel.responseTimeMs != null
                        ? [
                            {
                              key: 'duration',
                              label: '执行耗时',
                              value: formatCaseDuration(detailModel.responseTimeMs),
                            },
                          ]
                        : []),
                      ...(detailModel.judgeReason
                        ? [
                            {
                              key: 'judge',
                              label: '判定说明',
                              value: detailModel.judgeReason,
                            },
                          ]
                        : []),
                    ]}
                  />

                  <DetailTableSection
                    title="执行详情"
                    rows={
                      detailModel.isMultiTurn && detailModel.transcriptText
                        ? [
                            {
                              key: 'prompt',
                              label: '多轮攻击脚本',
                              mono: true,
                              value: <DetailPreBlock>{detailModel.prompt || '—'}</DetailPreBlock>,
                            },
                            {
                              key: 'transcript',
                              label: '多轮执行记录',
                              mono: true,
                              value: <DetailPreBlock>{detailModel.transcriptText}</DetailPreBlock>,
                            },
                          ]
                        : [
                            {
                              key: 'prompt',
                              label: '测试输入',
                              mono: true,
                              value: <DetailPreBlock>{detailModel.prompt || '—'}</DetailPreBlock>,
                            },
                            {
                              key: 'response',
                              label: 'Agent 响应',
                              mono: true,
                              value: (
                                <DetailPreBlock>
                                  {formatResponseText(detailModel.responsePreview)}
                                </DetailPreBlock>
                              ),
                            },
                          ]
                    }
                  />
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <section className="rtr-tst-section">
          <div className="rtr-tst-section-head">
            <div>
              <h2 className="rtr-tst-section-title">
                <span className="mark">总</span>
                处置判断
              </h2>
              <p className="rtr-tst-section-note">安全工程师最终关闭或退回整改的操作依据。</p>
            </div>
          </div>
          <div className="rtr-tst-content">
            <ul className="rtr-tst-judgment-list">
              {passedRows.length > 0 ? (
                <li>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {passedRows.length} 项风险复测通过，可确认关闭并归档。
                </li>
              ) : null}
              {failedRows.length > 0 ? (
                <li>
                  <XCircle className="h-4 w-4 text-red-600" />
                  {failedRows.length} 项风险仍未通过，需退回研发重新整改并再次发起复测。
                </li>
              ) : null}
              {pendingRows.length > 0 ? (
                <li>
                  <Loader2 className="h-4 w-4 text-blue-600" />
                  {pendingRows.length} 项待安全工程师确认复测结果。
                </li>
              ) : null}
            </ul>
          </div>
        </section>
      </div>
    </Shell>
  );
}
