/**
 * Pure metrics for Security Cockpit — all values derived from live API payloads.
 */

import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import type {
  AgentAsset,
  DashboardStats,
  SecurityRemediationTask,
  SecurityScanFinding,
  SecurityScanTask,
} from '@/types/entities';
import {
  buildPatrolRows,
  computePatrolSummaryMetrics,
} from '@/features/launch-monitoring/patrol-metrics';
import {
  enrichRemediationRows,
  filterClosedLoopProductionRows,
  isClosedDisplayStatus,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { computeSecurityScore, type SecurityScoreBand } from './security-score';

export type CockpitRange = '7d' | '30d' | '90d';

export type CockpitTone = 'ok' | 'warn' | 'danger';

export type CockpitFlowStep = {
  idx: number;
  titleZh: string;
  titleEn: string;
  count: number;
  subZh: string;
  subEn: string;
  tone: CockpitTone;
  route:
    | 'discovered'
    | 'detect'
    | 'remediation'
    | 'launch'
    | 'audit';
};

export type CockpitMgmtKpi = {
  key: string;
  labelZh: string;
  labelEn: string;
  value: number;
  subZh: string;
  subEn: string;
  danger?: boolean;
};

export type CockpitAssetKpi = {
  key: string;
  titleZh: string;
  titleEn: string;
  value: number;
  subZh: string;
  subEn: string;
  tone?: 'warn' | 'danger';
};

export type CockpitDeptBar = {
  short: string;
  dept: string;
  index: number;
  hot: boolean;
};

export type CockpitCoverCell = {
  label: string;
  total: number;
  detected: number;
  undetected: number;
  coverage: number;
  tone: 'ok' | 'warn' | 'fail';
};

export type CockpitAlert = {
  id: string;
  hot: boolean;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  timeZh: string;
  timeEn: string;
};

export type CockpitHighRiskAgent = {
  id: string;
  assetId?: string;
  name: string;
  dept: string;
  level: 'critical' | 'high' | 'medium' | 'low';
  open: number;
  admission: string;
  rate: string;
};

export type CockpitRiskMix = {
  criticalHighPct: number;
  mediumPct: number;
  lowPct: number;
  otherPct: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export type CockpitModel = {
  score: number;
  band: SecurityScoreBand;
  actionable: number;
  flowSteps: CockpitFlowStep[];
  mgmtKpis: CockpitMgmtKpi[];
  assetKpis: CockpitAssetKpi[];
  riskMix: CockpitRiskMix;
  deptRisk: CockpitDeptBar[];
  coverage: CockpitCoverCell[];
  alerts: CockpitAlert[];
  highRiskAgents: CockpitHighRiskAgent[];
  recentFindings: DashboardStats['recentHighRiskFindings'];
};

const PASSED_ADMISSION = new Set(['passed', 'conditional_passed']);
const HIGH_RISK = new Set(['critical', 'high']);

const RANGE_DAYS: Record<CockpitRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export type CockpitRawInput = {
  range: CockpitRange;
  stats?: DashboardStats | null;
  assets: AgentAsset[];
  discoveredPending: number;
  remediations: SecurityRemediationTask[];
  findings: SecurityScanFinding[];
  scanTasks: SecurityScanTask[];
  locale?: string;
};

function rangeStart(range: CockpitRange): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  return d;
}

function inRange(iso: string | null | undefined, since: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= since.getTime();
}

export function assetDepartment(asset: AgentAsset): string {
  return (
    asset.owners?.find((o) => o.ownerType === 'business')?.department ||
    asset.owners?.find((o) => o.isPrimary)?.department ||
    asset.owners?.[0]?.department ||
    asset.businessSystem ||
    '未分组'
  );
}

function shortDept(dept: string): string {
  const cleaned = dept.replace(/部$|中心$|事业部$/, '').trim();
  if (cleaned.length <= 4) return cleaned || dept.slice(0, 4);
  return cleaned.slice(-4);
}

function admissionLabel(status: string, isZh: boolean): string {
  const map: Record<string, [string, string]> = {
    passed: ['通过', 'Passed'],
    conditional_passed: ['条件通过', 'Conditional'],
    failed: ['需整改', 'Failed'],
    retest: ['待复测', 'Retest'],
    checking: ['检测中', 'Checking'],
    not_checked: ['未检测', 'Not checked'],
    blocked: ['阻塞', 'Blocked'],
  };
  const pair = map[status] || [status || '—', status || '—'];
  return isZh ? pair[0] : pair[1];
}

function levelRank(level: string): number {
  if (level === 'critical') return 0;
  if (level === 'high') return 1;
  if (level === 'medium') return 2;
  return 3;
}

function isOverdue(dueAt?: string | null): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

function relativeTime(iso: string, isZh: boolean): { zh: string; en: string } {
  try {
    const zh = formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN });
    const en = formatDistanceToNow(new Date(iso), { addSuffix: true, locale: enUS });
    return { zh, en };
  } catch {
    return { zh: isZh ? '刚刚' : 'just now', en: 'just now' };
  }
}

export function buildCockpitModel(input: CockpitRawInput): CockpitModel {
  const {
    range,
    stats,
    assets,
    discoveredPending,
    remediations,
    findings,
    scanTasks,
  } = input;
  const since = rangeStart(range);
  const isZh = true;

  // Align with the Risk Closed-loop page: only count real, pushed remediation items
  // (exclude scan-execution / seeded rows) so overview numbers match that page.
  const enriched = filterClosedLoopProductionRows(
    enrichRemediationRows(remediations, findings, scanTasks),
  );
  const openRows = enriched.filter((r) => !isClosedDisplayStatus(r.displayStatus));
  const openLow = openRows.filter((r) => r.riskLevel === 'low').length;
  const closedInRange = enriched.filter(
    (r) =>
      (r.displayStatus === 'closed' || r.displayStatus === 'risk_accepted') &&
      inRange(r.closedAt || r.updatedAt, since),
  );
  const openCritical = openRows.filter((r) => r.riskLevel === 'critical').length;
  const openHigh = openRows.filter((r) => r.riskLevel === 'high').length;
  const openMedium = openRows.filter((r) => r.riskLevel === 'medium').length;
  const overdueRemediations = openRows.filter((r) => isOverdue(r.dueAt)).length;

  const pendingAdmissionAssets = assets.filter(
    (a) => !PASSED_ADMISSION.has(a.admissionStatus),
  );
  const highRiskAssets = assets.filter((a) => HIGH_RISK.has(a.riskLevel));
  const managedAgents = assets.length || stats?.activeAgents || 0;

  const detectedAssetIds = new Set(
    scanTasks
      .filter((t) => t.status === 'completed' || t.status === 'blocked')
      .map((t) => t.assetId)
      .filter((id): id is string => Boolean(id)),
  );
  const undetectedAssets = assets.filter((a) => !detectedAssetIds.has(a.id));

  const runningScans = scanTasks.filter((t) => t.status === 'running' || t.status === 'pending')
    .length;
  const detectRunning = Math.max(runningScans, stats?.runningTasks ?? 0);
  const completedInRange = scanTasks.filter(
    (t) => t.status === 'completed' && inRange(t.completedAt || t.updatedAt, since),
  ).length;

  const patrolRows = buildPatrolRows(scanTasks, assets, findings);
  const patrol = computePatrolSummaryMetrics(patrolRows);
  const launchAttention = patrol.dueToday + patrol.failedPlans + patrol.recurrenceRisks;

  const pendingReports = scanTasks.filter(
    (t) =>
      t.status === 'completed' &&
      !t.metadata?.archived &&
      (t.highCount > 0 || t.mediumCount > 0),
  ).length;

  const passedAdmissionInRange = assets.filter(
    (a) =>
      PASSED_ADMISSION.has(a.admissionStatus) && inRange(a.updatedAt, since),
  ).length;
  const blockedAdmission = assets.filter((a) => a.admissionStatus === 'failed').length;
  const reviewingAdmission = assets.filter((a) =>
    ['checking', 'retest', 'not_checked'].includes(a.admissionStatus),
  ).length;

  const closeRate =
    enriched.length === 0
      ? 0
      : Math.round(
          ((enriched.length - openRows.length) / Math.max(enriched.length, 1)) * 100,
        );

  const { score, band } = computeSecurityScore({
    totalAgents: managedAgents,
    highRiskAgents: highRiskAssets.length,
    openCritical,
    openHigh,
    openMedium,
    overdueRemediations,
    pendingIntake: discoveredPending,
    undetectedAgents: undetectedAssets.length,
  });

  // overdueRemediations is a subset of openRows, so it must not be added again here.
  const actionable =
    discoveredPending +
    openRows.length +
    patrol.dueToday +
    pendingAdmissionAssets.length;

  const flowSteps: CockpitFlowStep[] = [
    {
      idx: 1,
      titleZh: '资产入库',
      titleEn: 'Asset intake',
      count: discoveredPending,
      subZh: `待入库 ${discoveredPending} · 已纳管 ${managedAgents}`,
      subEn: `${discoveredPending} pending · ${managedAgents} managed`,
      tone: discoveredPending > 0 ? 'warn' : 'ok',
      route: 'discovered',
    },
    {
      idx: 2,
      titleZh: '检测扫描',
      titleEn: 'Detection',
      count: detectRunning,
      subZh: `进行中 ${detectRunning} · 本周期完成 ${completedInRange}`,
      subEn: `${detectRunning} running · ${completedInRange} done in period`,
      tone: detectRunning > 0 ? 'warn' : 'ok',
      route: 'detect',
    },
    {
      idx: 3,
      titleZh: '风险整改',
      titleEn: 'Remediation',
      count: openRows.length,
      subZh: `未关闭 ${openRows.length} · P0 ${openCritical} · P1 ${openHigh}`,
      subEn: `${openRows.length} open · P0 ${openCritical} · P1 ${openHigh}`,
      tone: openRows.length > 0 ? 'danger' : 'ok',
      route: 'remediation',
    },
    {
      idx: 4,
      titleZh: '上线观测',
      titleEn: 'Launch monitor',
      count: launchAttention,
      subZh: `今日到期 ${patrol.dueToday} · 异常 ${patrol.failedPlans}`,
      subEn: `due today ${patrol.dueToday} · issues ${patrol.failedPlans}`,
      tone: launchAttention > 0 ? 'warn' : 'ok',
      route: 'launch',
    },
    {
      idx: 5,
      titleZh: '报告审计',
      titleEn: 'Audit reports',
      count: pendingReports,
      subZh: '技术风险 / 合规 / 复测报告',
      subEn: 'Tech / compliance / retest reports',
      tone: pendingReports > 0 ? 'warn' : 'ok',
      route: 'audit',
    },
  ];

  const mgmtKpis: CockpitMgmtKpi[] = [
    {
      key: 'admission',
      labelZh: '准入通过',
      labelEn: 'Admissions passed',
      value: passedAdmissionInRange,
      subZh: `阻塞 ${blockedAdmission} · 评审中 ${reviewingAdmission}`,
      subEn: `${blockedAdmission} blocked · ${reviewingAdmission} in review`,
    },
    {
      key: 'closed',
      labelZh: '整改关闭',
      labelEn: 'Risks closed',
      value: closedInRange.length,
      subZh: `关闭率 ${closeRate}% · 未关闭 ${openRows.length}`,
      subEn: `${closeRate}% close rate · ${openRows.length} open`,
    },
    {
      key: 'detect',
      labelZh: '检测执行',
      labelEn: 'Detections run',
      value: completedInRange,
      subZh: `进行中 ${detectRunning} · 失败 ${stats?.failedTasks ?? 0}`,
      subEn: `${detectRunning} running · ${stats?.failedTasks ?? 0} failed`,
    },
    {
      key: 'overdue',
      labelZh: '巡检超期',
      labelEn: 'Patrol overdue',
      value: patrol.dueToday + overdueRemediations,
      subZh:
        overdueRemediations > 0
          ? `整改超期 ${overdueRemediations} · 今日巡检 ${patrol.dueToday}`
          : `今日巡检 ${patrol.dueToday} · 需立即跟进`,
      subEn: `${overdueRemediations} rem overdue · ${patrol.dueToday} patrol due`,
      danger: patrol.dueToday + overdueRemediations > 0,
    },
  ];

  const assetKpis: CockpitAssetKpi[] = [
    {
      key: 'managed',
      titleZh: '纳管 Agent',
      titleEn: 'Managed agents',
      value: managedAgents,
      subZh: `登记入台账 · 未检测完 ${undetectedAssets.length}`,
      subEn: `In ledger · ${undetectedAssets.length} undetected`,
    },
    {
      key: 'pendingAdmission',
      titleZh: '待准入',
      titleEn: 'Pending admission',
      value: pendingAdmissionAssets.length,
      subZh: `评审中 ${reviewingAdmission} · 待入库 ${discoveredPending}`,
      subEn: `${reviewingAdmission} review · ${discoveredPending} inbox`,
      tone: pendingAdmissionAssets.length > 0 ? 'warn' : undefined,
    },
    {
      key: 'highRisk',
      titleZh: '高风险 Agent',
      titleEn: 'High-risk agents',
      value: highRiskAssets.length,
      subZh: `严重 ${assets.filter((a) => a.riskLevel === 'critical').length} · 高危 ${assets.filter((a) => a.riskLevel === 'high').length}`,
      subEn: `critical ${assets.filter((a) => a.riskLevel === 'critical').length} · high ${assets.filter((a) => a.riskLevel === 'high').length}`,
      tone: highRiskAssets.length > 0 ? 'danger' : undefined,
    },
    {
      key: 'openRem',
      titleZh: '未完成整改',
      titleEn: 'Open remediations',
      value: openRows.length,
      subZh: `超期 ${overdueRemediations} · 任务失败 ${stats?.failedTasks ?? 0}`,
      subEn: `${overdueRemediations} overdue · ${stats?.failedTasks ?? 0} failed tasks`,
      tone: openRows.length > 0 ? 'danger' : undefined,
    },
  ];

  // Risk distribution is driven by the same open remediation rows the overview counts,
  // so "high risks" can never exceed "open remediations" and matches the Risk page.
  // Fall back to open scan findings, then dashboard stats, only when no open rows exist.
  const openFindings = findings.filter((f) => f.status === 'open');
  const hasOpenRows = openRows.length > 0;
  const hasFindingData = openFindings.length > 0;
  const critical = hasOpenRows
    ? openCritical
    : hasFindingData
      ? openFindings.filter((f) => f.riskLevel === 'critical').length
      : (stats?.criticalVulnerabilities ?? 0);
  const high = hasOpenRows
    ? openHigh
    : hasFindingData
      ? openFindings.filter((f) => f.riskLevel === 'high').length
      : (stats?.highVulnerabilities ?? 0);
  const medium = hasOpenRows
    ? openMedium
    : hasFindingData
      ? openFindings.filter((f) => f.riskLevel === 'medium').length
      : (stats?.mediumVulnerabilities ?? 0);
  const low = hasOpenRows
    ? openLow
    : hasFindingData
      ? openFindings.filter((f) => f.riskLevel === 'low').length
      : (stats?.lowVulnerabilities ?? 0);
  const riskTotal = Math.max(critical + high + medium + low, 1);
  const criticalHighPct = Math.round(((critical + high) / riskTotal) * 100);
  const mediumPct = Math.round((medium / riskTotal) * 100);
  const lowPct = Math.round((low / riskTotal) * 100);
  const otherPct = Math.max(0, 100 - criticalHighPct - mediumPct - lowPct);
  const riskMix: CockpitRiskMix = {
    criticalHighPct,
    mediumPct,
    lowPct,
    otherPct,
    critical,
    high,
    medium,
    low,
  };

  // Department risk index
  const deptMap = new Map<
    string,
    { open: number; overdue: number; uncovered: number; agents: number }
  >();
  for (const asset of assets) {
    const dept = assetDepartment(asset);
    const cur = deptMap.get(dept) || { open: 0, overdue: 0, uncovered: 0, agents: 0 };
    cur.agents += 1;
    if (!detectedAssetIds.has(asset.id)) cur.uncovered += 1;
    deptMap.set(dept, cur);
  }
  for (const row of openRows) {
    const asset = assets.find((a) => a.id === row.assetId);
    const dept = asset ? assetDepartment(asset) : row.department || '未分组';
    const cur = deptMap.get(dept) || { open: 0, overdue: 0, uncovered: 0, agents: 0 };
    cur.open += 1;
    if (isOverdue(row.dueAt)) cur.overdue += 1;
    deptMap.set(dept, cur);
  }
  const deptRisk: CockpitDeptBar[] = [...deptMap.entries()]
    .map(([dept, v]) => {
      const index = Math.min(
        100,
        Math.round(v.open * 12 + v.overdue * 8 + v.uncovered * 6 + (v.agents === 0 ? 0 : 0)),
      );
      return {
        short: shortDept(dept),
        dept,
        index: Math.max(index, v.open > 0 || v.uncovered > 0 ? Math.min(100, 10 + index) : 0),
        hot: index >= 60 || v.overdue > 0,
      };
    })
    .filter((d) => d.index > 0 || d.dept !== '未分组')
    .sort((a, b) => b.index - a.index)
    .slice(0, 5);

  // Coverage by department — skip empty / unlabeled buckets
  const coverage: CockpitCoverCell[] = [...deptMap.entries()]
    .filter(([dept, v]) => v.agents > 0 && dept !== '未分组' && dept !== '—')
    .map(([dept, v]) => {
      const detected = Math.max(0, v.agents - v.uncovered);
      const coveragePct = v.agents === 0 ? 0 : Math.round((detected / v.agents) * 100);
      const tone: CockpitCoverCell['tone'] =
        coveragePct >= 90 ? 'ok' : coveragePct >= 50 ? 'warn' : 'fail';
      return {
        label: shortDept(dept),
        total: v.agents,
        detected,
        undetected: v.uncovered,
        coverage: coveragePct,
        tone,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Alerts
  const alerts: CockpitAlert[] = [];
  for (const row of openRows
    .filter((r) => HIGH_RISK.has(r.riskLevel) || isOverdue(r.dueAt))
    .slice(0, 3)) {
    const asset = assets.find((a) => a.id === row.assetId);
    const name = asset?.name || row.agentName || 'Agent';
    const time = relativeTime(row.updatedAt, isZh);
    alerts.push({
      id: row.id,
      hot: row.riskLevel === 'critical' || isOverdue(row.dueAt),
      titleZh: `${name} · ${row.riskLevel === 'critical' ? '严重风险未关闭' : '高风险待整改'}`,
      titleEn: `${name} · open ${row.riskLevel} risk`,
      descZh: `${row.title.slice(0, 48)}${row.title.length > 48 ? '…' : ''}${isOverdue(row.dueAt) ? ' · 已超安全处理时限' : ''}`,
      descEn: `${row.title.slice(0, 48)}${isOverdue(row.dueAt) ? ' · past SLA' : ''}`,
      timeZh: time.zh,
      timeEn: time.en,
    });
  }
  if (discoveredPending > 0 && alerts.length < 3) {
    alerts.push({
      id: 'inbox',
      hot: false,
      titleZh: `资产入库待认领 ${discoveredPending} 项`,
      titleEn: `${discoveredPending} discovered assets pending claim`,
      descZh: '新发现资产待纳入台账 · 建议尽快认领并启动检测',
      descEn: 'Claim discovered assets and start detection',
      timeZh: '刚刚',
      timeEn: 'just now',
    });
  }
  if (patrol.failedPlans > 0 && alerts.length < 3) {
    const bad = patrolRows.find((r) => r.openFindings.length > 0);
    alerts.push({
      id: 'patrol',
      hot: true,
      titleZh: `${bad?.asset?.name || '巡检任务'} · 巡检异常`,
      titleEn: `${bad?.asset?.name || 'Patrol'} · patrol issue`,
      descZh: `${patrol.failedPlans} 个计划异常 · ${patrol.recurrenceRisks} 个复发风险`,
      descEn: `${patrol.failedPlans} plan issues · ${patrol.recurrenceRisks} recurrence`,
      timeZh: '今日',
      timeEn: 'today',
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: 'clear',
      hot: false,
      titleZh: '暂无紧急预警',
      titleEn: 'No urgent alerts',
      descZh: '当前无超期整改或阻塞准入事项',
      descEn: 'No overdue remediations or blocked admissions',
      timeZh: '—',
      timeEn: '—',
    });
  }

  // High-risk agent ranking
  const byAsset = new Map<string, { open: number; worst: string }>();
  for (const row of openRows) {
    const id = row.assetId || row.agentName || row.id;
    const cur = byAsset.get(id) || { open: 0, worst: 'low' };
    cur.open += 1;
    if (levelRank(row.riskLevel) < levelRank(cur.worst)) cur.worst = row.riskLevel;
    byAsset.set(id, cur);
  }
  // Also include assets marked high/critical even without remediations
  for (const asset of highRiskAssets) {
    if (!byAsset.has(asset.id)) {
      byAsset.set(asset.id, { open: 0, worst: asset.riskLevel });
    }
  }
  const highRiskAgents: CockpitHighRiskAgent[] = [...byAsset.entries()]
    .map(([id, v]) => {
      const asset = assets.find((a) => a.id === id);
      const open = v.open;
      const ratePct = Math.max(
        5,
        Math.min(95, 100 - open * 8 - (v.worst === 'critical' ? 20 : 0)),
      );
      const level = (['critical', 'high', 'medium', 'low'].includes(v.worst)
        ? v.worst
        : 'high') as CockpitHighRiskAgent['level'];
      return {
        row: {
          id: asset?.assetCode || asset?.id || id,
          assetId: asset?.id,
          name: asset?.name || id,
          dept: asset ? assetDepartment(asset) : '—',
          level,
          open,
          admission: asset?.admissionStatus || 'not_checked',
          rate: `${ratePct}%`,
        },
        sort: levelRank(v.worst) * 1000 - open,
      };
    })
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 8)
    .map((x) => x.row);

  const recentFindings =
    stats?.recentHighRiskFindings?.length
      ? stats.recentHighRiskFindings
      : findings
          .filter((f) => f.status === 'open' && HIGH_RISK.has(f.riskLevel))
          .slice(0, 8)
          .map((f) => ({
            id: f.id,
            vulnerabilityId: f.id,
            vulnerabilityName: f.title,
            agentId: f.assetId || '',
            agentName:
              assets.find((a) => a.id === f.assetId)?.name ||
              scanTasks.find((t) => t.id === f.taskId)?.assetName ||
              '—',
            riskLevel: f.riskLevel as 'critical' | 'high' | 'medium' | 'low',
            detectedAt: f.detectedAt || f.createdAt,
          }));

  return {
    score,
    band,
    actionable,
    flowSteps,
    mgmtKpis,
    assetKpis,
    riskMix,
    deptRisk,
    coverage,
    alerts,
    highRiskAgents,
    recentFindings,
  };
}

export { admissionLabel };
