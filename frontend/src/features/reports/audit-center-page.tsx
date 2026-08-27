import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { FeaturePageLayout } from '@/components/layout/feature-page-layout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { readComplianceScanStatus } from '@/features/compliance-detection/compliance-task-shared';
import {
  computeDialogueTaskStats,
  resolveBinaryDialogueConclusionLabel,
  resolveDialogueAssessmentSummary,
} from '@/features/detection-scanning/dialogue-task-detail-utils';
import { isPatrolTask } from '@/features/launch-monitoring/patrol-utils';
import {
  buildRetestRunsFromScanTasks,
  collectRetestReports,
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  formatTaskDisplayLabel,
  type RetestReportSummary,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import {
  DEFAULT_REPORT_BRAND_ORGANIZATION,
  normalizeReportBrandConfig,
  REPORT_BRAND_CONFIG_KEY,
} from '@/features/reports/report-brand-config';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityRetestRun } from '@/services/api/detection-scanning';
import { reportsApi } from '@/services/api/reports';
import { systemConfigApi } from '@/services/api/system-config';
import type { Report, SecurityScanFinding, SecurityScanTask } from '@/types/entities';

const DEFAULT_PAGE_SIZE = 20;
const REPORT_CATEGORY_FETCH_LIMIT = 1000;

type AuditCategory = 'security' | 'periodic' | 'compliance' | 'capability' | 'config' | 'manual';
type ReportKind = 'initial' | 'retest';
type ReportKindFilter = 'all' | ReportKind;

const COMPLIANCE_SCAN_TYPE = '合规检测';
const DIALOGUE_SCAN_TYPE = 'agent_api';
const CAPABILITY_AUDIT_SOURCE = 'capability_audit';
const CONFIG_AUDIT_REPORT_TYPES = new Set([
  'dify_config_audit',
  'dify_config_static',
  'coze_config_audit',
  'coze_config_static',
  'fastgpt_config_audit',
  'fastgpt_config_static',
  'n8n_config_audit',
]);
const MANUAL_REPORT_TYPES = new Set(['qna_excel_manual']);

const GOVERNANCE_STEPS = ['资产入库', '检测扫描', '安全放行', '风险闭环', '上线观测', '报告审计'];

type AuditRow = {
  id: string;
  category: AuditCategory;
  reportKind: ReportKind;
  reportNo: string;
  title: string;
  subject: string;
  conclusion: string;
  updatedAt: string;
  taskId?: string;
  reportId?: string;
};

function GovernanceStrip({ active = 5 }: { active?: number }) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
      {GOVERNANCE_STEPS.map((step, index) => (
        <div key={step} className="flex min-w-fit items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs',
              index <= active
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground',
            )}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              'text-xs',
              index === active ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {step}
          </span>
          {index < GOVERNANCE_STEPS.length - 1 ? (
            <span className="text-muted-foreground">›</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function readTaskReportMeta(task: SecurityScanTask) {
  const metadata =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : {};
  const reportNo =
    typeof metadata.complianceReportNo === 'string' ? metadata.complianceReportNo : '';
  const reportStatus =
    typeof metadata.complianceReportStatus === 'string' ? metadata.complianceReportStatus : 'draft';
  const reportId =
    typeof metadata.complianceReportId === 'string' ? metadata.complianceReportId : undefined;
  const domain = typeof metadata.domain === 'string' ? metadata.domain : '通用合规';
  const hasResults = Array.isArray(metadata.complianceExecutionResults)
    ? metadata.complianceExecutionResults.length > 0
    : false;
  return { reportNo, reportStatus, reportId, domain, hasResults };
}

function readTaskMetadataString(task: SecurityScanTask, key: string): string | undefined {
  const value = task.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isPatrolRunTask(task: SecurityScanTask): boolean {
  return (
    task.scanType === '周期巡检批次' ||
    task.source === 'patrol_run' ||
    task.targetKind === 'agent_patrol_run' ||
    Boolean(readTaskMetadataString(task, 'parentPatrolPlanId')) ||
    Boolean(readTaskMetadataString(task, 'patrolRunId'))
  );
}

function hasPatrolExecutionEvidence(task: SecurityScanTask): boolean {
  const metadata = task.metadata ?? {};
  return (
    Boolean(task.startedAt || task.completedAt) ||
    Boolean(readTaskMetadataString(task, 'latestPatrolRunTaskId')) ||
    Boolean(readTaskMetadataString(task, 'patrolRunId')) ||
    Boolean(readTaskMetadataString(task, 'technicalLastExecutedAt')) ||
    Boolean(readTaskMetadataString(task, 'technicalExecutionError')) ||
    (task.highCount ?? 0) + (task.mediumCount ?? 0) + (task.lowCount ?? 0) > 0 ||
    Array.isArray(metadata.patrolRuns)
  );
}

function complianceConclusionLabel(task: SecurityScanTask): string {
  const failCount = (task.highCount ?? 0) + (task.mediumCount ?? 0) + (task.lowCount ?? 0);
  if (readComplianceScanStatus(task) === 'running') {
    return '执行中';
  }
  if (readComplianceScanStatus(task) === 'pending') {
    return '待执行';
  }
  if (failCount === 0) {
    return '建议通过';
  }
  if ((task.highCount ?? 0) === 0 && failCount <= 2) {
    return '附条件通过';
  }
  return '不建议通过';
}

function buildComplianceRows(tasks: SecurityScanTask[]): AuditRow[] {
  return tasks
    .filter((task) => {
      const status = readComplianceScanStatus(task);
      const meta = readTaskReportMeta(task);
      return (
        (status === 'completed' || status === 'reviewing' || status === 'blocked') &&
        (meta.hasResults || Boolean(meta.reportNo))
      );
    })
    .map((task) => {
      const meta = readTaskReportMeta(task);
      return {
        id: task.id,
        category: 'compliance' as const,
        reportKind: 'initial' as const,
        reportNo: meta.reportNo || `TASK-${task.id.slice(0, 8)}`,
        title: task.name,
        subject: task.assetName || task.targetSummary || '—',
        conclusion: complianceConclusionLabel(task),
        updatedAt: task.completedAt || task.updatedAt || task.createdAt,
        taskId: task.id,
        reportId: meta.reportId,
      };
    });
}

function buildPeriodicPatrolRows(
  tasks: SecurityScanTask[],
  findings: SecurityScanFinding[],
): AuditRow[] {
  const findingsByTask = new Map<string, SecurityScanFinding[]>();
  for (const finding of findings) {
    const list = findingsByTask.get(finding.taskId) || [];
    list.push(finding);
    findingsByTask.set(finding.taskId, list);
  }

  const patrolRunTaskIds = new Set(tasks.filter(isPatrolRunTask).map((task) => task.id));

  return tasks
    .filter((task) => {
      const latestPatrolRunTaskId = readTaskMetadataString(task, 'latestPatrolRunTaskId');
      if (
        isPatrolTask(task) &&
        latestPatrolRunTaskId &&
        patrolRunTaskIds.has(latestPatrolRunTaskId)
      ) {
        return false;
      }
      if (!isPatrolTask(task) && !isPatrolRunTask(task)) {
        return false;
      }
      if (task.status === 'pending' || task.status === 'running') {
        return false;
      }
      const taskFindings = findingsByTask.get(task.id) || [];
      const stats = computeDialogueTaskStats(task, taskFindings, task.status);
      const assessment = resolveDialogueAssessmentSummary(task, stats, task.status);
      const hasExecution = Array.isArray(task.metadata?.technicalExecutionResults)
        ? task.metadata.technicalExecutionResults.length > 0
        : false;
      return (
        stats.total > 0 ||
        assessment != null ||
        hasExecution ||
        taskFindings.length > 0 ||
        isPatrolRunTask(task) ||
        hasPatrolExecutionEvidence(task)
      );
    })
    .map((task) => {
      const taskFindings = findingsByTask.get(task.id) || [];
      const stats = computeDialogueTaskStats(task, taskFindings, task.status);
      const parentName = readTaskMetadataString(task, 'parentPatrolPlanName');
      return {
        id: task.id,
        category: 'periodic' as const,
        reportKind: 'initial' as const,
        reportNo: `${isPatrolRunTask(task) ? 'PPR' : 'PP'}-${task.id.slice(0, 8).toUpperCase()}`,
        title: task.name,
        subject: parentName || task.assetName || task.targetSummary || '—',
        conclusion: resolveBinaryDialogueConclusionLabel(task, stats, task.status),
        updatedAt: task.completedAt || task.updatedAt || task.createdAt,
        taskId: task.id,
      };
    });
}

function buildDialogueRows(tasks: SecurityScanTask[], findings: SecurityScanFinding[]): AuditRow[] {
  const findingsByTask = new Map<string, SecurityScanFinding[]>();
  for (const finding of findings) {
    const list = findingsByTask.get(finding.taskId) || [];
    list.push(finding);
    findingsByTask.set(finding.taskId, list);
  }

  return tasks
    .filter((task) => {
      if (
        task.scanType !== DIALOGUE_SCAN_TYPE ||
        task.source === 'risk_retest' ||
        isPatrolTask(task)
      ) {
        return false;
      }
      if (task.status === 'pending' || task.status === 'running') {
        return false;
      }
      const taskFindings = findingsByTask.get(task.id) || [];
      const stats = computeDialogueTaskStats(task, taskFindings, task.status);
      const assessment = resolveDialogueAssessmentSummary(task, stats, task.status);
      return stats.total > 0 || assessment != null;
    })
    .map((task) => {
      const taskFindings = findingsByTask.get(task.id) || [];
      const stats = computeDialogueTaskStats(task, taskFindings, task.status);
      return {
        id: task.id,
        category: 'security' as const,
        reportKind: 'initial' as const,
        reportNo: `DS-${task.id.slice(0, 8).toUpperCase()}`,
        title: task.name,
        subject: task.assetName || task.targetSummary || '—',
        conclusion: resolveBinaryDialogueConclusionLabel(task, stats, task.status),
        updatedAt: task.completedAt || task.updatedAt || task.createdAt,
        taskId: task.id,
      };
    });
}

function retestConclusionLabel(report: RetestReportSummary): string {
  if (report.status === 'partial' && report.passedCount === 0 && report.failedCount === 0) {
    return '待确认';
  }
  if (report.failedCount > 0 && report.passedCount === 0) {
    return '未通过';
  }
  if (report.failedCount > 0 && report.passedCount > 0) {
    return '部分通过';
  }
  if (report.passedCount > 0 && report.failedCount === 0) {
    return '全部通过';
  }
  return '进行中';
}

function categoryForRetestSourceTask(task?: SecurityScanTask): AuditCategory {
  if (!task) {
    return 'security';
  }
  if (task.scanType === COMPLIANCE_SCAN_TYPE) {
    return 'compliance';
  }
  if (isPatrolTask(task) || isPatrolRunTask(task)) {
    return 'periodic';
  }
  if (
    task.source === CAPABILITY_AUDIT_SOURCE ||
    task.scanType === 'SKILLS安全评估' ||
    task.scanType === 'MCP安全评估'
  ) {
    return 'capability';
  }
  return 'security';
}

function buildRetestRows(
  reports: RetestReportSummary[],
  sourceTasksById: Map<string, SecurityScanTask>,
): AuditRow[] {
  return reports.map((report) => ({
    id: report.id,
    category: categoryForRetestSourceTask(sourceTasksById.get(report.taskId)),
    reportKind: 'retest' as const,
    reportNo: report.id,
    title: report.title,
    subject: report.agentName || formatTaskDisplayLabel(report.taskId, report.taskName),
    conclusion: retestConclusionLabel(report),
    updatedAt: report.createdAt,
    taskId: report.taskId,
    reportId: report.id,
  }));
}

function dedupeSecurityScanTasks(tasks: SecurityScanTask[]): SecurityScanTask[] {
  const byId = new Map<string, SecurityScanTask>();
  for (const task of tasks) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}

function dedupeRetestRuns(runs: SecurityRetestRun[]): SecurityRetestRun[] {
  const byId = new Map<string, SecurityRetestRun>();
  for (const run of runs) {
    byId.set(run.retestScanTaskId, run);
  }
  return [...byId.values()];
}

function buildRetestRowsBySourceTask(
  reportsSourceRows: ReturnType<typeof enrichRemediationRows>,
  retestRuns: SecurityRetestRun[],
  sourceTasksById: Map<string, SecurityScanTask>,
): AuditRow[] {
  const rowsByTask = new Map<string, typeof reportsSourceRows>();
  for (const row of reportsSourceRows) {
    const list = rowsByTask.get(row.taskId) ?? [];
    list.push(row);
    rowsByTask.set(row.taskId, list);
  }

  const runsByTask = new Map<string, SecurityRetestRun[]>();
  for (const run of retestRuns) {
    const retestOfTaskId =
      typeof run.metadata.retestOfTaskId === 'string' ? run.metadata.retestOfTaskId : '';
    if (!retestOfTaskId) {
      continue;
    }
    const list = runsByTask.get(retestOfTaskId) ?? [];
    list.push(run);
    runsByTask.set(retestOfTaskId, list);
  }

  const reports = [...rowsByTask.entries()].flatMap(([taskId, rows]) =>
    collectRetestReports(rows, runsByTask.get(taskId) ?? []),
  );
  const uniqueReports = new Map<string, RetestReportSummary>();
  for (const report of reports) {
    uniqueReports.set(report.id, report);
  }
  return buildRetestRows([...uniqueReports.values()], sourceTasksById);
}

function capabilityConclusionLabel(task: SecurityScanTask): string {
  const metadata =
    task.metadata && typeof task.metadata === 'object'
      ? (task.metadata as Record<string, unknown>)
      : {};
  const overallRisk =
    typeof metadata.overallRisk === 'string'
      ? metadata.overallRisk
      : task.highCount > 0
        ? 'high'
        : 'low';
  if (overallRisk === 'critical' || overallRisk === 'high') {
    return '存在高危风险';
  }
  if (overallRisk === 'medium') {
    return '需关注';
  }
  return '风险可控';
}

function buildCapabilityRows(tasks: SecurityScanTask[]): AuditRow[] {
  return tasks
    .filter(
      (task) =>
        task.source === CAPABILITY_AUDIT_SOURCE ||
        task.scanType === 'SKILLS安全评估' ||
        task.scanType === 'MCP安全评估',
    )
    .map((task) => {
      const metadata =
        task.metadata && typeof task.metadata === 'object'
          ? (task.metadata as Record<string, unknown>)
          : {};
      const reportNo =
        typeof metadata.auditReportNo === 'string'
          ? metadata.auditReportNo
          : `CAP-${task.id.slice(0, 8).toUpperCase()}`;
      const reportId = typeof metadata.reportId === 'string' ? metadata.reportId : undefined;
      return {
        id: task.id,
        category: 'capability' as const,
        reportKind: 'initial' as const,
        reportNo,
        title: task.name,
        subject: task.assetName || task.targetSummary || '—',
        conclusion: capabilityConclusionLabel(task),
        updatedAt: task.completedAt || task.updatedAt || task.createdAt,
        taskId: task.id,
        reportId,
      };
    });
}

function riskConclusionLabel(risk: unknown): string {
  const normalized = typeof risk === 'string' ? risk.toLowerCase() : '';
  if (normalized === 'critical' || normalized === 'high') {
    return '存在高危风险';
  }
  if (normalized === 'medium') {
    return '需关注';
  }
  return '风险可控';
}

function reportNoFromReport(report: Report, prefix: string): string {
  const metadata = report.metadata ?? {};
  return typeof metadata.reportNo === 'string' && metadata.reportNo.trim()
    ? metadata.reportNo
    : `${prefix}-${report.id.slice(0, 8).toUpperCase()}`;
}

function decodeMaybeMojibake(value: string): string {
  if (!/[ÃÂÅæçäèéêëìíîïðñòóôõöøùúûüýÿ]/.test(value)) {
    return value;
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff),
    );
    return decoded || value;
  } catch {
    return value;
  }
}

function subjectFromReport(report: Report): string {
  const metadata = report.metadata ?? {};
  const target = metadata.targetDisplayName || metadata.fileName || metadata.sourceFileName;
  return typeof target === 'string' && target.trim() ? decodeMaybeMojibake(target) : '—';
}

function buildConfigReportRows(reports: Report[]): AuditRow[] {
  return reports
    .filter((report) => CONFIG_AUDIT_REPORT_TYPES.has(report.reportType ?? ''))
    .map((report) => ({
      id: report.id,
      category: 'config' as const,
      reportKind: 'initial' as const,
      reportNo: reportNoFromReport(report, 'CFG'),
      title: report.title || '配置审计报告',
      subject: subjectFromReport(report),
      conclusion: riskConclusionLabel(report.metadata?.overallRisk),
      updatedAt: report.createdAt,
      reportId: report.id,
    }));
}

function buildManualReportRows(reports: Report[]): AuditRow[] {
  return reports
    .filter((report) => MANUAL_REPORT_TYPES.has(report.reportType ?? ''))
    .map((report) => ({
      id: report.id,
      category: 'manual' as const,
      reportKind: 'initial' as const,
      reportNo: reportNoFromReport(report, 'MAN'),
      title: report.title ? decodeMaybeMojibake(report.title) : '手动报告',
      subject: subjectFromReport(report),
      conclusion: '已生成',
      updatedAt: report.createdAt,
      reportId: report.id,
    }));
}

function conclusionBadgeClass(label: string): string {
  if (label === '建议通过') {
    return 'border-emerald-200 text-emerald-700';
  }
  if (label === '不建议通过' || label === '未通过') {
    return 'border-red-200 text-red-700';
  }
  if (label === '部分通过' || label === '附条件通过') {
    return 'border-amber-200 text-amber-700';
  }
  if (label === '全部通过') {
    return 'border-emerald-200 text-emerald-700';
  }
  if (label === '待确认' || label === '进行中') {
    return 'border-violet-200 text-violet-700';
  }
  if (label === '风险可控') {
    return 'border-emerald-200 text-emerald-700';
  }
  if (label === '需关注') {
    return 'border-amber-200 text-amber-700';
  }
  if (label === '存在高危风险') {
    return 'border-red-200 text-red-700';
  }
  if (label === '执行中') {
    return 'border-blue-200 text-blue-700';
  }
  if (label === '待执行') {
    return 'border-slate-200 text-slate-600';
  }
  if (label === '已生成') {
    return 'border-blue-200 text-blue-700';
  }
  return 'border-red-200 text-red-700';
}

export function AuditCenterPage({
  initialCategory = 'compliance',
}: {
  initialCategory?: AuditCategory;
} = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [category, setCategoryState] = useState<AuditCategory>(initialCategory);
  const [reportKindFilter, setReportKindFilter] = useState<ReportKindFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<AuditRow | null>(null);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [brandOrganizationInput, setBrandOrganizationInput] = useState(
    DEFAULT_REPORT_BRAND_ORGANIZATION,
  );

  useEffect(() => {
    if (initialCategory && initialCategory !== category) {
      setCategoryState(initialCategory);
    }
    // Sync only when URL-driven initialCategory changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [initialCategory]);

  const setCategory = (next: AuditCategory) => {
    setCategoryState(next);
    setPage(1);
    void navigate({
      to: '/reports/audit-center',
      search: { category: next },
      replace: true,
    });
  };

  const complianceTasksQuery = useQuery({
    queryKey: ['audit-center-compliance-tasks'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: 200,
        scanType: COMPLIANCE_SCAN_TYPE,
        status: 'all',
      }),
  });

  const remediationsQuery = useQuery({
    queryKey: ['audit-center-remediations'],
    queryFn: () => detectionScanningApi.listRemediations({ limit: 200 }),
  });

  const findingsQuery = useQuery({
    queryKey: ['audit-center-findings'],
    queryFn: () => detectionScanningApi.listFindings({ limit: 1000 }),
  });

  const scanTasksQuery = useQuery({
    queryKey: ['audit-center-scan-tasks'],
    queryFn: () => detectionScanningApi.listTasks({ limit: 200 }),
  });

  const periodicPlanTasksQuery = useQuery({
    queryKey: ['audit-center-periodic-plan-tasks'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        scanType: '周期巡检',
        status: 'all',
      }),
  });

  const periodicRunTasksQuery = useQuery({
    queryKey: ['audit-center-periodic-run-tasks'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        scanType: '周期巡检批次',
        status: 'all',
      }),
  });

  const periodicPlanKindTasksQuery = useQuery({
    queryKey: ['audit-center-periodic-plan-kind-tasks'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        targetKind: 'agent_patrol_plan',
        status: 'all',
      }),
  });

  const periodicRunKindTasksQuery = useQuery({
    queryKey: ['audit-center-periodic-run-kind-tasks'],
    queryFn: () =>
      detectionScanningApi.listTasks({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        targetKind: 'agent_patrol_run',
        status: 'all',
      }),
  });

  const reportsQuery = useQuery({
    queryKey: ['audit-center-config-reports'],
    queryFn: () =>
      reportsApi.list({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        offset: 0,
        reportType: [...CONFIG_AUDIT_REPORT_TYPES].join(','),
      }),
  });

  const manualReportsQuery = useQuery({
    queryKey: ['audit-center-manual-reports'],
    queryFn: () =>
      reportsApi.list({
        limit: REPORT_CATEGORY_FETCH_LIMIT,
        offset: 0,
        reportType: [...MANUAL_REPORT_TYPES].join(','),
      }),
  });

  const reportBrandConfigQuery = useQuery({
    queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY],
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

  useEffect(() => {
    if (brandDialogOpen) {
      setBrandOrganizationInput(
        reportBrandConfigQuery.data?.organization || DEFAULT_REPORT_BRAND_ORGANIZATION,
      );
    }
  }, [brandDialogOpen, reportBrandConfigQuery.data?.organization]);

  const complianceRows = useMemo(
    () => buildComplianceRows(complianceTasksQuery.data?.data ?? []),
    [complianceTasksQuery.data],
  );

  const dialogueRows = useMemo(
    () =>
      buildDialogueRows(
        (scanTasksQuery.data?.data ?? []).filter(
          (task) =>
            task.scanType === DIALOGUE_SCAN_TYPE &&
            task.source !== 'risk_retest' &&
            !isPatrolTask(task),
        ),
        findingsQuery.data?.data ?? [],
      ),
    [findingsQuery.data, scanTasksQuery.data],
  );

  const retestSourceRows = useMemo(() => {
    const scanTasks = scanTasksQuery.data?.data ?? [];
    const enrichTasks = scanTasks.filter((task) => task.source !== 'risk_retest');
    return filterClosedLoopProductionRows(
      enrichRemediationRows(
        remediationsQuery.data?.data ?? [],
        findingsQuery.data?.data ?? [],
        enrichTasks,
      ),
    );
  }, [findingsQuery.data, remediationsQuery.data, scanTasksQuery.data]);

  const retestSourceTaskIds = useMemo(
    () => [...new Set(retestSourceRows.map((row) => row.taskId).filter(Boolean))],
    [retestSourceRows],
  );

  const retestRunsQueries = useQueries({
    queries: retestSourceTaskIds.map((taskId) => ({
      queryKey: ['security-retest-runs', taskId],
      queryFn: () => detectionScanningApi.listRetestRuns(taskId),
      staleTime: 30_000,
    })),
  });

  const queriedRetestRuns = useMemo(
    () => retestRunsQueries.flatMap((query) => query.data ?? []),
    [retestRunsQueries],
  );

  const auditRetestRows = useMemo(() => {
    const fallbackRetestRuns = buildRetestRunsFromScanTasks(scanTasksQuery.data?.data ?? []);
    const sourceTasksById = new Map(
      (scanTasksQuery.data?.data ?? []).map((task) => [task.id, task]),
    );
    return buildRetestRowsBySourceTask(
      retestSourceRows,
      dedupeRetestRuns([...queriedRetestRuns, ...fallbackRetestRuns]),
      sourceTasksById,
    );
  }, [queriedRetestRuns, retestSourceRows, scanTasksQuery.data]);

  const periodicTaskRows = useMemo(
    () =>
      dedupeSecurityScanTasks([
        ...(periodicPlanTasksQuery.data?.data ?? []),
        ...(periodicRunTasksQuery.data?.data ?? []),
        ...(periodicPlanKindTasksQuery.data?.data ?? []),
        ...(periodicRunKindTasksQuery.data?.data ?? []),
        ...(scanTasksQuery.data?.data ?? []).filter(
          (task) => isPatrolTask(task) || isPatrolRunTask(task),
        ),
      ]),
    [
      periodicPlanKindTasksQuery.data,
      periodicPlanTasksQuery.data,
      periodicRunKindTasksQuery.data,
      periodicRunTasksQuery.data,
      scanTasksQuery.data,
    ],
  );

  const periodicRows = useMemo(
    () => buildPeriodicPatrolRows(periodicTaskRows, findingsQuery.data?.data ?? []),
    [findingsQuery.data, periodicTaskRows],
  );

  const capabilityRows = useMemo(
    () => buildCapabilityRows(scanTasksQuery.data?.data ?? []),
    [scanTasksQuery.data],
  );

  const configRows = useMemo(
    () => buildConfigReportRows(reportsQuery.data?.data ?? []),
    [reportsQuery.data],
  );

  const manualRows = useMemo(
    () => buildManualReportRows(manualReportsQuery.data?.data ?? []),
    [manualReportsQuery.data],
  );

  const rowsByCategory = useMemo(
    () => ({
      security: [...dialogueRows, ...auditRetestRows.filter((row) => row.category === 'security')],
      periodic: [...periodicRows, ...auditRetestRows.filter((row) => row.category === 'periodic')],
      compliance: [
        ...complianceRows,
        ...auditRetestRows.filter((row) => row.category === 'compliance'),
      ],
      capability: [
        ...capabilityRows,
        ...auditRetestRows.filter((row) => row.category === 'capability'),
      ],
      config: configRows,
      manual: manualRows,
    }),
    [
      auditRetestRows,
      capabilityRows,
      complianceRows,
      configRows,
      dialogueRows,
      manualRows,
      periodicRows,
    ],
  );

  const categoryCounts = useMemo(
    () => ({
      security: rowsByCategory.security.length,
      periodic: rowsByCategory.periodic.length,
      compliance: rowsByCategory.compliance.length,
      capability: rowsByCategory.capability.length,
      config: rowsByCategory.config.length,
      manual: rowsByCategory.manual.length,
    }),
    [
      rowsByCategory.capability.length,
      rowsByCategory.compliance.length,
      rowsByCategory.config.length,
      rowsByCategory.manual.length,
      rowsByCategory.periodic.length,
      rowsByCategory.security.length,
    ],
  );

  const reportKindCounts = useMemo(() => {
    const rows = rowsByCategory[category];
    return {
      all: rows.length,
      initial: rows.filter((row) => row.reportKind === 'initial').length,
      retest: rows.filter((row) => row.reportKind === 'retest').length,
    };
  }, [category, rowsByCategory]);

  const activeRows = useMemo(() => {
    const source = rowsByCategory[category] ?? [];
    const kindFiltered =
      reportKindFilter === 'all'
        ? source
        : source.filter((row) => row.reportKind === reportKindFilter);
    const normalized = keyword.trim().toLowerCase();
    const filtered = normalized
      ? kindFiltered.filter((row) =>
          [row.reportNo, row.title, row.subject, row.conclusion]
            .join(' ')
            .toLowerCase()
            .includes(normalized),
        )
      : kindFiltered;
    const sorted = [...filtered].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });
    return sorted;
  }, [category, keyword, reportKindFilter, rowsByCategory, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [category, keyword, reportKindFilter, sortDir]);

  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize) || 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => activeRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [activeRows, currentPage, pageSize],
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const retestRunsLoading = retestRunsQueries.some((query) => query.isLoading);
  const retestRowsLoading =
    remediationsQuery.isLoading ||
    findingsQuery.isLoading ||
    scanTasksQuery.isLoading ||
    retestRunsLoading;
  const periodicTasksLoading =
    periodicPlanTasksQuery.isLoading ||
    periodicRunTasksQuery.isLoading ||
    periodicPlanKindTasksQuery.isLoading ||
    periodicRunKindTasksQuery.isLoading;

  const isLoading =
    category === 'compliance'
      ? complianceTasksQuery.isLoading || retestRowsLoading
      : category === 'security' || category === 'periodic'
        ? scanTasksQuery.isLoading ||
          findingsQuery.isLoading ||
          retestRowsLoading ||
          (category === 'periodic' && periodicTasksLoading)
        : category === 'capability'
          ? scanTasksQuery.isLoading || retestRowsLoading
          : category === 'config' || category === 'manual'
            ? category === 'config'
              ? reportsQuery.isLoading
              : manualReportsQuery.isLoading
            : false;

  const deleteMutation = useMutation({
    mutationFn: async (row: AuditRow) => {
      if (row.category === 'config' || row.category === 'manual') {
        if (!row.reportId) {
          throw new Error('缺少报告 ID，无法删除');
        }
        await reportsApi.delete(row.reportId);
        return;
      }
      // Dialogue / patrol / compliance / capability rows are task-backed.
      if (row.taskId) {
        if (row.reportId && (row.category === 'capability' || row.category === 'compliance')) {
          try {
            await reportsApi.delete(row.reportId);
          } catch {
            // Task delete still removes the list entry; report may already be gone.
          }
        }
        await detectionScanningApi.deleteTask(row.taskId);
        return;
      }
      if (row.reportId) {
        await reportsApi.delete(row.reportId);
        return;
      }
      throw new Error('该条目不支持删除');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-center-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-config-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-manual-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-scan-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-compliance-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-remediations'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-findings'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-periodic-plan-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-periodic-run-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-periodic-plan-kind-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-center-periodic-run-kind-tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      setDeleteTarget(null);
      toast.success('已删除');
    },
    onError: (error: Error) => {
      toast.error(error.message || '删除失败');
    },
  });

  const saveBrandMutation = useMutation({
    mutationFn: async () => {
      const next = normalizeReportBrandConfig({ organization: brandOrganizationInput });
      await systemConfigApi.updateByKey(REPORT_BRAND_CONFIG_KEY, {
        value: next,
        description: '报告封面、页眉与页脚使用的出具机构信息',
        editable: true,
        requiresRestart: false,
      });
      return next;
    },
    onSuccess: async (next) => {
      toast.success('报告设置已保存');
      setBrandDialogOpen(false);
      setBrandOrganizationInput(next.organization);
      await queryClient.invalidateQueries({
        queryKey: ['system-config-key', REPORT_BRAND_CONFIG_KEY],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || '报告设置保存失败');
    },
  });

  const handleView = (row: AuditRow) => {
    if (row.reportKind === 'retest' && row.reportId && row.taskId) {
      void navigate({
        to: '/scan/retest-reports/$reportId',
        params: { reportId: row.reportId },
        search: { taskId: row.taskId, returnTo: '/reports/audit-center' },
      });
      return;
    }
    if (row.category === 'compliance' && row.taskId) {
      void navigate({
        to: '/scan/compliance-tasks/$taskId',
        params: { taskId: row.taskId },
        search: { panel: 'full', returnTo: '/reports/audit-center' },
      });
      return;
    }
    if ((row.category === 'security' || row.category === 'periodic') && row.taskId) {
      void navigate({
        to: '/reports/audit-center/$taskId',
        params: { taskId: row.taskId },
        search: { category: row.category },
      });
      return;
    }
    if (row.category === 'capability') {
      if (row.reportId) {
        void navigate({
          to: '/reports/$reportId',
          params: { reportId: row.reportId },
          search: { fromCategory: 'capability' },
        });
        return;
      }
      if (row.taskId) {
        void navigate({
          to: '/scan/remediation',
          search: { tab: 'workbench', taskId: row.taskId, riskId: undefined },
        });
      }
      return;
    }
    if ((row.category === 'config' || row.category === 'manual') && row.reportId) {
      void navigate({
        to: '/reports/$reportId',
        params: { reportId: row.reportId },
        search: { fromCategory: row.category },
      });
    }
  };

  const tabs: Array<{ id: AuditCategory; label: string; count: number }> = [
    { id: 'security', label: '对话安全评估', count: categoryCounts.security },
    { id: 'periodic', label: '周期巡检', count: categoryCounts.periodic },
    { id: 'compliance', label: '合规', count: categoryCounts.compliance },
    { id: 'capability', label: '能力组件评估', count: categoryCounts.capability },
    { id: 'config', label: '配置审计', count: categoryCounts.config },
    { id: 'manual', label: '手动报告', count: categoryCounts.manual },
  ];

  const reportKindFilters: Array<{ id: ReportKindFilter; label: string; count: number }> = [
    { id: 'all', label: '全部', count: reportKindCounts.all },
    { id: 'initial', label: '初评', count: reportKindCounts.initial },
    { id: 'retest', label: '复测', count: reportKindCounts.retest },
  ];

  return (
    <FeaturePageLayout>
      <div className="grid gap-6">
        <GovernanceStrip active={5} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">报告与审计中心</h1>
            <p className="max-w-4xl text-sm text-muted-foreground">
              闭环第⑤步 · 评估 / 准入 / 复测 / 合规各环节报告在此统一归集 ·
              点报告「查看」直达原始评估详情 · 审批归档后供管理层与审计追溯
            </p>
          </div>
          <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                报告设置
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>报告设置</DialogTitle>
                <DialogDescription>
                  配置导出报告封面、页眉和页脚中的出具机构信息。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="audit-report-brand-org">
                    出具机构
                  </label>
                  <Input
                    id="audit-report-brand-org"
                    value={brandOrganizationInput}
                    maxLength={140}
                    onChange={(event) => setBrandOrganizationInput(event.target.value)}
                    placeholder={DEFAULT_REPORT_BRAND_ORGANIZATION}
                  />
                  <p className="text-xs text-muted-foreground">
                    默认值：{DEFAULT_REPORT_BRAND_ORGANIZATION}
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBrandOrganizationInput(DEFAULT_REPORT_BRAND_ORGANIZATION)}
                    disabled={saveBrandMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    使用默认值
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveBrandMutation.mutate()}
                    disabled={saveBrandMutation.isPending}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saveBrandMutation.isPending ? '保存中…' : '保存'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={category === tab.id ? 'default' : 'outline'}
              onClick={() => setCategory(tab.id)}
            >
              {tab.label}
              {tab.count > 0 ? (
                <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0 text-[11px]">
                  {tab.count}
                </Badge>
              ) : null}
            </Button>
          ))}
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {tabs.find((tab) => tab.id === category)?.label}报告
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1">
                {reportKindFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
                      reportKindFilter === filter.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setReportKindFilter(filter.id)}
                  >
                    {filter.label}
                    {filter.count > 0 ? (
                      <span className="rounded-full bg-muted-foreground/10 px-1.5 text-[10px]">
                        {filter.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <Input
                className="max-w-xs"
                placeholder="搜索报告名称 / 对象"
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载报告中…
            </div>
          ) : activeRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              暂无匹配报告
              {category === 'compliance' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/scan/compliance-tasks">前往合规检测任务</Link>
                  </Button>
                </div>
              ) : category === 'security' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/scan/technical-risks">前往对话安全评估</Link>
                  </Button>
                </div>
              ) : category === 'periodic' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/launch-monitoring">前往上线观测与周期巡检</Link>
                  </Button>
                </div>
              ) : category === 'capability' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/capability-audit" search={{ view: 'overview' }}>
                      前往能力组件安全评估
                    </Link>
                  </Button>
                </div>
              ) : category === 'config' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link
                      to="/expert-toolbox/platform-config-audit"
                      search={{ platform: 'dify', view: 'run' }}
                    >
                      前往配置审计
                    </Link>
                  </Button>
                </div>
              ) : category === 'manual' ? (
                <div className="mt-3">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to="/reports/qna-excel">前往手动报告生成</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>报告名称</TableHead>
                    <TableHead>评估对象</TableHead>
                    <TableHead>结论</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                      >
                        更新时间
                        {sortDir === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : sortDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-end">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((row) => {
                    const canDelete =
                      row.reportKind !== 'retest' && Boolean(row.reportId || row.taskId);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate">{row.title}</span>
                            {row.reportKind === 'retest' ? (
                              <Badge
                                variant="secondary"
                                className="rounded-full px-2 py-0 text-[11px]"
                              >
                                复测
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs font-normal text-muted-foreground">
                            {row.reportNo}
                          </div>
                        </TableCell>
                        <TableCell>{row.subject}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={conclusionBadgeClass(row.conclusion)}>
                            {row.conclusion}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : '—'}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end">
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${row.title}操作`}
                                  disabled={deleteMutation.isPending}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel>操作</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleView(row)}>
                                  <Eye className="h-4 w-4" />
                                  查看
                                </DropdownMenuItem>
                                {canDelete ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteTarget(row)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="border-t px-4 py-3">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  total={activeRows.length}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  itemLabels={{ singular: '条报告', plural: '条报告' }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除「{deleteTarget?.title}」
              {deleteTarget?.category === 'config' || deleteTarget?.category === 'manual'
                ? '报告记录'
                : '及相关任务记录'}
              。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                }
              }}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeaturePageLayout>
  );
}
