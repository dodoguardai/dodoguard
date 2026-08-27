import { useMemo, useState } from 'react';

import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { RuleHitsLocationPanel } from '@/components/rule-hits-location';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pickLatestApiRoundPreviewForVulnerability } from '@/features/tasks/run-log-table-message';
import { formatTestingModeLabel } from '@/features/tasks/testing-mode-label';
import { agentsApi } from '@/services/api/agents';
import { cozeConfigAuditApi } from '@/services/api/coze-config-audit';
import { difyConfigAuditApi } from '@/services/api/dify-config-audit';
import { fastgptConfigAuditApi } from '@/services/api/fastgpt-config-audit';
import { organizationsApi } from '@/services/api/organizations';
import { reportsApi } from '@/services/api/reports';
import { tasksApi } from '@/services/api/tasks';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import { parseCozePreview } from '@/util/cozeResponsePreview';
import { getReportContentRender } from './report-content-renderers';
import { ReportMarkdownView } from './report-markdown-view';
import {
  ConfigAuditConclusionBand,
  ConfigAuditMetricTiles,
  ConfigAuditRiskPill,
  configAuditConclusion,
  configAuditKindLabelZh,
  configAuditReportTitleZh,
  riskLevelZh,
} from './config-audit-report-chrome';
import {
  ConfigAuditResultView,
  type ConfigAuditPlatform,
} from './config-audit-result-view';
import { cn } from '@/lib/utils';
import type { DifyConfigAuditData } from '@/services/api/dify-config-audit';
import type { AttackResult, FindingDetectionRuleResult, Report } from '@/types/entities';

function reportTypeToConfigPlatform(
  reportType: string | undefined,
): ConfigAuditPlatform | null {
  switch (reportType) {
    case 'dify_config_audit':
    case 'dify_config_static':
      return 'dify';
    case 'coze_config_audit':
    case 'coze_config_static':
      return 'coze';
    case 'fastgpt_config_audit':
    case 'fastgpt_config_static':
      return 'fastgpt';
    case 'n8n_config_audit':
      return 'n8n';
    default:
      return null;
  }
}
function formatResultPayload(value: unknown): string {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Strips common model "thinking" wrappers from displayed attack result text so the dialog stays readable. */
function stripModelMetaFromDisplayText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const findingDetailPreClass =
  'max-h-[min(40vh,18rem)] rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

const UNLINKED_VULNERABILITY_BUCKET = '__unlinked_vulnerability__';

function looksLikeCozeMessagesJson(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith('{') || !t.includes('"messages"')) {
    return false;
  }
  return t.includes('"conversation_id"') || (t.includes('"code"') && t.includes('"msg"'));
}

function isTrivialAgentOutputDisplay(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === '' || t === 'success' || t === 'ok' || t === '—' || t === '-' || t === '"success"';
}

/** Normalize one `response` field (string or object); extract Coze assistant text when JSON holds `messages`. */
function normalizeAttackResponseField(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) {
      return '';
    }
    if (t.startsWith('{') && t.includes('"messages"')) {
      return parseCozePreview(t).trim();
    }
    if (looksLikeCozeMessagesJson(t)) {
      return parseCozePreview(t).trim();
    }
    return t;
  }
  if (typeof value === 'object') {
    try {
      const s = JSON.stringify(value);
      if (s.includes('"messages"')) {
        return parseCozePreview(s).trim();
      }
      return s;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Bot / API body for the finding dialog "Response" block: skip trivial `success`, walk preview/full/output/text/content,
 * parse Coze v2 JSON — do not use `summary` here (that belongs in Reasoning / verdict copy).
 */
function resolveAttackResultResponseBodyForDisplay(
  res: Record<string, unknown> | undefined,
): string {
  if (!res) {
    return '—';
  }
  const keys = ['preview', 'full', 'output', 'text', 'content'] as const;
  for (const k of keys) {
    const text = normalizeAttackResponseField(res[k]);
    if (text && !isTrivialAgentOutputDisplay(text)) {
      return stripModelMetaFromDisplayText(text);
    }
  }
  const dumped = formatResultPayload(res).trim();
  if (dumped.startsWith('{') && dumped.includes('"messages"')) {
    const parsed = parseCozePreview(dumped).trim();
    if (parsed && !isTrivialAgentOutputDisplay(parsed)) {
      return stripModelMetaFromDisplayText(parsed);
    }
  }
  if (res.error != null) {
    const e = String(res.error).trim();
    if (e) {
      const errBody =
        e.startsWith('{') && e.includes('"messages"') ? parseCozePreview(e).trim() : e;
      return stripModelMetaFromDisplayText(`ERROR: ${errBody}`);
    }
  }
  // Persisted row often has only { preview: "success", durationMs } — no assistant text; avoid
  // showing that JSON so callers can fall back to task runLogs / another attack_result.
  if (dumped.startsWith('{') && !dumped.includes('"messages"')) {
    try {
      const o = JSON.parse(dumped) as Record<string, unknown>;
      const prevStr =
        typeof o.preview === 'string' ? o.preview : o.preview != null ? String(o.preview) : '';
      const hasRichField = ['full', 'output', 'text', 'content'].some((k) =>
        normalizeAttackResponseField(o[k]),
      );
      if (!hasRichField && (!prevStr || isTrivialAgentOutputDisplay(prevStr))) {
        return '—';
      }
    } catch {
      /* keep dumped */
    }
  }
  return stripModelMetaFromDisplayText(dumped || '—');
}

function requestUrlFromAttackResult(r: AttackResult): string {
  const req = r.request as Record<string, unknown> | undefined;
  if (req && typeof req === 'object' && 'url' in req) {
    return String((req as { url?: unknown }).url ?? '');
  }
  return '';
}

function isStaticConfigYamlAttackResult(r: AttackResult): boolean {
  const url = requestUrlFromAttackResult(r);
  return url === 'static://config-yaml' || url === 'static://config-json';
}

function filterAttackResultsByKind(
  results: AttackResult[],
  kind: 'api_runtime' | 'config_yaml_static',
): AttackResult[] {
  return results.filter((r) =>
    kind === 'config_yaml_static'
      ? isStaticConfigYamlAttackResult(r)
      : !isStaticConfigYamlAttackResult(r),
  );
}

/** Same semantics as backend report templates (`finalVerdict.vulnerable`). */
function isFinalVerdictVulnerable(verdict: AttackResult['finalVerdict'] | undefined): boolean {
  if (verdict == null || typeof verdict !== 'object') {
    return false;
  }
  const v = (verdict as { vulnerable?: unknown }).vulnerable;
  return v === true || String(v).toLowerCase() === 'true';
}

function resolveAttackResultForPreview(
  preview: Record<string, unknown>,
  results: AttackResult[],
): { result: AttackResult | null; matched: boolean } {
  const vulnId = preview.vulnerabilityId as string | undefined;
  const idx = typeof preview.index === 'number' ? preview.index - 1 : -1;
  if (idx >= 0 && idx < results.length) {
    const r = results[idx];
    if (!vulnId || r.vulnerabilityId === vulnId) {
      return { result: r, matched: true };
    }
  }
  const resultId = preview.resultId as string | undefined;
  if (resultId) {
    const hit = results.find((x) => {
      if (x.id === resultId) {
        return true;
      }
      const req = x.request as Record<string, unknown> | undefined;
      return typeof req?.findingRecordId === 'string' && req.findingRecordId === resultId;
    });
    if (hit && (!vulnId || hit.vulnerabilityId === vulnId)) {
      return { result: hit, matched: true };
    }
  }
  if (idx >= 0 && idx < results.length) {
    return { result: results[idx], matched: false };
  }
  return { result: null, matched: false };
}

/**
 * Pass rate per vulnerability: one logical test per attack command (same commandId).
 * Conversation mode may persist many rows per command; we collapse to one outcome:
 * the command fails if any row has vulnerable === true, otherwise it passes.
 * This matches "3 test commands, 1 finding → ~66.7% pass" instead of counting each round.
 */
function aggregatePassRateByVulnerability(
  results: AttackResult[],
  vulnNameById: Map<string, string>,
): Array<{ vulnerabilityId: string; total: number; passed: number }> {
  const byVuln = new Map<string, Map<string, boolean>>();

  for (const r of results) {
    const rawVid = r.vulnerabilityId;
    const vid =
      rawVid != null && String(rawVid).trim() !== ''
        ? String(rawVid).trim()
        : UNLINKED_VULNERABILITY_BUCKET;
    const cmdKey =
      r.commandId != null && String(r.commandId).trim() !== ''
        ? String(r.commandId)
        : `result:${r.id}`;
    const anyVulnSoFar = byVuln.get(vid)?.get(cmdKey) ?? false;
    const thisVuln = isFinalVerdictVulnerable(r.finalVerdict);
    if (!byVuln.has(vid)) {
      byVuln.set(vid, new Map());
    }
    byVuln.get(vid)!.set(cmdKey, anyVulnSoFar || thisVuln);
  }

  const map = new Map<string, { total: number; passed: number }>();
  for (const [vid, cmdMap] of byVuln) {
    let total = 0;
    let passed = 0;
    for (const anyFailed of cmdMap.values()) {
      total += 1;
      if (!anyFailed) {
        passed += 1;
      }
    }
    map.set(vid, { total, passed });
  }

  const rows = [...map.entries()].map(([vulnerabilityId, { total, passed }]) => ({
    vulnerabilityId,
    total,
    passed,
  }));
  rows.sort((a, b) => {
    const unk = UNLINKED_VULNERABILITY_BUCKET;
    if (a.vulnerabilityId === unk && b.vulnerabilityId !== unk) {
      return 1;
    }
    if (b.vulnerabilityId === unk && a.vulnerabilityId !== unk) {
      return -1;
    }
    const na = vulnNameById.get(a.vulnerabilityId) ?? a.vulnerabilityId;
    const nb = vulnNameById.get(b.vulnerabilityId) ?? b.vulnerabilityId;
    return na.localeCompare(nb);
  });
  return rows;
}

function VulnerabilityPassDonut({
  displayName,
  total,
  passed,
}: {
  displayName: string;
  total: number;
  passed: number;
}) {
  const pctTenths = total > 0 ? Math.floor((passed / total) * 1000) / 10 : 0;
  const pctLabel =
    total === 0
      ? '0'
      : pctTenths === 100 || pctTenths === 0
        ? String(Math.round(pctTenths))
        : pctTenths.toFixed(1);
  const data = [
    { name: 'Safe', value: passed },
    { name: 'Vulnerable', value: Math.max(0, total - passed) },
  ];
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="line-clamp-2 min-h-10 w-full text-center text-xs font-medium leading-tight"
        title={displayName}
      >
        {displayName}
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={1}
              strokeWidth={0}
              label={false}
              labelLine={false}
            >
              <Cell fill="var(--chart-2)" />
              <Cell fill="var(--destructive)" />
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                typeof value === 'number' ? value : Number(value ?? 0),
                String(name ?? ''),
              ]}
              contentStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{pctLabel}%</span>
        <span className="mx-1">·</span>
        <span>
          {passed}/{total}
        </span>
      </div>
    </div>
  );
}

/** Risk Summary：从单条 `response` 取 `durationMs`（顶层或 `full`）。 */
function responseDurationMsFromResult(response: unknown): number {
  if (!response || typeof response !== 'object') {
    return 0;
  }
  const res = response as Record<string, unknown>;
  const top = res.durationMs;
  if (typeof top === 'number' && Number.isFinite(top) && top >= 0) {
    return top;
  }
  const full = res.full;
  if (full && typeof full === 'object') {
    const n = (full as Record<string, unknown>).durationMs;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return 0;
}

/** Risk Summary：将毫秒耗时格式化为分钟（最多两位小数）。 */
function formatExecutionTimeMinutes(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '—';
  }
  const minutes = ms / 60_000;
  const rounded = Math.round(minutes * 100) / 100;
  return `${rounded} min`;
}

interface ReportDetailProps {
  reportId: string;
  fromCategory?: 'security' | 'periodic' | 'compliance' | 'capability' | 'config' | 'manual';
}

function auditCenterCategoryForReportType(
  reportType?: string,
): ReportDetailProps['fromCategory'] | undefined {
  if (!reportType) {
    return undefined;
  }
  if (reportType === 'skills_md_audit' || reportType === 'mcp_source_audit') {
    return 'capability';
  }
  if (
    reportType === 'dify_config_audit' ||
    reportType === 'dify_config_static' ||
    reportType === 'coze_config_audit' ||
    reportType === 'coze_config_static' ||
    reportType === 'fastgpt_config_audit' ||
    reportType === 'fastgpt_config_static' ||
    reportType === 'n8n_config_audit'
  ) {
    return 'config';
  }
  if (reportType === 'qna_excel' || reportType === 'qna_excel_manual' || reportType === 'manual') {
    return 'manual';
  }
  if (reportType === 'compliance_assessment') {
    return 'compliance';
  }
  return undefined;
}

export function ReportDetail({ reportId, fromCategory }: ReportDetailProps) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [findingDetailOpen, setFindingDetailOpen] = useState(false);
  const [selectedFindingPreview, setSelectedFindingPreview] = useState<Record<
    string,
    unknown
  > | null>(null);

  const goBackToReportList = (reportType?: string) => {
    const category = fromCategory || auditCenterCategoryForReportType(reportType);
    void navigate({
      to: '/reports/audit-center',
      search: category ? { category } : {},
    });
  };

  const {
    data: report,
    isLoading,
    error,
  } = useQuery<Report>({
    queryKey: ['report', reportId],
    queryFn: () => reportsApi.get(reportId),
  });

  const reportTypeEarly = (report as Report | undefined)?.reportType as string | undefined;
  const isAuditReportEarly =
    reportTypeEarly === 'dify_config_audit' ||
    reportTypeEarly === 'dify_config_static' ||
    reportTypeEarly === 'skills_md_audit' ||
    reportTypeEarly === 'mcp_source_audit' ||
    reportTypeEarly === 'coze_config_audit' ||
    reportTypeEarly === 'coze_config_static' ||
    reportTypeEarly === 'fastgpt_config_audit' ||
    reportTypeEarly === 'fastgpt_config_static' ||
    reportTypeEarly === 'n8n_config_audit';
  const isConfigGrayBoxTaskReportEarly =
    reportTypeEarly === 'dify_config_audit' ||
    reportTypeEarly === 'dify_config_static' ||
    reportTypeEarly === 'coze_config_audit' ||
    reportTypeEarly === 'coze_config_static' ||
    reportTypeEarly === 'fastgpt_config_audit' ||
    reportTypeEarly === 'fastgpt_config_static';
  /** Config gray-box / static tasks (Dify or Coze) need task + results for overview cards and donuts. */
  const enableTaskLinkedReportQueries = Boolean(
    report?.taskId && (!isAuditReportEarly || isConfigGrayBoxTaskReportEarly),
  );

  const { data: organization, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organization', report?.organizationId],
    queryFn: () => organizationsApi.get(report!.organizationId),
    enabled: Boolean(report?.organizationId),
  });

  const { data: sourceTask, isLoading: isTaskLoading } = useQuery({
    queryKey: ['attack-tasks', report?.taskId, 'report-detail'],
    queryFn: () => tasksApi.get(report!.taskId!),
    enabled: enableTaskLinkedReportQueries,
  });

  const agentIdForReport =
    sourceTask?.targetType === 'agent' &&
    sourceTask.targetConfig &&
    typeof (sourceTask.targetConfig as { agentId?: unknown }).agentId === 'string'
      ? (sourceTask.targetConfig as { agentId: string }).agentId
      : undefined;

  const { data: targetAgent, isLoading: isAgentLoading } = useQuery({
    queryKey: ['target-agents', agentIdForReport],
    queryFn: () => agentsApi.get(agentIdForReport!),
    enabled: Boolean(agentIdForReport),
  });

  const { data: vulnsListResponse } = useQuery({
    queryKey: ['vulnerabilities', 'for-report-findings'],
    queryFn: () => vulnerabilitiesApi.list({ limit: 1000 }),
    enabled: enableTaskLinkedReportQueries,
  });

  const vulnNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vulnsListResponse?.data ?? []) {
      map.set(v.id, v.name);
    }
    return map;
  }, [vulnsListResponse]);

  const vulnDescById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vulnsListResponse?.data ?? []) {
      if (v.description) {
        map.set(v.id, v.description);
      }
    }
    return map;
  }, [vulnsListResponse]);

  const vulnListIdSet = useMemo(() => {
    return new Set((vulnsListResponse?.data ?? []).map((v) => v.id));
  }, [vulnsListResponse?.data]);

  /** Task-selected vulns not present in the paginated list (limit 1000) need a per-id fetch for labels. */
  const missingVulnIdsForTask = useMemo(() => {
    const ids = sourceTask?.vulnerabilities ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      const id = typeof raw === 'string' ? raw.trim() : '';
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (!vulnListIdSet.has(id)) {
        out.push(id);
      }
    }
    return out;
  }, [sourceTask?.vulnerabilities, vulnListIdSet]);

  const extraVulnQueries = useQueries({
    queries: missingVulnIdsForTask.map((id) => ({
      queryKey: ['vulnerabilities', id, 'report-detail-name'],
      queryFn: () => vulnerabilitiesApi.get(id),
      enabled: Boolean(enableTaskLinkedReportQueries && id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const extraVulnQueriesSignature = extraVulnQueries
    .map((q) => `${q.status}:${q.data?.id ?? ''}:${q.data?.name ?? ''}`)
    .join('|');

  const effectiveVulnNameById = useMemo(() => {
    const m = new Map(vulnNameById);
    for (let i = 0; i < missingVulnIdsForTask.length; i++) {
      const id = missingVulnIdsForTask[i];
      const name = extraVulnQueries[i]?.data?.name;
      if (typeof name === 'string' && name.trim()) {
        m.set(id, name.trim());
      }
    }
    return m;
  }, [vulnNameById, missingVulnIdsForTask, extraVulnQueriesSignature]);

  const effectiveVulnDescById = useMemo(() => {
    const m = new Map(vulnDescById);
    for (let i = 0; i < missingVulnIdsForTask.length; i++) {
      const id = missingVulnIdsForTask[i];
      const desc = extraVulnQueries[i]?.data?.description;
      if (typeof desc === 'string' && desc.trim()) {
        m.set(id, desc.trim());
      }
    }
    return m;
  }, [vulnDescById, missingVulnIdsForTask, extraVulnQueriesSignature]);

  const { data: taskResultsPayload, isLoading: isTaskResultsLoading } = useQuery({
    queryKey: ['attack-tasks', report?.taskId, 'results'],
    queryFn: () => tasksApi.getResults(report!.taskId!),
    enabled: enableTaskLinkedReportQueries,
    staleTime: 60_000,
  });

  const reportConfigAuditYaml = useMemo(() => {
    const m = sourceTask?.metadata as
      | { configAudit?: { yaml?: string; json?: string } }
      | undefined;
    const isFastgpt =
      reportTypeEarly === 'fastgpt_config_audit' ||
      reportTypeEarly === 'fastgpt_config_static' ||
      String(sourceTask?.platformFamily ?? '').toLowerCase() === 'fastgpt';
    return String(isFastgpt ? m?.configAudit?.json || '' : m?.configAudit?.yaml || '').trim();
  }, [reportTypeEarly, sourceTask?.metadata, sourceTask?.platformFamily]);

  const reportResultsHaveRuleHits = useMemo(() => {
    for (const r of taskResultsPayload?.results ?? []) {
      const det = r.detectionResults as { ruleHits?: unknown[] } | undefined;
      if (Array.isArray(det?.ruleHits) && det.ruleHits.length > 0) {
        return true;
      }
    }
    return false;
  }, [taskResultsPayload?.results]);

  const configStructureApiKind = useMemo((): 'coze' | 'fastgpt' | 'dify' => {
    const rt = reportTypeEarly;
    if (rt === 'coze_config_audit' || rt === 'coze_config_static') {
      return 'coze';
    }
    if (rt === 'fastgpt_config_audit' || rt === 'fastgpt_config_static') {
      return 'fastgpt';
    }
    const pf = String(sourceTask?.platformFamily ?? '').toLowerCase();
    if (rt === 'dify_config_audit' || rt === 'dify_config_static') {
      if (pf === 'coze') {
        return 'coze';
      }
      if (pf === 'fastgpt') {
        return 'fastgpt';
      }
    }
    return 'dify';
  }, [reportTypeEarly, sourceTask?.platformFamily]);

  const { data: reportDslStructure } = useQuery({
    queryKey: [
      configStructureApiKind === 'coze'
        ? 'coze-structure'
        : configStructureApiKind === 'fastgpt'
          ? 'fastgpt-structure'
          : 'dify-structure',
      'report-detail',
      report?.taskId,
      reportConfigAuditYaml.length,
    ],
    queryFn: () =>
      configStructureApiKind === 'coze'
        ? cozeConfigAuditApi.structure({ yaml: reportConfigAuditYaml })
        : configStructureApiKind === 'fastgpt'
          ? fastgptConfigAuditApi.structure({ json: reportConfigAuditYaml })
          : difyConfigAuditApi.structure({ yaml: reportConfigAuditYaml }),
    enabled:
      Boolean(enableTaskLinkedReportQueries && report?.taskId) &&
      reportConfigAuditYaml.length > 60 &&
      reportResultsHaveRuleHits,
    staleTime: 5 * 60 * 1000,
  });

  const vulnerabilityPassByVulnAll = useMemo(
    () =>
      aggregatePassRateByVulnerability(taskResultsPayload?.results ?? [], effectiveVulnNameById),
    [taskResultsPayload?.results, effectiveVulnNameById],
  );

  const vulnerabilityPassByVulnApi = useMemo(
    () =>
      aggregatePassRateByVulnerability(
        filterAttackResultsByKind(taskResultsPayload?.results ?? [], 'api_runtime'),
        effectiveVulnNameById,
      ),
    [taskResultsPayload?.results, effectiveVulnNameById],
  );

  const vulnerabilityPassByVulnConfig = useMemo(
    () =>
      aggregatePassRateByVulnerability(
        filterAttackResultsByKind(taskResultsPayload?.results ?? [], 'config_yaml_static'),
        effectiveVulnNameById,
      ),
    [taskResultsPayload?.results, effectiveVulnNameById],
  );

  const difyResultRoundBreakdown = useMemo(() => {
    const results = taskResultsPayload?.results ?? [];
    let staticRounds = 0;
    let runtimeRounds = 0;
    for (const r of results) {
      if (isStaticConfigYamlAttackResult(r)) {
        staticRounds += 1;
      } else {
        runtimeRounds += 1;
      }
    }
    return { staticRounds, runtimeRounds, total: results.length };
  }, [taskResultsPayload?.results]);

  /**
   * 执行耗时：优先任务各回合 `response.durationMs` 之和（含嵌套 `full`，与报告 summary 同源逻辑）。
   * 若接口结果未带耗时（如历史 finding 映射），则用 `metadata.summary.executionTime`（生成报告时已做 DB / runLogs 回退）。
   */
  const executionTimeDisplayMs = useMemo(() => {
    const summaryMeta = (report as Report | undefined)?.metadata as
      | { summary?: { executionTime?: number } }
      | undefined;
    const stored =
      typeof summaryMeta?.summary?.executionTime === 'number' &&
      Number.isFinite(summaryMeta.summary.executionTime) &&
      summaryMeta.summary.executionTime >= 0
        ? summaryMeta.summary.executionTime
        : 0;

    const results = taskResultsPayload?.results ?? [];
    if (results.length > 0) {
      let sum = 0;
      for (const r of results) {
        sum += responseDurationMsFromResult(r.response);
      }
      if (sum > 0) {
        return Math.round(sum);
      }
      if (stored > 0) {
        return Math.round(stored);
      }
    }

    const meta = sourceTask?.metadata as { runLogs?: unknown } | undefined;
    const logs = meta?.runLogs;
    if (Array.isArray(logs)) {
      let logSum = 0;
      for (const log of logs) {
        if (log && typeof log === 'object' && 'durationMs' in log) {
          const n = (log as { durationMs: unknown }).durationMs;
          if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
            logSum += n;
          }
        }
      }
      if (logSum > 0) {
        return Math.round(logSum);
      }
    }

    if (results.length > 0) {
      let earliest: number | undefined;
      let latest: number | undefined;
      for (const r of results) {
        if (r.createdAt) {
          const t = new Date(r.createdAt).getTime();
          if (!Number.isNaN(t)) {
            earliest = earliest === undefined ? t : Math.min(earliest, t);
            latest = latest === undefined ? t : Math.max(latest, t);
          }
        }
      }
      if (latest !== undefined && earliest !== undefined && latest > earliest) {
        return latest - earliest;
      }
    }

    if (stored > 0) {
      return stored;
    }
    if (sourceTask?.createdAt && sourceTask?.updatedAt) {
      const t0 = new Date(sourceTask.createdAt).getTime();
      const t1 = new Date(sourceTask.updatedAt).getTime();
      if (!Number.isNaN(t0) && !Number.isNaN(t1) && t1 >= t0) {
        return t1 - t0;
      }
    }
    return stored;
  }, [report, taskResultsPayload?.results, sourceTask]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="container mx-auto py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {tr('Report not found', '报告不存在')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr(
                'Failed to load report details. It may have been deleted or is temporarily unavailable.',
                '加载报告详情失败。该报告可能已删除或暂时不可用。',
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => goBackToReportList()}>
            {tr('Back to reports', '返回报告列表')}
          </Button>
        </div>
      </div>
    );
  }

  const metadata = (report.metadata || {}) as any;
  const summary = (metadata.summary || {}) as any;
  const documentInfo = (metadata.documentInfo || {}) as any;
  const findingsPreview = (metadata.findingsPreview || []) as Array<any>;

  const reportType = (report as any).reportType as string | undefined;
  const isAuditReport =
    reportType === 'dify_config_audit' ||
    reportType === 'dify_config_static' ||
    reportType === 'skills_md_audit' ||
    reportType === 'mcp_source_audit' ||
    reportType === 'coze_config_audit' ||
    reportType === 'coze_config_static' ||
    reportType === 'fastgpt_config_audit' ||
    reportType === 'fastgpt_config_static' ||
    reportType === 'n8n_config_audit';
  const isDifyConfigTaskReport =
    reportType === 'dify_config_audit' || reportType === 'dify_config_static';
  const isCozeConfigTaskReport =
    reportType === 'coze_config_audit' || reportType === 'coze_config_static';
  const isFastgptConfigTaskReport =
    reportType === 'fastgpt_config_audit' || reportType === 'fastgpt_config_static';
  const isComplianceAssessmentReport = reportType === 'compliance_assessment';
  const complianceScanTaskId =
    isComplianceAssessmentReport && typeof metadata.scanTaskId === 'string'
      ? metadata.scanTaskId.trim()
      : '';
  const isConfigGrayBoxTaskReport =
    isDifyConfigTaskReport || isCozeConfigTaskReport || isFastgptConfigTaskReport;
  const isCozeApiBlackboxTask =
    !isConfigGrayBoxTaskReport && String(sourceTask?.platformFamily ?? '').toLowerCase() === 'coze';
  const isFastgptApiBlackboxTask =
    !isConfigGrayBoxTaskReport &&
    String(sourceTask?.platformFamily ?? '').toLowerCase() === 'fastgpt';
  /** Same top cards as API reports: document info, task overview, risk grid, donuts, findings table. */
  const showStandardReportSummaryCards = !isAuditReport || isConfigGrayBoxTaskReport;
  const configAuditFileName = (() => {
    const m = sourceTask?.metadata as { configAudit?: { fileName?: string } } | undefined;
    const n = m?.configAudit?.fileName;
    return typeof n === 'string' && n.trim() !== '' ? n.trim() : undefined;
  })();
  const auditKindLabel = isZh
    ? configAuditKindLabelZh(reportType)
    : reportType === 'skills_md_audit'
      ? 'SKILLS.md Audit'
      : reportType === 'mcp_source_audit'
        ? 'MCP Source Audit'
        : reportType === 'coze_config_static'
          ? 'Coze Config Gray-Box Scanning Task'
          : reportType === 'coze_config_audit'
            ? 'Coze Config Gray-Box & API Black-Box Scanning Task'
            : reportType === 'fastgpt_config_static'
              ? 'FastGPT Config Gray-Box Scanning Task'
              : reportType === 'fastgpt_config_audit'
                ? 'FastGPT Config Gray-Box & API Black-Box Scanning Task'
                : reportType === 'n8n_config_audit'
                  ? 'n8n Config Audit'
                  : reportType === 'dify_config_static'
                    ? 'Dify Config Gray-Box Scanning Task'
                    : 'Dify Config Gray-Box & API Black-Box Scanning Task';
  const auditDefaultTitle = isZh
    ? configAuditReportTitleZh(reportType)
    : reportType === 'skills_md_audit'
      ? 'SKILLS.md Audit Report'
      : reportType === 'mcp_source_audit'
        ? 'MCP Source Audit Report'
        : reportType === 'coze_config_static'
          ? 'Coze Config Gray-Box Scanning Report'
          : reportType === 'coze_config_audit'
            ? 'Coze Config Gray-Box & API Black-Box Scanning Report'
            : reportType === 'fastgpt_config_static'
              ? 'FastGPT Config Gray-Box Scanning Report'
              : reportType === 'fastgpt_config_audit'
                ? 'FastGPT Config Gray-Box & API Black-Box Scanning Report'
                : reportType === 'n8n_config_audit'
                  ? 'n8n Config Audit Report'
                  : reportType === 'dify_config_static'
                    ? 'Dify Config Gray-Box Scanning Report'
                    : 'Dify Config Gray-Box & API Black-Box Scanning Report';
  const taskName: string | undefined = (report as any).title || metadata.taskName;
  const completedAtLabel =
    typeof summary.completedAt === 'string'
      ? new Date(summary.completedAt).toLocaleString(isZh ? 'zh-CN' : undefined)
      : new Date(report.createdAt).toLocaleString(isZh ? 'zh-CN' : undefined);

  const configConclusion = configAuditConclusion({
    overallRisk: metadata.overallRisk as string | undefined,
    findingsCount: Number(metadata.findingsCount ?? summary.totalFindings ?? 0) || 0,
    highCount: Number(summary.highRiskCount ?? 0) || 0,
    mediumCount: Number(summary.mediumRiskCount ?? 0) || 0,
    vulnerableFindings: Number(summary.vulnerableFindings ?? 0) || 0,
  });
  const useDialogueStyleAuditChrome = Boolean(isAuditReport && isZh);

  const effectiveTargetType = sourceTask?.targetType ?? metadata.targetType;

  const configPlatform = reportTypeToConfigPlatform(reportType);
  const auditDataFromMeta = metadata.auditData as DifyConfigAuditData | undefined;
  const hasSharedConfigAuditBody =
    !!configPlatform &&
    !!auditDataFromMeta &&
    typeof auditDataFromMeta.summary === 'string' &&
    Array.isArray(auditDataFromMeta.findings);
  const sharedConfigFileName =
    (typeof metadata.fileName === 'string' && metadata.fileName.trim()) ||
    configAuditFileName ||
    undefined;

  // Config gray-box / n8n: same result body as local history / wizard (conclusion + findings).
  if (hasSharedConfigAuditBody && configPlatform) {
    return (
      <div className="container mx-auto space-y-6 py-8">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goBackToReportList(reportType)}
          >
            {tr('Back to reports', '返回报告列表')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {tr('Download', '下载')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{tr('Download formats', '下载格式')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(
                [
                  { format: 'md' as const, label: 'Markdown' },
                  { format: 'html' as const, label: 'HTML' },
                  { format: 'pdf' as const, label: 'PDF' },
                ] as const
              ).map((opt) => (
                <DropdownMenuItem
                  key={opt.format}
                  onClick={async () => {
                    try {
                      const blob = await reportsApi.download({
                        reportId: report.id,
                        format: opt.format,
                      });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const base =
                        report.filePath?.replace(/\.(pdf|html|md|docx)$/i, '') ??
                        `report-${report.id}`;
                      a.download = `${base}.${opt.format}`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error('Failed to download report', e);
                      toast.error(tr('Download failed', '下载失败'));
                    }
                  }}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ConfigAuditResultView
          platform={configPlatform}
          result={auditDataFromMeta}
          fileName={sharedConfigFileName}
          createdAt={
            typeof summary.completedAt === 'string' ? summary.completedAt : report.createdAt
          }
          hideOpenReport
          backHref={{
            to: '/reports/audit-center',
            search: { category: 'config' },
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-4',
          useDialogueStyleAuditChrome && 'rounded-2xl border bg-card p-5 shadow-sm',
        )}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {isAuditReport
              ? useDialogueStyleAuditChrome
                ? `${auditDefaultTitle} · ${taskName || configAuditFileName || '未命名'}`
                : taskName || auditDefaultTitle
              : `Report for Task ${taskName || report.taskId}`}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {isAuditReport && <Badge variant="secondary">{auditKindLabel}</Badge>}
            {useDialogueStyleAuditChrome ? (
              <ConfigAuditRiskPill
                risk={metadata.overallRisk as string | undefined}
                passed={configConclusion.passed}
              />
            ) : null}
            <span>· {completedAtLabel}</span>
            {!useDialogueStyleAuditChrome && (
              <span>
                · Report <span className="font-mono">{report.id}</span>
              </span>
            )}
            {report.reportRunId && !useDialogueStyleAuditChrome && (
              <span>
                · Run <span className="font-mono">{report.reportRunId}</span>
              </span>
            )}
          </div>
          {useDialogueStyleAuditChrome && configAuditFileName ? (
            <p className="mt-2 text-xs text-muted-foreground">
              配置文件 · <span className="font-mono">{configAuditFileName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {complianceScanTaskId ? (
            <Button
              variant="default"
              size="sm"
              onClick={() =>
                navigate({
                  to: '/scan/compliance-tasks/$taskId',
                  params: { taskId: complianceScanTaskId },
                  search: {
                    panel: 'full',
                    returnTo: `${window.location.pathname}${window.location.search}`,
                  },
                })
              }
            >
              {tr('Interactive full report', '查看交互式完整报告')}
            </Button>
          ) : null}
          {report.taskId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  to: '/tasks/$taskId',
                  params: { taskId: report.taskId as string },
                })
              }
            >
              {tr('View Task', '查看任务')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => goBackToReportList(reportType)}
          >
            {tr('Back to reports', '返回报告列表')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {tr('Download', '下载')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{tr('Export format', '导出格式')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(
                [
                  { label: 'PDF (.pdf)', format: 'pdf' as const },
                  { label: 'Word (.docx)', format: 'docx' as const },
                  { label: 'Markdown (.md)', format: 'md' as const },
                  { label: 'HTML (.html)', format: 'html' as const },
                ] as const
              ).map((opt) => (
                <DropdownMenuItem
                  key={opt.format}
                  onClick={async () => {
                    try {
                      const blob = await reportsApi.download({
                        reportId: report.id,
                        format: opt.format,
                      });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const base =
                        report.filePath?.replace(/\.(pdf|html|md|docx)$/i, '') ??
                        `report-${report.id}`;
                      a.download = `${base}.${opt.format}`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error('Failed to download report', e);
                    }
                  }}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {useDialogueStyleAuditChrome ? (
        <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
          <ConfigAuditConclusionBand conclusion={configConclusion} />
          <ConfigAuditMetricTiles
            items={[
              {
                label: '发现总数',
                value: String(
                  summary.totalFindings ??
                    summary.totalVulnerabilities ??
                    metadata.findingsCount ??
                    0,
                ),
              },
              {
                label: '风险命中',
                value: String(summary.vulnerableFindings ?? 0),
                tone:
                  Number(summary.vulnerableFindings ?? 0) > 0
                    ? 'text-red-700'
                    : 'text-emerald-700',
              },
              {
                label: '高危 / 中危',
                value: `${summary.highRiskCount ?? 0} / ${summary.mediumRiskCount ?? 0}`,
                tone:
                  Number(summary.highRiskCount ?? 0) > 0
                    ? 'text-red-700'
                    : Number(summary.mediumRiskCount ?? 0) > 0
                      ? 'text-amber-700'
                      : undefined,
              },
              {
                label: '执行耗时',
                value:
                  typeof executionTimeDisplayMs === 'number'
                    ? formatExecutionTimeMinutes(executionTimeDisplayMs)
                    : '—',
              },
            ]}
          />
          <section className="rounded-xl border p-4">
            <div className="text-sm font-semibold">任务与文档</div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">任务：</span>
                {taskName || report.taskId || '—'}
              </div>
              <div>
                <span className="font-medium text-foreground">组织：</span>
                {isOrgLoading ? '…' : organization?.name || report.organizationId || '—'}
              </div>
              <div>
                <span className="font-medium text-foreground">密级：</span>
                {documentInfo.securityLevel || '内部保密 · 禁止外传'}
              </div>
              <div>
                <span className="font-medium text-foreground">作者：</span>
                {documentInfo.author || '智安安全测试平台'}
              </div>
              {effectiveTargetType === 'agent' ? (
                <div>
                  <span className="font-medium text-foreground">被测 Agent：</span>
                  {isTaskLoading || isAgentLoading
                    ? '…'
                    : targetAgent?.name || agentIdForReport || '—'}
                </div>
              ) : (
                <div>
                  <span className="font-medium text-foreground">目标类型：</span>
                  {effectiveTargetType || '—'}
                </div>
              )}
              <div>
                <span className="font-medium text-foreground">测试模式：</span>
                {metadata.attackMode ? formatTestingModeLabel(metadata.attackMode) : '—'}
              </div>
              {configAuditFileName ? (
                <div className="sm:col-span-2">
                  <span className="font-medium text-foreground">配置文件：</span>
                  <span className="font-mono text-xs">{configAuditFileName}</span>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <span className="font-medium text-foreground">测试时间：</span>
                {summary.testStart && summary.testEnd
                  ? `${new Date(summary.testStart).toLocaleString('zh-CN')} ~ ${new Date(
                      summary.testEnd,
                    ).toLocaleString('zh-CN')}`
                  : completedAtLabel}
              </div>
              {metadata.overallRisk ? (
                <div>
                  <span className="font-medium text-foreground">静态审计综合风险：</span>
                  {riskLevelZh(String(metadata.overallRisk))}
                  {typeof metadata.findingsCount === 'number'
                    ? ` · ${metadata.findingsCount} 条结构化发现`
                    : ''}
                </div>
              ) : null}
            </div>
            {isConfigGrayBoxTaskReport && difyResultRoundBreakdown.total > 0 ? (
              <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                本任务已加载攻击结果轮次{' '}
                <span className="font-medium text-foreground">{difyResultRoundBreakdown.total}</span>{' '}
                次：配置静态{' '}
                <span className="font-medium text-foreground">
                  {difyResultRoundBreakdown.staticRounds}
                </span>
                ，运行时 / API{' '}
                <span className="font-medium text-foreground">
                  {difyResultRoundBreakdown.runtimeRounds}
                </span>
                。
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {showStandardReportSummaryCards && !useDialogueStyleAuditChrome && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{tr('Document Info', '文档信息')}</CardTitle>
              <CardDescription>
                {isConfigGrayBoxTaskReport
                  ? 'Key metadata from the generated configuration audit report'
                  : 'Key metadata from the generated report'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Document Name: </span>
                <span>
                  {documentInfo.documentName ||
                    (isCozeConfigTaskReport
                      ? `${taskName || targetAgent?.name || report.taskId} · Coze 工作流配置安全报告`
                      : isFastgptConfigTaskReport
                        ? `${taskName || targetAgent?.name || report.taskId} · FastGPT 工作流配置安全报告`
                        : isDifyConfigTaskReport
                          ? `${taskName || targetAgent?.name || report.taskId} · Dify 配置安全报告`
                          : isCozeApiBlackboxTask
                            ? `${targetAgent?.name || taskName || report.taskId} Coze API 黑盒安全测试报告`
                            : isFastgptApiBlackboxTask
                              ? `${targetAgent?.name || taskName || report.taskId} FastGPT API 黑盒安全测试报告`
                              : `${targetAgent?.name || taskName || report.taskId} API 黑盒安全测试报告`)}
                </span>
              </div>
              <div>
                <span className="font-medium">Security Level: </span>
                <span>{documentInfo.securityLevel || 'Confidential — not for distribution'}</span>
              </div>
              <div>
                <span className="font-medium">Author: </span>
                <span>{documentInfo.author || '智安安全测试平台'}</span>
              </div>
              <div>
                <span className="font-medium">Report Date: </span>
                <span>
                  {documentInfo.reportDate
                    ? new Date(documentInfo.reportDate).toLocaleString()
                    : completedAtLabel}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tr('Task Overview', '任务概览')}</CardTitle>
              <CardDescription>
                {isCozeConfigTaskReport
                  ? 'Coze workflow YAML configuration audit and runtime verification context'
                  : isFastgptConfigTaskReport
                    ? 'FastGPT workflow JSON configuration audit and runtime verification context'
                    : isDifyConfigTaskReport
                      ? 'Dify DSL / YAML configuration audit and runtime verification context'
                      : isCozeApiBlackboxTask
                        ? 'Coze Bot / Open API black-box attack task context'
                        : isFastgptApiBlackboxTask
                          ? 'FastGPT OpenAI-compatible API black-box attack task context'
                          : 'Attack task context for this report'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="font-medium">Task: </span>
                <span>{taskName || report.taskId}</span>
              </div>
              <div>
                <span className="font-medium">Organization: </span>
                <span>
                  {isOrgLoading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : organization?.name ? (
                    organization.name
                  ) : (
                    <span className="font-mono text-xs">{report.organizationId}</span>
                  )}
                </span>
              </div>
              {effectiveTargetType === 'agent' ? (
                <div>
                  <span className="font-medium">Tested Agent: </span>
                  <span>
                    {isTaskLoading || isAgentLoading ? (
                      <span className="text-muted-foreground">…</span>
                    ) : targetAgent?.name ? (
                      targetAgent.name
                    ) : agentIdForReport ? (
                      <span className="font-mono text-xs">{agentIdForReport}</span>
                    ) : (
                      'N/A'
                    )}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="font-medium">Target Type: </span>
                  <span>{effectiveTargetType || 'N/A'}</span>
                </div>
              )}
              <div>
                <span className="font-medium">Testing Mode: </span>
                <span>
                  {metadata.attackMode ? formatTestingModeLabel(metadata.attackMode) : 'N/A'}
                </span>
              </div>
              {isConfigGrayBoxTaskReport && configAuditFileName && (
                <div>
                  <span className="font-medium">
                    {isCozeConfigTaskReport
                      ? 'Workflow YAML file: '
                      : isFastgptConfigTaskReport
                        ? 'Workflow export (JSON) file: '
                        : 'DSL / YAML file: '}
                  </span>
                  <span className="font-mono text-xs">{configAuditFileName}</span>
                </div>
              )}
              <div>
                <span className="font-medium">Test Time Range: </span>
                <span>
                  {summary.testStart && summary.testEnd
                    ? `${new Date(summary.testStart).toLocaleString()} ~ ${new Date(
                        summary.testEnd,
                      ).toLocaleString()}`
                    : 'Not recorded'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isAuditReport &&
        !isConfigGrayBoxTaskReport &&
        metadata.overallRisk &&
        !useDialogueStyleAuditChrome && (
        <Card>
          <CardHeader>
            <CardTitle>{tr('Risk Summary', '风险摘要')}</CardTitle>
            <CardDescription>Overall risk from static audit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  metadata.overallRisk === 'high' || metadata.overallRisk === 'critical'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {String(metadata.overallRisk).toUpperCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {metadata.findingsCount ?? 0} finding(s)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {showStandardReportSummaryCards && !useDialogueStyleAuditChrome && (
        <Card>
          <CardHeader>
            <CardTitle>{tr('Risk Summary', '风险摘要')}</CardTitle>
            <CardDescription className="space-y-1">
              {isConfigGrayBoxTaskReport && metadata.overallRisk ? (
                <>
                  <span>
                    Static LLM audit (§7.1):{' '}
                    <span className="font-medium text-foreground">
                      {String(metadata.overallRisk).toUpperCase()}
                    </span>{' '}
                    · {metadata.findingsCount ?? 0} structured finding(s).
                  </span>
                  {(reportType === 'dify_config_audit' ||
                    reportType === 'coze_config_audit' ||
                    reportType === 'fastgpt_config_audit') && (
                    <span className="block text-muted-foreground">
                      The numeric tiles count{' '}
                      <strong className="text-foreground">attack-result rounds</strong> (YAML
                      rule/command scans and live API/agent runs), not the LLM finding rows above.
                    </span>
                  )}
                </>
              ) : (
                'High-level metrics from this test run'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 text-sm">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Total Findings</div>
                <div className="text-2xl font-semibold">
                  {summary.totalFindings ?? summary.totalVulnerabilities ?? 0}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Vulnerable Findings</div>
                <div className="text-2xl font-semibold text-red-600">
                  {summary.vulnerableFindings ?? 0}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">High / Medium</div>
                <div className="text-lg font-semibold">
                  <span className="text-red-600 mr-2">{summary.highRiskCount ?? 0}</span>
                  <span className="text-amber-600">{summary.mediumRiskCount ?? 0}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Execution Time</div>
                <div className="text-sm">
                  {typeof executionTimeDisplayMs === 'number'
                    ? formatExecutionTimeMinutes(executionTimeDisplayMs)
                    : 'N/A'}
                </div>
              </div>
            </div>
            {isConfigGrayBoxTaskReport && difyResultRoundBreakdown.total > 0 && (
              <p className="text-muted-foreground mt-4 border-t pt-3 text-xs leading-relaxed">
                Attack-result rounds loaded for this task:{' '}
                <span className="font-medium text-foreground">
                  {difyResultRoundBreakdown.total}
                </span>{' '}
                total —{' '}
                <span className="font-medium text-foreground">
                  {difyResultRoundBreakdown.staticRounds}
                </span>{' '}
                Config rule/command static (
                <code className="text-[11px]">static://config-yaml</code> /{' '}
                <code className="text-[11px]">static://config-json</code>),{' '}
                <span className="font-medium text-foreground">
                  {difyResultRoundBreakdown.runtimeRounds}
                </span>{' '}
                runtime / API or other.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {showStandardReportSummaryCards && (
        <Card>
          <CardHeader>
            <CardTitle>
              {useDialogueStyleAuditChrome ? '分漏洞通过率' : 'Per-vulnerability pass rate'}
            </CardTitle>
            <CardDescription>
              {useDialogueStyleAuditChrome
                ? isConfigGrayBoxTaskReport
                  ? '按来源拆分：运行时/API 验证 vs 配置规则与命令静态扫描。每个漏洞一个圆环；多轮对话合并为一条命令，任一轮判定为易受攻击即记失败。'
                  : '每个漏洞一个圆环：总数为该漏洞下的攻击命令数；多轮对话合并为一条命令，任一轮判定为易受攻击即记失败。'
                : isConfigGrayBoxTaskReport
                  ? 'Split by source: API/runtime verification vs config rule/command static scans (static://config-yaml / static://config-json). One donut per vulnerability per section; multiple conversation rounds collapse to one command; any VULNERABLE round fails the command.'
                  : 'One donut per vulnerability: total is the number of attack commands (test cases) for that vulnerability. Multiple conversation rounds count as one command; a command counts as failed if any round is VULNERABLE. Pass rate is passed commands / total commands.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isTaskResultsLoading ? (
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[220px] w-full rounded-lg" />
                ))}
              </div>
            ) : isConfigGrayBoxTaskReport ? (
              <div className="space-y-10">
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {useDialogueStyleAuditChrome ? '运行时 / API 验证' : 'Runtime / API verification'}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {useDialogueStyleAuditChrome
                        ? '实时 Agent 或 API 攻击命令（不含配置静态扫描行）。'
                        : 'Live agent or API attack commands (excludes YAML static scan rows). Matches report §7.3.'}
                    </p>
                  </div>
                  {vulnerabilityPassByVulnApi.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {useDialogueStyleAuditChrome
                        ? '本任务暂无运行时 / API 轮次。'
                        : 'No API/runtime rounds for this task.'}
                    </p>
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {vulnerabilityPassByVulnApi.map((row) => (
                        <VulnerabilityPassDonut
                          key={`api-${row.vulnerabilityId}`}
                          displayName={
                            row.vulnerabilityId === UNLINKED_VULNERABILITY_BUCKET
                              ? useDialogueStyleAuditChrome
                                ? '未关联漏洞'
                                : 'Unlinked (no vulnerability_id)'
                              : (effectiveVulnNameById.get(row.vulnerabilityId) ??
                                row.vulnerabilityId)
                          }
                          total={row.total}
                          passed={row.passed}
                        />
                      ))}
                    </div>
                  )}
                </section>
                <section className="space-y-3 border-t pt-8">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {useDialogueStyleAuditChrome
                        ? '配置静态（规则 / 命令）'
                        : 'YAML config (rules and command static)'}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {useDialogueStyleAuditChrome
                        ? isCozeConfigTaskReport
                          ? '导出工作流 YAML 的规则与命令级扫描。'
                          : isFastgptConfigTaskReport
                            ? '导出工作流 JSON 的规则与命令级扫描。'
                            : '导出 DSL/YAML 的规则与命令级扫描。'
                        : isCozeConfigTaskReport
                          ? 'Exported workflow YAML rule and command-level scans ('
                          : isFastgptConfigTaskReport
                            ? 'Exported workflow JSON rule and command-level scans ('
                            : 'Exported DSL/YAML rule and command-level scans ('}
                      {!useDialogueStyleAuditChrome ? (
                        <>
                          <code className="text-[11px]">static://config-yaml</code> /{' '}
                          <code className="text-[11px]">static://config-json</code>
                          ). Matches report §7.2.
                        </>
                      ) : null}
                    </p>
                  </div>
                  {vulnerabilityPassByVulnConfig.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {useDialogueStyleAuditChrome
                        ? '暂无配置静态扫描轮次（可能未开启规则/命令检测，或未产出结果）。'
                        : 'No config static scan rounds (rules/command detection may be off or produced no rows).'}
                    </p>
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {vulnerabilityPassByVulnConfig.map((row) => (
                        <VulnerabilityPassDonut
                          key={`cfg-${row.vulnerabilityId}`}
                          displayName={
                            row.vulnerabilityId === UNLINKED_VULNERABILITY_BUCKET
                              ? useDialogueStyleAuditChrome
                                ? '未关联漏洞'
                                : 'Unlinked (no vulnerability_id)'
                              : (effectiveVulnNameById.get(row.vulnerabilityId) ??
                                row.vulnerabilityId)
                          }
                          total={row.total}
                          passed={row.passed}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : vulnerabilityPassByVulnAll.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {useDialogueStyleAuditChrome ? '暂无攻击执行数据。' : 'No attack execution data.'}
              </p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {vulnerabilityPassByVulnAll.map((row) => (
                  <VulnerabilityPassDonut
                    key={row.vulnerabilityId}
                    displayName={
                      row.vulnerabilityId === UNLINKED_VULNERABILITY_BUCKET
                        ? useDialogueStyleAuditChrome
                          ? '未关联漏洞'
                          : 'Unlinked (no vulnerability_id)'
                        : (effectiveVulnNameById.get(row.vulnerabilityId) ?? row.vulnerabilityId)
                    }
                    total={row.total}
                    passed={row.passed}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showStandardReportSummaryCards &&
        Array.isArray(findingsPreview) &&
        findingsPreview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{tr('Findings Summary', '发现摘要')}</CardTitle>
              <CardDescription>
                {useDialogueStyleAuditChrome
                  ? '点击行查看验证提示、响应预览、判定理由与结论'
                  : 'Click a row for verification prompt, response preview, reasoning, and verdict'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>
                        {useDialogueStyleAuditChrome ? '漏洞类型' : 'Vulnerability'}
                      </TableHead>
                      <TableHead>{useDialogueStyleAuditChrome ? '风险' : 'Risk'}</TableHead>
                      <TableHead>{useDialogueStyleAuditChrome ? '判定' : 'Verdict'}</TableHead>
                      <TableHead>{useDialogueStyleAuditChrome ? '理由' : 'Reason'}</TableHead>
                      <TableHead>{useDialogueStyleAuditChrome ? '时间' : 'Time'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findingsPreview.map((finding) => {
                      const verdictBadge =
                        finding.vulnerable === true ||
                        String(finding.vulnerable).toLowerCase() === 'true' ? (
                          <Badge variant="destructive" className="text-xs">
                            {tr('VULNERABLE', '易受攻击')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {tr('SAFE', '安全')}
                          </Badge>
                        );
                      const vid = finding.vulnerabilityId as string | undefined;
                      const vulnName =
                        (finding as { vulnerabilityName?: string }).vulnerabilityName ||
                        (vid ? effectiveVulnNameById.get(vid) : undefined) ||
                        vid ||
                        '-';
                      return (
                        <TableRow
                          key={`${finding.index}-${vid ?? 'row'}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedFindingPreview(finding as Record<string, unknown>);
                            setFindingDetailOpen(true);
                            const list = taskResultsPayload?.results;
                            if (list?.length) {
                              const { matched } = resolveAttackResultForPreview(
                                finding as Record<string, unknown>,
                                list,
                              );
                              if (!matched) {
                                toast.message(
                                  'Could not align this row with stored task results; showing best-effort data.',
                                );
                              }
                            }
                          }}
                        >
                          <TableCell>{finding.index}</TableCell>
                          <TableCell className="max-w-md min-w-0 whitespace-normal align-top">
                            <div className="wrap-break-word text-sm">{vulnName}</div>
                            {vid && vulnName !== vid && (
                              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                {vid}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="capitalize">
                            {useDialogueStyleAuditChrome
                              ? riskLevelZh(String(finding.riskLevel || ''))
                              : finding.riskLevel || '-'}
                          </TableCell>
                          <TableCell>{verdictBadge}</TableCell>
                          <TableCell className="max-w-md truncate text-xs">
                            {finding.reason || '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {finding.createdAt ? new Date(finding.createdAt).toLocaleString() : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

      <Dialog
        open={findingDetailOpen}
        onOpenChange={(open) => {
          setFindingDetailOpen(open);
          if (!open) {
            setSelectedFindingPreview(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2 pe-12">
            <DialogTitle className="wrap-break-word">
              {tr('Finding', '发现')} #
              {selectedFindingPreview && typeof selectedFindingPreview.index === 'number'
                ? selectedFindingPreview.index
                : '—'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Vulnerability, verification prompt, response preview, reasoning, and verdict for this
              finding
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 min-w-0 flex-1 px-6 pb-6">
            {isTaskResultsLoading && (
              <div className="space-y-2 py-4">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {!isTaskResultsLoading &&
              selectedFindingPreview &&
              (() => {
                const results = taskResultsPayload?.results ?? [];
                const { result, matched } = resolveAttackResultForPreview(
                  selectedFindingPreview,
                  results,
                );
                const vid = selectedFindingPreview.vulnerabilityId as string | undefined;
                const vulnTitle =
                  (selectedFindingPreview.vulnerabilityName as string | undefined) ||
                  (vid ? effectiveVulnNameById.get(vid) : undefined) ||
                  vid ||
                  '—';
                const vulnDesc = vid ? effectiveVulnDescById.get(vid) : undefined;
                const req = result?.request;
                const res = result?.response as Record<string, unknown> | undefined;
                let responseBodyDisplay = resolveAttackResultResponseBodyForDisplay(res);
                if (
                  !responseBodyDisplay ||
                  responseBodyDisplay === '—' ||
                  isTrivialAgentOutputDisplay(responseBodyDisplay)
                ) {
                  const runLogs = Array.isArray(
                    (sourceTask?.metadata as { runLogs?: unknown[] } | undefined)?.runLogs,
                  )
                    ? ((sourceTask?.metadata as { runLogs: unknown[] }).runLogs ?? [])
                    : [];
                  const fromLogs = pickLatestApiRoundPreviewForVulnerability(runLogs, vid);
                  const raw = fromLogs.trim();
                  if (raw) {
                    const text =
                      raw.startsWith('{') && raw.includes('"messages"')
                        ? parseCozePreview(raw).trim()
                        : raw;
                    if (text && !isTrivialAgentOutputDisplay(text)) {
                      responseBodyDisplay = stripModelMetaFromDisplayText(text);
                    }
                  }
                }
                const reason =
                  result?.finalVerdict?.reason ||
                  (selectedFindingPreview.reason as string | undefined) ||
                  '—';
                const fv = result?.finalVerdict;
                const verdictVuln =
                  fv != null
                    ? isFinalVerdictVulnerable(fv)
                    : selectedFindingPreview.vulnerable === true ||
                      String(selectedFindingPreview.vulnerable).toLowerCase() === 'true';
                const det = result?.detectionResults as
                  | {
                      ruleHits?: FindingDetectionRuleResult[];
                      llmEvidence?: { evidencePaths?: string[]; evidenceSnippets?: string[] };
                    }
                  | undefined;
                const ruleHits = Array.isArray(det?.ruleHits) ? det.ruleHits : [];
                const metaYaml = (() => {
                  const cfg = (
                    sourceTask?.metadata as
                      | { configAudit?: { yaml?: string; json?: string } }
                      | undefined
                  )?.configAudit;
                  const isFastgpt =
                    reportTypeEarly === 'fastgpt_config_audit' ||
                    reportTypeEarly === 'fastgpt_config_static' ||
                    String(sourceTask?.platformFamily ?? '').toLowerCase() === 'fastgpt';
                  return String(isFastgpt ? cfg?.json || '' : cfg?.yaml || '').trim();
                })();
                const yamlForHits =
                  responseBodyDisplay && responseBodyDisplay.length > 200
                    ? responseBodyDisplay
                    : metaYaml || undefined;
                return (
                  <div className="min-w-0 space-y-4 text-sm">
                    {!matched && results.length > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Row may not match current task results order; details below are best-effort.
                      </p>
                    )}
                    {results.length === 0 && !isTaskResultsLoading && (
                      <p className="text-xs text-muted-foreground">
                        No task results returned for this report task; only report snapshot fields
                        are available.
                      </p>
                    )}
                    <section className="min-w-0 space-y-1">
                      <h4 className="font-medium text-foreground">Vulnerability</h4>
                      <p className="wrap-break-word text-foreground">{vulnTitle}</p>
                      {vulnDesc && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {vulnDesc}
                        </p>
                      )}
                    </section>
                    <section className="space-y-1">
                      <h4 className="font-medium text-foreground">Verification prompt</h4>
                      <pre className={findingDetailPreClass}>
                        {result ? stripModelMetaFromDisplayText(formatResultPayload(req)) : '—'}
                      </pre>
                    </section>
                    <section className="space-y-1">
                      <h4 className="font-medium text-foreground">Response preview</h4>
                      <pre className={findingDetailPreClass}>{responseBodyDisplay}</pre>
                    </section>
                    <section className="space-y-1">
                      <h4 className="font-medium text-foreground">Reasoning</h4>
                      <pre className={findingDetailPreClass}>
                        {stripModelMetaFromDisplayText(reason)}
                      </pre>
                    </section>
                    {ruleHits.length > 0 && (
                      <section className="space-y-1">
                        <RuleHitsLocationPanel
                          hits={ruleHits}
                          fullText={yamlForHits}
                          structureYaml={metaYaml || undefined}
                          structureNodes={reportDslStructure?.inventory?.nodes}
                        />
                      </section>
                    )}
                    {det?.llmEvidence &&
                    (det.llmEvidence.evidencePaths?.length ||
                      det.llmEvidence.evidenceSnippets?.length) ? (
                      <section className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs">
                        <h4 className="font-medium text-foreground">
                          LLM evidence (paths / snippets)
                        </h4>
                        {det.llmEvidence.evidencePaths?.map((p, i) => (
                          <p
                            key={`lr-${i}`}
                            className="font-mono wrap-break-word text-muted-foreground"
                          >
                            {p}
                          </p>
                        ))}
                        {det.llmEvidence.evidenceSnippets?.map((s, i) => (
                          <pre
                            key={`ls-${i}`}
                            className="mt-1 whitespace-pre-wrap wrap-break-word text-muted-foreground"
                          >
                            {s}
                          </pre>
                        ))}
                      </section>
                    ) : null}
                    <section className="space-y-2">
                      <h4 className="font-medium text-foreground">Verdict</h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={verdictVuln ? 'destructive' : 'secondary'}>
                          {verdictVuln ? tr('VULNERABLE', '易受攻击') : tr('SAFE', '安全')}
                        </Badge>
                        {(fv?.riskLevel ||
                          (selectedFindingPreview.riskLevel as string | undefined)) && (
                          <Badge variant="outline" className="capitalize">
                            {String(fv?.riskLevel ?? selectedFindingPreview.riskLevel)}
                          </Badge>
                        )}
                        {fv?.confidence != null && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            Confidence: {Number(fv.confidence).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </section>
                  </div>
                );
              })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {!useDialogueStyleAuditChrome ||
      !(
        isConfigGrayBoxTaskReport ||
        reportType === 'n8n_config_audit'
      ) ? (
      <Card>
        <CardHeader>
          <CardTitle>完整报告</CardTitle>
          <CardDescription>
            {report.reportType === 'skills_md_audit' || report.reportType === 'mcp_source_audit'
              ? '结构化展示审计摘要、风险分布与发现详情'
              : '以下为已生成报告的全文内容'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(() => {
            const { mode, component } = getReportContentRender(report);
            if (mode === 'custom' && component) {
              return component;
            }
            if (mode === 'markdown' && report.content) {
              return <ReportMarkdownView markdown={report.content} />;
            }
            if (mode === 'html' && report.content) {
              return (
                <div className="border rounded overflow-hidden">
                  <iframe
                    title="HTML report preview"
                    srcDoc={report.content}
                    sandbox=""
                    className="w-full min-h-[600px] border-0"
                  />
                </div>
              );
            }
            if (mode === 'html') {
              return (
                <p className="text-sm text-muted-foreground">
                  This report is stored as HTML, but no inline content is available for preview. Use
                  Download to view it.
                </p>
              );
            }
            return (
              <p className="text-sm text-muted-foreground">
                This report is stored as {report.format.toUpperCase()}. Use the Download action from
                the reports list to retrieve the file.
              </p>
            );
          })()}
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}
