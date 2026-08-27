import type { ComplianceScanStatus } from '@/features/compliance-detection/compliance-task-shared';
import type {
  ComplianceCaseExecutionResult,
  ComplianceReportPreview,
} from './compliance-report-types';

export function computeComplianceScore(summary: ComplianceReportPreview['summary']): number {
  if (summary.total <= 0) {
    return 0;
  }
  const baseScore = (summary.compliant / summary.total) * 100;
  const penalty = summary.high * 8 + summary.medium * 4 + summary.low * 2;
  return Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
}

export type ComplianceDetailTab = 0 | 1 | 2 | 3 | 4;

export type ComplianceDetailPanel = 'overview' | 'cases' | 'violations' | 'full' | 'stats' | 'push';

export function panelToTab(panel: ComplianceDetailPanel): ComplianceDetailTab {
  if (panel === 'cases') {
    return 3;
  }
  if (panel === 'violations') {
    return 2;
  }
  if (panel === 'stats') {
    return 1;
  }
  if (panel === 'push') {
    return 4;
  }
  return 0;
}

export type TaskDetailStats = {
  total: number;
  pass: number;
  fail: number;
  pending: number;
  review: number;
};

export type LibraryStatGroup = {
  libraryId: string;
  title: string;
  domain?: string;
  planned: number;
  exec: number;
  pass: number;
  fail: number;
  pending: number;
};

export type ConclusionMeta = {
  pill: string;
  pillCls: 'red' | 'orange' | 'green' | 'blue' | 'gray';
  title: string;
  desc: string;
  actions: Array<{ tab: ComplianceDetailTab; label: string }>;
};

export type ScoreMeta = {
  score: number | string;
  ringPct: number;
  ringColor: string;
  sub: string;
};

const DEFAULT_PASS_THRESHOLD = 95;

export function readCompliancePassRateThreshold(
  report: ComplianceReportPreview | undefined,
): number {
  const raw = report?.passRateThreshold;
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(100, Math.max(1, raw))
    : DEFAULT_PASS_THRESHOLD;
}

export function computeTaskDetailStats(
  report: ComplianceReportPreview | undefined,
  taskStatus: ComplianceScanStatus,
): TaskDetailStats {
  if (!report) {
    if (taskStatus === 'pending') {
      return { total: 0, pass: 0, fail: 0, pending: 0, review: 0 };
    }
    return { total: 0, pass: 0, fail: 0, pending: 0, review: 0 };
  }
  const executed = report.items.filter((item) => item.executionStatus !== 'skipped');
  if (taskStatus === 'pending') {
    return {
      total: report.summary.total || executed.length,
      pass: 0,
      fail: 0,
      pending: report.summary.total || executed.length,
      review: 0,
    };
  }
  if (taskStatus === 'running') {
    const done = executed.length;
    const total = Math.max(report.summary.total, done);
    return {
      total,
      pass: report.summary.compliant,
      fail: report.summary.violation,
      pending: Math.max(0, total - done),
      review: 0,
    };
  }
  return {
    total: report.summary.total,
    pass: report.summary.compliant,
    fail: report.summary.violation,
    pending: 0,
    review: 0,
  };
}

export function groupLibraryStats(report: ComplianceReportPreview | undefined): LibraryStatGroup[] {
  if (!report) {
    return [];
  }
  const map = new Map<string, LibraryStatGroup>();
  for (const lib of report.libraries) {
    map.set(lib.id, {
      libraryId: lib.id,
      title: lib.title,
      domain: report.domain,
      planned: lib.caseCount ?? 0,
      exec: 0,
      pass: 0,
      fail: 0,
      pending: 0,
    });
  }
  for (const item of report.items) {
    const key = item.libraryId || item.libraryTitle || 'unknown';
    if (!map.has(key)) {
      map.set(key, {
        libraryId: key,
        title: item.libraryTitle || '未命名控制库',
        domain: report.domain,
        planned: 0,
        exec: 0,
        pass: 0,
        fail: 0,
        pending: 0,
      });
    }
    const group = map.get(key)!;
    if (item.executionStatus === 'skipped') {
      group.pending += 1;
      continue;
    }
    group.exec += 1;
    if (item.passed) {
      group.pass += 1;
    } else {
      group.fail += 1;
    }
  }
  for (const group of map.values()) {
    if (group.planned < group.exec + group.pending) {
      group.planned = group.exec + group.pending;
    }
    if (group.planned === 0) {
      group.planned = group.exec + group.pending;
    }
  }
  return [...map.values()];
}

export function computeConclusionMeta(
  report: ComplianceReportPreview | undefined,
  stats: TaskDetailStats,
  taskStatus: ComplianceScanStatus,
  progress = 0,
): ConclusionMeta {
  if (taskStatus === 'pending') {
    return {
      pill: '待执行',
      pillCls: 'gray',
      title: '任务已创建 · 等待执行',
      desc: `共计划 ${stats.total || '—'} 条测试用例，执行前可从合规控制库确认范围与样本类型。`,
      actions: [
        { tab: 3, label: '查看计划测试用例' },
        { tab: 0, label: '查看任务总览' },
      ],
    };
  }
  if (taskStatus === 'running') {
    return {
      pill: `检测中 · ${progress}%`,
      pillCls: 'blue',
      title: '合规评估执行中',
      desc: `已完成 ${stats.pass + stats.fail} / ${stats.total} 条测试用例（合规 ${stats.pass} · 违规 ${stats.fail} · 待执行 ${stats.pending}）。`,
      actions: [
        { tab: 3, label: '查看测试用例明细' },
        { tab: 1, label: '查看合规风险通过统计' },
      ],
    };
  }
  if (taskStatus === 'canceled' || taskStatus === 'blocked') {
    const noExecutedCases = stats.pass + stats.fail === 0;
    return {
      pill: taskStatus === 'blocked' ? '已阻塞' : '已取消',
      pillCls: 'red',
      title: noExecutedCases ? '合规用例未执行 · 缺少运行配置' : '合规评估未能正常完成',
      desc: noExecutedCases
        ? '本次计划用例没有产生 Agent 调用结果，请补全 Agent API / webhook 等运行配置后重新运行。'
        : '请检查 Agent 联通性与任务配置后重新运行。',
      actions: [
        { tab: 1, label: '查看未执行控制库' },
        { tab: 3, label: '查看测试用例明细' },
      ],
    };
  }
  if (!report) {
    return {
      pill: '暂无报告',
      pillCls: 'gray',
      title: '任务尚未产生报告数据',
      desc: '请先运行合规评估。',
      actions: [],
    };
  }
  const fail = stats.fail;
  const passRate = computePassRate(stats);
  const threshold = readCompliancePassRateThreshold(report);
  if (passRate < threshold) {
    return {
      pill: '综合结论：不建议通过',
      pillCls: 'red',
      title: '合规通过率未达标',
      desc: `本次共执行 ${stats.pass + stats.fail} 条测试用例，合规通过率 ${passRate}%（阈值 ${threshold}%）。违规 ${fail} 项需纳入整改跟踪。`,
      actions: [
        { tab: 2, label: '查看风险发现' },
        { tab: 3, label: '查看测试用例明细' },
      ],
    };
  }
  return {
    pill: '综合结论：建议通过',
    pillCls: 'green',
    title: '合规评估达标 · 可作为准入依据',
    desc: `共执行 ${stats.pass + stats.fail} 条测试用例，当前评估范围内未发现阻塞性违规。`,
    actions: [
      { tab: 0, label: '查看任务总览' },
      { tab: 3, label: '查看测试用例明细' },
    ],
  };
}

export function computeScoreMeta(
  report: ComplianceReportPreview | undefined,
  stats: TaskDetailStats,
  taskStatus: ComplianceScanStatus,
  progress = 0,
): ScoreMeta {
  if (taskStatus === 'pending') {
    return { score: '—', ringPct: 0, ringColor: '#e5e7eb', sub: '任务尚未执行' };
  }
  if (taskStatus === 'running') {
    const ringPct =
      progress ||
      Math.min(100, Math.round(((stats.pass + stats.fail) / Math.max(1, stats.total)) * 100));
    return {
      score: Math.max(1, Math.round(ringPct * 0.6)),
      ringPct,
      ringColor: '#2563eb',
      sub: `评估进度 ${ringPct}% · 结论待生成`,
    };
  }
  if (taskStatus === 'blocked') {
    return {
      score: 0,
      ringPct: 0,
      ringColor: '#ef4444',
      sub: '用例未执行 · 请检查 Agent 运行配置',
    };
  }
  if (!report || stats.total === 0) {
    return { score: 0, ringPct: 0, ringColor: '#e5e7eb', sub: '暂无评分' };
  }
  const score = computeComplianceScore(report.summary);
  const ringColor =
    score >= readCompliancePassRateThreshold(report)
      ? '#16a34a'
      : score >= 80
        ? '#2563eb'
        : score >= 60
          ? '#e58b20'
          : '#ef4444';
  return {
    score,
    ringPct: score,
    ringColor,
    sub: stats.fail > 0 ? `存在 ${stats.fail} 项违规 · 合规评分已降级` : '合规控制项综合评估',
  };
}

export function computePassRate(stats: TaskDetailStats): number {
  const exec = stats.pass + stats.fail;
  return exec > 0 ? Math.round((stats.pass / exec) * 100) : 0;
}

export function libraryPassRate(group: LibraryStatGroup): number {
  return group.exec > 0 ? Math.round((group.pass / group.exec) * 100) : 0;
}

export function libraryPassed(group: LibraryStatGroup, threshold = DEFAULT_PASS_THRESHOLD): boolean {
  const rate = libraryPassRate(group);
  return group.exec > 0 && rate >= threshold;
}

export function filterCaseItems(
  items: ComplianceCaseExecutionResult[],
  search: string,
  statusFilter: '' | 'pass' | 'fail',
): ComplianceCaseExecutionResult[] {
  const keyword = search.trim().toLowerCase();
  return items.filter((item) => {
    if (statusFilter === 'pass' && !item.passed) {
      return false;
    }
    if (statusFilter === 'fail' && item.passed) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const haystack = [
      item.caseName,
      item.caseCode,
      item.inputSummary,
      item.prompt,
      item.expectedFail,
      item.expectedPass,
      item.outputSnippet,
      item.regClause,
      item.libraryTitle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
  };
}

export function formatTaskDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) {
    return '—';
  }
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return '—';
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

export const COMPLIANCE_DETAIL_TABS: Array<{
  label: string;
  countKey?: 'libraries' | 'violations' | 'total';
}> = [
  { label: '任务总览' },
  { label: '合规风险通过统计', countKey: 'libraries' },
  { label: '风险发现', countKey: 'violations' },
  { label: '测试用例明细', countKey: 'total' },
  { label: '推送到风险闭环' },
];
