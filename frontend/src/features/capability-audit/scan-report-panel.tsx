/**
 * 多引擎扫描报告详情页 — 浅色版 SAFESKILL 结构
 */

import { useEffect, useMemo, useState } from 'react';

import { Link } from '@tanstack/react-router';
import { dimensionLabel } from 'capability-audit/shared/dimensions';
import { engineLabel } from 'capability-audit/shared/engines';
import {
  isFormalRiskStatus,
  type ProcessingStatus,
} from 'capability-audit/shared/finding-disposition';
import {
  type GroupedFinding,
  groupedRecommendation,
  groupedTitle,
  groupFindingsForDisplay,
} from 'capability-audit/shared/finding-groups';
import { getScanStrategyMeta, type ScanStrategy } from 'capability-audit/shared/scan';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Shield,
  ShieldAlert,
  ShieldX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  inferSkillAuditDimensionClient,
  isMetaScanFinding,
  SKILL_AUDIT_DIMENSION_IDS,
  type SkillAuditDimensionId,
} from '@/features/skills-md-audit/dimensions';
import { riskVariant } from '@/features/skills-md-audit/utils';
import { DimensionGrid, DimensionRiskBanner } from './dimension-grid';
import { SCAN_REPORT_SECTION_IDS } from './scan-report-toc';
import { SkillContentPreview } from './skill-content-preview';
import type { EngineRunStatus, SkillPreview } from '@/services/api/capability-scan';
import type { SkillsMdAuditData } from '@/services/api/skills-md-audit';

type AssetManifestItem = { path: string; kind: string };

type DispositionSummary = {
  confirmed: number;
  suspected: number;
  hint: number;
  reference_sample: number;
  false_positive: number;
  formalRiskCount: number;
  summaryZh: string;
  summaryEn: string;
};

type ScanReportPanelProps = {
  result: SkillsMdAuditData & {
    reportId?: string;
    securityScanTaskId?: string;
    remediationIds?: string[];
    registryId?: string;
    syncedFindings?: number;
    rawFindings?: SkillsMdAuditData['findings'];
    dispositionSummary?: DispositionSummary;
  };
  fileName?: string;
  strategy?: ScanStrategy;
  engines?: EngineRunStatus[];
  assetManifest?: AssetManifestItem[];
  skillPreview?: SkillPreview;
  isZh: boolean;
  onCopyMd: () => void;
  onDownloadJson: () => void;
  onDownloadSarif?: () => void;
};

type Severity = SkillsMdAuditData['findings'][number]['severity'];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function dimensionForFinding(f: SkillsMdAuditData['findings'][number]): SkillAuditDimensionId {
  return inferSkillAuditDimensionClient({
    category: f.category,
    dimension: f.dimension,
    issue: f.issue,
    evidence: f.evidence,
    location: f.location,
    triageNote: (f as { triageNote?: string }).triageNote,
  });
}

function isFormalFinding(f: SkillsMdAuditData['findings'][number]): boolean {
  const status = (f as { processingStatus?: ProcessingStatus }).processingStatus;
  if (!status) {
    return true;
  }
  return isFormalRiskStatus(status);
}

function isReviewFinding(f: SkillsMdAuditData['findings'][number]): boolean {
  const status = (f as { processingStatus?: ProcessingStatus }).processingStatus;
  return status === 'hint' || status === 'reference_sample';
}

function dispositionText(risk: string, isZh: boolean): string {
  if (risk === 'low') {
    return isZh ? '允许安装' : 'Allow install';
  }
  if (risk === 'medium') {
    return isZh ? '建议人工复核后再安装' : 'Manual review before install';
  }
  if (risk === 'high') {
    return isZh ? '限制安装，需修复高危项' : 'Restrict install; fix high-risk items';
  }
  return isZh ? '禁止安装，存在严重风险' : 'Block install; critical risks';
}

function statusMeta(overallRisk: string, formalRiskCount: number, isZh: boolean) {
  if (formalRiskCount === 0) {
    return {
      label: isZh ? '安全 · CLEAN' : 'Safe · CLEAN',
      tone: 'safe' as const,
      Icon: CheckCircle2,
    };
  }
  if (overallRisk === 'critical' || overallRisk === 'high') {
    return {
      label: isZh ? '危险 · RISK' : 'At risk · RISK',
      tone: 'danger' as const,
      Icon: ShieldX,
    };
  }
  return {
    label: isZh ? '需关注 · REVIEW' : 'Review · REVIEW',
    tone: 'warn' as const,
    Icon: ShieldAlert,
  };
}

function severityLabelZh(s: Severity): string {
  const map: Record<Severity, string> = {
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '低危',
  };
  return map[s];
}

function runStatusLabel(status: EngineRunStatus['status'], isZh: boolean): string {
  const map: Record<EngineRunStatus['status'], [string, string]> = {
    success: ['OK', '成功'],
    skipped: ['Skipped', '跳过'],
    failed: ['Failed', '失败'],
    timeout: ['Timeout', '超时'],
  };
  const [en, zh] = map[status];
  return isZh ? zh : en;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
      <span className="inline-block size-1.5 rounded-full bg-neutral-950 dark:bg-neutral-100" />
      {children}
    </h4>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <p className="text-muted-foreground mb-1.5 text-xs font-medium">{label}</p>
      <div className="text-sm text-slate-800 dark:text-slate-200">{children}</div>
    </div>
  );
}

function GroupedFindingCard({ group, isZh }: { group: GroupedFinding; isZh: boolean }) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [open, setOpen] = useState(group.hits.length > 1);

  return (
    <li className="px-4 py-3 text-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge variant={riskVariant(group.severity)}>
          {isZh ? severityLabelZh(group.severity) : group.severity}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {tr(`${group.hits.length} hit(s)`, `${group.hits.length} 处命中`)}
        </Badge>
        {group.sourceEngines.includes('llm_triage') && (
          <Badge variant="secondary" className="text-[10px]">
            {tr('LLM reviewed', 'LLM 已复审')}
          </Badge>
        )}
        {group.categories.slice(0, 3).map((cat) => (
          <Badge key={cat} variant="outline" className="text-[10px]">
            {cat}
          </Badge>
        ))}
        {group.sourceEngines.map((eng) => (
          <Badge
            key={eng}
            variant="secondary"
            className="bg-neutral-100 text-[10px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {engineLabel(eng, isZh)}
          </Badge>
        ))}
      </div>
      <p className="font-medium text-slate-900 dark:text-slate-100">{groupedTitle(group, isZh)}</p>
      {group.triageNote && (
        <p className="text-muted-foreground mt-1 text-xs italic">
          {tr('LLM review', 'LLM 复审')}: {group.triageNote}
        </p>
      )}
      {group.ruleIds.length > 0 && (
        <p className="text-muted-foreground mt-1 text-xs">
          {tr('Triggered rules', '触发规则')}: {group.ruleIds.join(', ')}
        </p>
      )}
      <p className="mt-1 text-xs">
        <strong>{tr('Recommendation', '建议')}:</strong> {groupedRecommendation(group, isZh)}
      </p>
      {group.hits.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
              {tr('Evidence locations', '证据位置')} ({group.hits.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-2 space-y-2 rounded-md border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/40">
              {group.hits.map((hit, i) => (
                <li key={`${hit.location}-${i}`} className="text-xs">
                  <p className="font-mono break-all text-slate-800 dark:text-slate-200">
                    {hit.location}
                  </p>
                  {hit.evidence && (
                    <p className="text-muted-foreground mt-0.5 break-all">{hit.evidence}</p>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  );
}

export function ScanReportPanel({
  result,
  fileName,
  strategy,
  engines,
  assetManifest,
  skillPreview,
  isZh,
  onCopyMd,
  onDownloadJson,
  onDownloadSarif,
}: ScanReportPanelProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const [expandedDims, setExpandedDims] = useState<Set<SkillAuditDimensionId>>(() => new Set());

  useEffect(() => {
    const dims = new Set<SkillAuditDimensionId>();
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      if (result.findings.some((f) => dimensionForFinding(f) === id)) {
        dims.add(id);
      }
    }
    setExpandedDims(dims);
  }, [result.findings]);

  const strategyLabel = strategy
    ? getScanStrategyMeta(strategy)[isZh ? 'labelZh' : 'labelEn']
    : undefined;

  const contentFindings = useMemo(
    () => result.findings.filter((f) => !isMetaScanFinding(f)),
    [result.findings],
  );

  const formalFindings = useMemo(() => contentFindings.filter(isFormalFinding), [contentFindings]);

  const reviewFindings = useMemo(() => contentFindings.filter(isReviewFinding), [contentFindings]);

  const { groups: groupedFormal, stats: formalStats } = useMemo(
    () => groupFindingsForDisplay(formalFindings),
    [formalFindings],
  );

  const { groups: groupedReview, stats: reviewStats } = useMemo(
    () => groupFindingsForDisplay(reviewFindings),
    [reviewFindings],
  );

  const groupedFindings = groupedFormal;
  const groupStats = formalStats;

  const countsByDimension = useMemo(() => {
    const m = new Map<SkillAuditDimensionId, number>();
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      m.set(id, 0);
    }
    for (const g of groupedFindings) {
      m.set(g.dimension, (m.get(g.dimension) ?? 0) + 1);
    }
    return m;
  }, [groupedFindings]);

  const groupsByDimension = useMemo(() => {
    const m = new Map<SkillAuditDimensionId, GroupedFinding[]>();
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      m.set(id, []);
    }
    for (const g of groupedFindings) {
      m.get(g.dimension)!.push(g);
    }
    return m;
  }, [groupedFindings]);

  const maxSeverityByDim = useMemo(() => {
    const m = new Map<SkillAuditDimensionId, Severity>();
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      const groups = groupsByDimension.get(id) ?? [];
      let top: Severity | null = null;
      for (const g of groups) {
        if (!top || SEVERITY_RANK[g.severity] > SEVERITY_RANK[top]) {
          top = g.severity;
        }
      }
      if (top) {
        m.set(id, top);
      }
    }
    return m;
  }, [groupsByDimension]);

  const metaFindings = useMemo(
    () => result.findings.filter((f) => isMetaScanFinding(f)),
    [result.findings],
  );

  const countsByEngine = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of result.findings) {
      const names = f.sourceEngines?.length ? f.sourceEngines : ['unknown'];
      for (const name of names) {
        m.set(name, (m.get(name) ?? 0) + 1);
      }
    }
    return m;
  }, [result.findings]);

  const riskCategories = useMemo(() => {
    const set = new Set<string>();
    for (const g of groupedFindings) {
      for (const cat of g.categories) {
        set.add(cat);
      }
    }
    return [...set];
  }, [groupedFindings]);

  const topRiskDimension = useMemo(() => {
    let best: SkillAuditDimensionId | undefined;
    let bestRank = 0;
    for (const id of SKILL_AUDIT_DIMENSION_IDS) {
      const n = countsByDimension.get(id) ?? 0;
      if (n === 0) {
        continue;
      }
      const sev = maxSeverityByDim.get(id);
      const rank = (sev ? SEVERITY_RANK[sev] : 0) * 100 + n;
      if (rank > bestRank) {
        bestRank = rank;
        best = id;
      }
    }
    return best;
  }, [countsByDimension, maxSeverityByDim]);

  const scannedCount = result.scannedFiles?.length ?? 0;
  const status = statusMeta(result.overallRisk, formalStats.riskTypeCount, isZh);
  const StatusIcon = status.Icon;
  const hasNetworkRisk = (countsByDimension.get('data_exfiltration') ?? 0) > 0;
  // Header badge must match formal risks (engine integrity hints must not show as high)
  const displayOverallRisk =
    formalStats.riskTypeCount === 0 ? 'low' : result.overallRisk;

  const toggleDim = (id: SkillAuditDimensionId) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const statusBoxClass =
    status.tone === 'safe'
      ? 'border-emerald-300/70 bg-emerald-50 dark:bg-emerald-950/30'
      : status.tone === 'danger'
        ? 'border-red-300/70 bg-red-50 dark:bg-red-950/30'
        : 'border-amber-300/70 bg-amber-50 dark:bg-amber-950/30';

  const statusIconClass =
    status.tone === 'safe'
      ? 'text-emerald-600'
      : status.tone === 'danger'
        ? 'text-red-600'
        : 'text-amber-600';

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      {/* ── 顶栏：名称 + 状态 ── */}
      <div className="border-b border-slate-100 px-5 py-5 dark:border-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Shield className="size-5 shrink-0 text-neutral-800 dark:text-neutral-200" />
              <h2 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
                {fileName ?? tr('Scan target', '扫描对象')}
              </h2>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {strategyLabel && (
                <Badge
                  variant="outline"
                  className="border-neutral-300 text-neutral-800 dark:border-neutral-600 dark:text-neutral-200"
                >
                  {strategyLabel}
                </Badge>
              )}
              <Badge variant="outline" className="text-muted-foreground">
                {tr('Balanced scan', '均衡模式')}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {tr('Scanned files', '已扫描文件')}: {scannedCount} · {tr('Formal risks', '正式风险')}
              : {formalStats.riskTypeCount} · {tr('Hints & references', '提示与参考')}:{' '}
              {reviewStats.riskTypeCount}
            </p>
          </div>

          <div className={`shrink-0 rounded-xl border px-5 py-4 text-center ${statusBoxClass}`}>
            <div className="flex items-center justify-center gap-2">
              <StatusIcon className={`size-5 ${statusIconClass}`} />
              <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                {status.label}
              </span>
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">
              {tr('Disposition', '处置建议')}: {dispositionText(displayOverallRisk, isZh)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCopyMd}>
            <Copy className="mr-1 size-4" />
            {tr('Export Markdown', '导出 Markdown')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownloadJson}>
            <Download className="mr-1 size-4" />
            JSON
          </Button>
          {onDownloadSarif && (
            <Button variant="outline" size="sm" onClick={onDownloadSarif}>
              SARIF
            </Button>
          )}
          {result.reportId && (
            <Button variant="default" size="sm" asChild>
              <Link to="/reports/$reportId" params={{ reportId: result.reportId }}>
                <ExternalLink className="mr-1 size-4" />
                {tr('View in Reports', '在报告中查看')}
              </Link>
            </Button>
          )}
          {result.securityScanTaskId && (result.syncedFindings ?? 0) > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/scan/remediation"
                search={{
                  tab: 'workbench',
                  taskId: result.securityScanTaskId,
                  riskId: undefined,
                }}
              >
                <ExternalLink className="mr-1 size-4" />
                {tr(
                  `Risk workbench (${result.syncedFindings})`,
                  `风险闭环 (${result.syncedFindings})`,
                )}
              </Link>
            </Button>
          )}
          {result.registryId && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/scan/capability-risks">
                <ExternalLink className="mr-1 size-4" />
                {tr('Capability components', '能力组件')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-8 px-5 py-6">
        {/* ── 1. 综合摘要 ── */}
        <section id={SCAN_REPORT_SECTION_IDS.summary} className="scroll-mt-20">
          <SectionTitle>{tr('Summary', '摘要')}</SectionTitle>
          {result.dispositionSummary && (
            <p className="text-muted-foreground mb-2 text-xs">
              {isZh ? result.dispositionSummary.summaryZh : result.dispositionSummary.summaryEn}
            </p>
          )}
          <p className="break-words rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            {result.summary}
          </p>
        </section>

        {/* ── 2. 核心特性 ── */}
        <section id={SCAN_REPORT_SECTION_IDS.core} className="scroll-mt-20">
          <SectionTitle>{tr('Core characteristics', '核心特性')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCell label={tr('Network outbound', '网络出站')}>
              {hasNetworkRisk ? (
                <span className="text-amber-700">{tr('Detected', '检测到外连行为')}</span>
              ) : (
                <span className="text-emerald-700">{tr('None', '无')}</span>
              )}
            </InfoCell>
            <InfoCell label={tr('Engines', '引擎')}>
              {(engines ?? []).length > 0 ? (
                <ul className="space-y-1">
                  {(engines ?? []).map((e) => (
                    <li key={e.engine} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{engineLabel(e.engine, isZh)}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Badge
                          variant={
                            e.status === 'success'
                              ? 'secondary'
                              : e.status === 'skipped'
                                ? 'outline'
                                : 'destructive'
                          }
                          className="h-5 px-1.5 text-[10px] font-normal"
                        >
                          {runStatusLabel(e.status, isZh)}
                        </Badge>
                        {e.status === 'success' && (
                          <span className="tabular-nums text-emerald-700">
                            {countsByEngine.get(e.engine) ?? e.findingCount}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">{tr('N/A', '暂无')}</span>
              )}
            </InfoCell>
            <InfoCell label={tr('Asset inventory', '制品清单')}>
              {assetManifest?.length ? (
                <ul className="max-h-24 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {assetManifest.slice(0, 8).map((item) => (
                    <li key={item.path} className="truncate">
                      <span className="text-muted-foreground">[{item.kind}]</span> {item.path}
                    </li>
                  ))}
                  {assetManifest.length > 8 && (
                    <li className="text-muted-foreground">+{assetManifest.length - 8} …</li>
                  )}
                </ul>
              ) : scannedCount > 0 ? (
                <span>
                  {scannedCount} {tr('files scanned', '个文件已扫描')}
                </span>
              ) : (
                <span className="text-muted-foreground">{tr('N/A', '暂无')}</span>
              )}
            </InfoCell>
            <InfoCell label={tr('Risk categories', '风险点')}>
              {riskCategories.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {riskCategories.slice(0, 6).map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="border-red-200 text-red-800 text-[10px]"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-emerald-700">{tr('None', '无')}</span>
              )}
            </InfoCell>
          </div>
        </section>

        {/* ── 3. 安全维度（ClawHub 17 维） ── */}
        <section id={SCAN_REPORT_SECTION_IDS.dimensions} className="scroll-mt-20">
          <SectionTitle>{tr('Dimensions', '安全维度')}</SectionTitle>
          <div className="space-y-4">
            <DimensionRiskBanner
              isZh={isZh}
              totalFindings={groupStats.riskTypeCount}
              evidenceHitCount={groupStats.evidenceHitCount}
              ruleHitCount={groupStats.ruleHitCount}
              topDimension={topRiskDimension}
              topSeverity={topRiskDimension ? maxSeverityByDim.get(topRiskDimension) : undefined}
            />
            <DimensionGrid
              isZh={isZh}
              counts={countsByDimension}
              maxSeverityByDim={maxSeverityByDim}
              onSelect={(id) => {
                toggleDim(id);
                document.getElementById(SCAN_REPORT_SECTION_IDS.findings)?.scrollIntoView({
                  behavior: 'smooth',
                });
                if ((countsByDimension.get(id) ?? 0) > 0) {
                  setExpandedDims((prev) => new Set(prev).add(id));
                }
              }}
            />
          </div>
        </section>

        {/* ── 4. 风险评估（按维度分组） ── */}
        <section id={SCAN_REPORT_SECTION_IDS.findings} className="scroll-mt-20">
          <SectionTitle>
            {tr('Formal risks', '正式风险')}
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              ({formalStats.riskTypeCount} {tr('types', '类')} / {formalStats.evidenceHitCount}{' '}
              {tr('hits', '处')})
            </span>
          </SectionTitle>

          {formalFindings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tr('No formal risks.', '暂无正式风险项。')}
            </p>
          ) : (
            <div className="space-y-3">
              {metaFindings.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {tr('Scan integrity', '扫描完整性')}
                    </span>
                    <Badge variant="outline" className="ml-2 text-xs">
                      {metaFindings.length}
                    </Badge>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {metaFindings.map((f, i) => (
                      <li key={`meta-${f.location}-${i}`} className="px-4 py-3 text-sm">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant={riskVariant(f.severity)}>
                            {isZh ? severityLabelZh(f.severity) : f.severity}
                          </Badge>
                          <Badge variant="outline">{f.category}</Badge>
                          {(f.sourceEngines ?? []).map((eng) => (
                            <Badge key={eng} variant="secondary" className="text-[10px]">
                              {engineLabel(eng, isZh)}
                            </Badge>
                          ))}
                        </div>
                        <p className="font-medium">{f.issue}</p>
                        <p className="text-muted-foreground mt-1 break-all font-mono text-xs">
                          {f.location}
                        </p>
                        <p className="text-muted-foreground mt-2 text-xs">{f.evidence}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {SKILL_AUDIT_DIMENSION_IDS.map((id) => {
                const groups = groupsByDimension.get(id) ?? [];
                if (groups.length === 0) {
                  return null;
                }
                const open = expandedDims.has(id);
                let top: Severity | null = null;
                for (const g of groups) {
                  if (!top || SEVERITY_RANK[g.severity] > SEVERITY_RANK[top]) {
                    top = g.severity;
                  }
                }
                const hitTotal = groups.reduce((sum, g) => sum + g.hits.length, 0);
                return (
                  <Collapsible key={id} open={open} onOpenChange={() => toggleDim(id)}>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="hover:bg-slate-50/80 flex w-full items-center justify-between gap-3 px-4 py-3 text-left dark:hover:bg-slate-800/40"
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <AlertTriangle className="size-4 shrink-0 text-red-500" />
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {dimensionLabel(id, isZh)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {groups.length} {tr('types', '类')}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {hitTotal} {tr('hits', '处')}
                            </Badge>
                            {top && (
                              <Badge variant={riskVariant(top)} className="text-xs">
                                {isZh ? severityLabelZh(top) : top}
                              </Badge>
                            )}
                          </div>
                          <ChevronDown
                            className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                          {groups.map((group) => (
                            <GroupedFindingCard key={group.groupKey} group={group} isZh={isZh} />
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </section>

        {reviewFindings.length > 0 && (
          <section id="scan-report-review" className="scroll-mt-20">
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="hover:bg-slate-50/80 flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left dark:border-slate-700 dark:hover:bg-slate-800/40"
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {tr('Hints & references', '提示与参考')}
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      ({reviewStats.riskTypeCount} {tr('types', '类')} /{' '}
                      {reviewStats.evidenceHitCount} {tr('hits', '处')})
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="divide-y divide-slate-100 mt-2 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {groupedReview.map((group) => (
                    <GroupedFindingCard key={group.groupKey} group={group} isZh={isZh} />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </section>
        )}

        {/* ── 5. 处置建议 ── */}
        {result.recommendations.length > 0 && (
          <section id={SCAN_REPORT_SECTION_IDS.recommendations} className="scroll-mt-20">
            <SectionTitle>{tr('Recommendations', '处置建议')}</SectionTitle>
            <ul className="space-y-2">
              {result.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
                >
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {skillPreview && skillPreview.files.length > 0 && (
          <section id={SCAN_REPORT_SECTION_IDS.skillContent} className="scroll-mt-20">
            <SectionTitle>{tr('Skill content', 'Skill 内容')}</SectionTitle>
            <SkillContentPreview preview={skillPreview} isZh={isZh} />
          </section>
        )}
      </div>
    </div>
  );
}
