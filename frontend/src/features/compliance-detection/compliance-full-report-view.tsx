import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ComplianceScanStatus } from '@/features/compliance-detection/compliance-task-shared';
import {
  computePassRate,
  groupLibraryStats,
  libraryPassRate,
  libraryPassed,
  readCompliancePassRateThreshold,
  type TaskDetailStats,
} from '@/features/compliance-detection/compliance-task-detail-utils';
import { cn } from '@/lib/utils';
import type { SecurityScanTask } from '@/types/entities';
import type {
  ComplianceCaseExecutionResult,
  ComplianceReportPreview,
} from './compliance-report-types';
import '@/features/compliance-detection/compliance-full-report.css';

export type ComplianceFullReportTab =
  | 'overview'
  | 'domains'
  | 'violations'
  | 'cases'
  | 'laws'
  | 'fix'
  | 'evidence';

const REPORT_TABS: Array<[ComplianceFullReportTab, string]> = [
  ['overview', '总览'],
  ['domains', '合规领域结果'],
  ['violations', '违规项分析'],
  ['cases', '用例明细'],
  ['laws', '法规依据'],
  ['fix', '整改建议'],
  ['evidence', '审计证据'],
];

function archiveBadge(status: ComplianceReportPreview['status']) {
  if (status === 'archived') {
    return (
      <Badge variant="outline" className="border-emerald-200 text-emerald-700">
        已归档
      </Badge>
    );
  }
  if (status === 'finalized') {
    return (
      <Badge variant="outline" className="border-blue-200 text-blue-700">
        已定稿
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 text-amber-700">
      草稿
    </Badge>
  );
}

function conclusionBadgeClass(conclusion: ComplianceReportPreview['conclusion']) {
  if (conclusion === 'pass') {
    return 'border-emerald-200 text-emerald-700';
  }
  if (conclusion === 'conditional') {
    return 'border-amber-200 text-amber-700';
  }
  return 'border-red-200 text-red-700';
}

function riskLabel(level?: string): string {
  if (level === 'critical' || level === 'high') {
    return '高危';
  }
  if (level === 'medium') {
    return '中危';
  }
  if (level === 'low') {
    return '低危';
  }
  return level || '—';
}

function formatWindow(task?: SecurityScanTask, generatedAt?: string): string {
  const start = task?.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '—';
  const end = task?.completedAt
    ? new Date(task.completedAt).toLocaleString('zh-CN')
    : generatedAt
      ? new Date(generatedAt).toLocaleString('zh-CN')
      : '—';
  return `${start} ~ ${end}`;
}

function groupLaws(items: ComplianceCaseExecutionResult[]) {
  const map = new Map<
    string,
    { clause: string; libraries: Set<string>; cases: number; fail: number }
  >();
  for (const item of items) {
    const clause = item.regClause?.trim() || '未映射法规条款';
    const entry = map.get(clause) ?? {
      clause,
      libraries: new Set<string>(),
      cases: 0,
      fail: 0,
    };
    if (item.libraryTitle) {
      entry.libraries.add(item.libraryTitle);
    }
    entry.cases += 1;
    if (!item.passed && item.executionStatus !== 'skipped') {
      entry.fail += 1;
    }
    map.set(clause, entry);
  }
  return [...map.values()].sort((a, b) => b.fail - a.fail);
}

export function ComplianceFullReportView({
  report,
  task,
  taskStatus,
  stats,
  onBack,
  onFinalize,
  canFinalize,
  isFinalizing,
  onGoRemediation,
  onSelectCase,
}: {
  report: ComplianceReportPreview;
  task?: SecurityScanTask;
  taskStatus: ComplianceScanStatus;
  stats: TaskDetailStats;
  onBack: () => void;
  onFinalize?: () => void;
  canFinalize?: boolean;
  isFinalizing?: boolean;
  onGoRemediation?: () => void;
  onSelectCase?: (item: ComplianceCaseExecutionResult) => void;
}) {
  const [tab, setTab] = useState<ComplianceFullReportTab>('overview');
  const [caseFilter, setCaseFilter] = useState<'all' | 'pass' | 'fail'>('all');

  const executed = stats.pass + stats.fail;
  const passRate = computePassRate(stats);
  const passRateThreshold = readCompliancePassRateThreshold(report);
  const violations = useMemo(
    () => report.items.filter((item) => !item.passed && item.executionStatus !== 'skipped'),
    [report.items],
  );
  const highCount = violations.filter(
    (item) => item.riskLevel === 'high' || item.riskLevel === 'critical',
  ).length;
  const libGroups = useMemo(() => groupLibraryStats(report), [report]);
  const lawGroups = useMemo(() => groupLaws(report.items), [report.items]);

  const filteredCases = useMemo(() => {
    return report.items.filter((item) => {
      if (caseFilter === 'pass') {
        return item.passed;
      }
      if (caseFilter === 'fail') {
        return !item.passed;
      }
      return true;
    });
  }, [caseFilter, report.items]);

  const evidenceRows = useMemo(() => {
    return report.items.flatMap((item) =>
      (item.evidenceChain ?? []).map((entry) => ({
        caseName: item.caseName,
        caseCode: item.caseCode,
        label: entry.label,
        value: entry.value,
      })),
    );
  }, [report.items]);

  const passed = passRate >= passRateThreshold;
  const admissionAdvice =
    report.conclusion === 'pass' && passRate >= passRateThreshold ? '允许上线' : '暂不通过';

  const bannerSummary = passed
    ? `本次评估范围内 ${stats.pass} 项控制项均符合法规与内控要求，证据链完整，可进入准入评审归档。`
    : `本次检测发现 ${stats.fail} 项合规违规项，其中 ${highCount || stats.fail} 项高优先级。系统已固化 Agent 原始输入、原始输出、违规片段、法规条款映射、判定规则与证据摘要。`;

  const blockReason = passed
    ? '当前评估范围内未发现阻断性合规违规。'
    : '存在合规偏差，须完成 Prompt/披露话术/引用规则整改后复测。';

  return (
    <div className="cmp-full-report">
      <div className="sec-rpt-v2-shell">
        <header className="sec-rpt-v2-topbar">
          <div>
            <h1>Agent 合规检测分析报告</h1>
            <p className="sub">
              面向金融企业合规审计：基于 Agent API
              输入输出评价，展示法规依据、合规控制项、违规片段、判定规则、整改建议与审计证据链。
            </p>
            <p className="meta">
              <b>{report.taskName}</b> · <code>{report.reportNo}</code> ·{' '}
              {formatWindow(task, report.generatedAt)} · {report.conclusionLabel}
            </p>
          </div>
          <div className="sec-rpt-v2-actions print:hidden">
            <Button type="button" size="sm" variant="outline" onClick={onBack}>
              ← 返回任务详情
            </Button>
            {onGoRemediation && violations.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={onGoRemediation}>
                整改工作台
              </Button>
            ) : null}
            {canFinalize && onFinalize ? (
              <Button type="button" size="sm" disabled={isFinalizing} onClick={onFinalize}>
                {isFinalizing ? '定稿中…' : '审批定稿'}
              </Button>
            ) : null}
          </div>
        </header>

        <main className="sec-rpt-v2-content">
          <div className="sec-rpt-v2-toolbar-mini print:hidden">
            {archiveBadge(report.status)}
            <Badge variant="outline" className={conclusionBadgeClass(report.conclusion)}>
              {report.conclusionLabel}
            </Badge>
            <Badge
              variant="outline"
              className={
                passed ? 'border-emerald-200 text-emerald-700' : 'border-amber-200 text-amber-700'
              }
            >
              准入建议 · {admissionAdvice}
            </Badge>
            {report.finalizedReportId ? (
              <Link
                to="/reports/$reportId"
                params={{ reportId: report.finalizedReportId }}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                报告中心定稿副本
              </Link>
            ) : null}
          </div>

          <section className={cn('sec-rpt-v2-banner', passed && 'pass')}>
            <div className="sec-rpt-v2-banner-grid">
              <div className="sec-rpt-v2-conclusion">
                <div className={cn('sec-rpt-v2-iconbox', passed && 'pass')}>
                  {passed ? '✓' : '!'}
                </div>
                <div>
                  <h2>{report.conclusionLabel}</h2>
                  <p>{bannerSummary}</p>
                  <p style={{ marginTop: 8 }}>{blockReason}</p>
                  <div className="sec-rpt-v2-tagrow">
                    {highCount > 0 ? (
                      <Badge variant="outline" className="border-red-200 text-red-700">
                        高优先级违规 {highCount}
                      </Badge>
                    ) : null}
                    {stats.fail > 0 ? (
                      <Badge variant="outline" className="border-orange-200 text-orange-700">
                        违规用例 {stats.fail}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="border-slate-200 text-slate-600">
                      任务状态 · {taskStatus}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="sec-rpt-v2-metric-grid">
            <div className="sec-rpt-v2-metric">
              <span>检测用例</span>
              <strong>{stats.total || executed}</strong>
              <em>合规场景问题</em>
            </div>
            <div className="sec-rpt-v2-metric">
              <span>通过用例</span>
              <strong className="green">{stats.pass}</strong>
              <em>通过率 {passRate}%</em>
            </div>
            <div className="sec-rpt-v2-metric">
              <span>违规用例</span>
              <strong className="orange">{stats.fail}</strong>
              <em>聚合为 {violations.length} 项违规</em>
            </div>
            <div className="sec-rpt-v2-metric">
              <span>合规违规项</span>
              <strong className="red">{violations.length}</strong>
              <em>{highCount ? `其中高优先级 ${highCount}` : '无高优先级'}</em>
            </div>
            <div className="sec-rpt-v2-metric">
              <span>合规控制库</span>
              <strong>{report.libraries.length}</strong>
              <em>纳入评估范围</em>
            </div>
          </section>

          <nav className="sec-rpt-v2-tabs print:hidden" aria-label="报告导航">
            {REPORT_TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn('sec-rpt-v2-tab', tab === id && 'active')}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <section className={cn('sec-rpt-v2-panel', tab === 'overview' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>报告总览</h3>
                <p>任务元数据、评估对象、合规域与关键违规摘要</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                <div className="sec-rpt-v2-kv">
                  <div>报告编号</div>
                  <div>
                    <code>{report.reportNo}</code>
                  </div>
                  <div>评估对象</div>
                  <div>{report.agentName}</div>
                  <div>合规域</div>
                  <div>{report.domain}</div>
                  <div>综合结论</div>
                  <div>{report.conclusionLabel}</div>
                  <div>执行窗口</div>
                  <div>{formatWindow(task, report.generatedAt)}</div>
                  <div>负责人</div>
                  <div>{task?.ownerName || '—'}</div>
                  <div>纳入控制库</div>
                  <div>{report.libraries.map((lib) => lib.title).join('、') || '—'}</div>
                </div>
                {violations.length > 0 ? (
                  <div className="sec-rpt-v2-table-wrap" style={{ marginTop: 14 }}>
                    <table className="sec-rpt-v2-table">
                      <thead>
                        <tr>
                          <th>重点违规项</th>
                          <th>法规 / 判定</th>
                        </tr>
                      </thead>
                      <tbody>
                        {violations.slice(0, 4).map((item) => (
                          <tr key={item.caseId || item.caseCode}>
                            <td>{item.caseName}</td>
                            <td>{item.regClause || item.judgmentRule || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'domains' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>合规领域结果</h3>
                <p>按合规控制库汇总通过率与违规分布</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                <div className="sec-rpt-v2-table-wrap">
                  <table className="sec-rpt-v2-table">
                    <thead>
                      <tr>
                        <th>合规控制库</th>
                        <th>计划</th>
                        <th>已执行</th>
                        <th>合规</th>
                        <th>违规</th>
                        <th>通过率</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {libGroups.map((group) => {
                        const rate = libraryPassRate(group);
                        const passedLib = libraryPassed(group, passRateThreshold);
                        return (
                          <tr key={group.libraryId}>
                            <td className="font-semibold">{group.title}</td>
                            <td>{group.planned}</td>
                            <td>{group.exec || '—'}</td>
                            <td>{group.pass || '—'}</td>
                            <td>{group.fail || '—'}</td>
                            <td>{group.exec ? `${rate}%` : '—'}</td>
                            <td>{group.exec ? (passedLib ? '通过' : '不通过') : '待执行'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'violations' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>违规项分析</h3>
                <p>共 {violations.length} 项违规控制项</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                {violations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">无违规项</p>
                ) : (
                  <div className="sec-rpt-v2-table-wrap">
                    <table className="sec-rpt-v2-table">
                      <thead>
                        <tr>
                          <th>控制项</th>
                          <th>法规条款</th>
                          <th>违规片段</th>
                          <th>等级</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {violations.map((item) => (
                          <tr key={item.caseId || item.caseCode}>
                            <td>
                              <div className="font-semibold">{item.caseName}</div>
                              {item.violationNo ? (
                                <code className="text-[11px]">{item.violationNo}</code>
                              ) : null}
                            </td>
                            <td className="sec-rpt-v2-cell-multiline">{item.regClause || '—'}</td>
                            <td className="sec-rpt-v2-cell-multiline">
                              {item.violationSnippet || item.outputSnippet || '—'}
                            </td>
                            <td>{riskLabel(item.riskLevel)}</td>
                            <td>
                              {onSelectCase ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onSelectCase(item)}
                                >
                                  详情
                                </Button>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'cases' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>用例明细</h3>
                <p>全部测试用例执行结果与判定</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                <div className="sec-rpt-v2-filter-row print:hidden">
                  {(['all', 'pass', 'fail'] as const).map((filter) => (
                    <Button
                      key={filter}
                      type="button"
                      size="sm"
                      variant={caseFilter === filter ? 'default' : 'outline'}
                      onClick={() => setCaseFilter(filter)}
                    >
                      {filter === 'all' ? '全部' : filter === 'pass' ? '合规' : '违规'}
                    </Button>
                  ))}
                </div>
                <div className="sec-rpt-v2-table-wrap">
                  <table className="sec-rpt-v2-table">
                    <thead>
                      <tr>
                        <th>用例</th>
                        <th>验证问题</th>
                        <th>期望输出</th>
                        <th>Agent 输出</th>
                        <th>判定</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((item) => (
                        <tr key={item.caseId || item.caseCode}>
                          <td className="font-medium">{item.caseName}</td>
                          <td className="sec-rpt-v2-cell-multiline">
                            {item.prompt || item.inputSummary || '—'}
                          </td>
                          <td className="sec-rpt-v2-cell-multiline">{item.expectedFail || '—'}</td>
                          <td className="sec-rpt-v2-cell-multiline">{item.outputSnippet || '—'}</td>
                          <td>{item.passed ? '合规' : '违规'}</td>
                          <td>
                            {onSelectCase ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onSelectCase(item)}
                              >
                                详情
                              </Button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'laws' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>法规依据</h3>
                <p>法规条款与控制库映射汇总</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                <div className="sec-rpt-v2-table-wrap">
                  <table className="sec-rpt-v2-table">
                    <thead>
                      <tr>
                        <th>法规条款</th>
                        <th>关联合规控制库</th>
                        <th>用例数</th>
                        <th>违规数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lawGroups.map((group) => (
                        <tr key={group.clause}>
                          <td className="sec-rpt-v2-cell-multiline">{group.clause}</td>
                          <td>{[...group.libraries].join('、') || '—'}</td>
                          <td>{group.cases}</td>
                          <td>{group.fail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'fix' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>整改建议</h3>
                <p>按违规控制项给出整改方向</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                {violations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">无整改项</p>
                ) : (
                  <div className="grid gap-3">
                    {violations.map((item) => (
                      <div
                        key={item.caseId || item.caseCode}
                        className="rounded-xl border border-orange-100 bg-orange-50/40 p-4"
                      >
                        <div className="font-semibold text-foreground">{item.caseName}</div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.recommendation ||
                            item.expectedPass ||
                            '补充安全策略、拒答规则、输出审查和回归检测样本。'}
                        </p>
                        {item.judgmentRule ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            判定依据：{item.judgmentRule}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={cn('sec-rpt-v2-panel', tab === 'evidence' && 'active')}>
            <div className="sec-rpt-v2-section">
              <div className="sec-rpt-v2-section-head">
                <h3>审计证据</h3>
                <p>HTTP 状态、响应时延、Agent 响应与判定依据</p>
              </div>
              <div className="sec-rpt-v2-section-body">
                {evidenceRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无结构化证据链</p>
                ) : (
                  <div className="sec-rpt-v2-table-wrap">
                    <table className="sec-rpt-v2-table">
                      <thead>
                        <tr>
                          <th>控制项</th>
                          <th>证据项</th>
                          <th>值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.map((row, index) => (
                          <tr key={`${row.caseCode}-${row.label}-${index}`}>
                            <td>
                              {row.caseName}
                              <div className="text-[11px] text-muted-foreground">
                                {row.caseCode}
                              </div>
                            </td>
                            <td>{row.label}</td>
                            <td className="sec-rpt-v2-cell-multiline">
                              {row.label.includes('响应') && row.value.length > 120 ? (
                                <div className="sec-rpt-v2-evidence-box">{row.value}</div>
                              ) : (
                                row.value
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>

          <footer className="sec-rpt-v2-footer">
            报告生成时间 {new Date(report.generatedAt).toLocaleString('zh-CN')} · 任务 ID{' '}
            <code>{report.taskId}</code>
            {report.description ? ` · ${report.description}` : ''}
          </footer>
        </main>
      </div>
    </div>
  );
}
