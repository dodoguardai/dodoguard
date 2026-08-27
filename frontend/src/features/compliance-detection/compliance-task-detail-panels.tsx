import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  SAMPLE_TYPE_LABELS,
  riskLevelText,
  type SampleType,
} from '@/features/compliance-case-library/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ComplianceScanStatus } from '@/features/compliance-detection/compliance-task-shared';
import { cn } from '@/lib/utils';
import type { SecurityScanTask } from '@/types/entities';
import type {
  ComplianceCaseExecutionResult,
  ComplianceReportPreview,
} from './compliance-report-types';
import {
  computePassRate,
  filterCaseItems,
  groupLibraryStats,
  libraryPassRate,
  libraryPassed,
  paginateItems,
  readCompliancePassRateThreshold,
  type ComplianceDetailTab,
  type LibraryStatGroup,
  type TaskDetailStats,
} from './compliance-task-detail-utils';

function riskBadgeClass(level?: string): string {
  if (level === 'critical' || level === 'high') {
    return 'border-red-200 text-red-700';
  }
  if (level === 'medium') {
    return 'border-amber-200 text-amber-700';
  }
  if (level === 'low') {
    return 'border-emerald-200 text-emerald-700';
  }
  return 'border-slate-200 text-slate-600';
}

function verdictBadge(passed: boolean) {
  return passed ? (
    <Badge variant="outline" className="border-emerald-200 text-emerald-700">
      合规
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 text-red-700">
      违规
    </Badge>
  );
}

function readSampleTypeLabel(sampleType?: string): string {
  if (!sampleType) {
    return '—';
  }
  return SAMPLE_TYPE_LABELS[sampleType as SampleType] || sampleType;
}

function readRiskLevelLabel(level?: string): string {
  if (!level) {
    return '—';
  }
  return riskLevelText[level as keyof typeof riskLevelText] || level;
}

function DrawerKvRow({
  label,
  children,
  valueClassName,
}: {
  label: string;
  children: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="cmp-drawer-kv-row">
      <div className="cmp-drawer-kv-label">{label}</div>
      <div className={cn('cmp-drawer-kv-value', valueClassName)}>{children}</div>
    </div>
  );
}

export function ComplianceCaseExecutionDrawer({
  item,
  open,
  onClose,
  container,
}: {
  item: ComplianceCaseExecutionResult | null;
  open: boolean;
  onClose: () => void;
  container?: HTMLElement | null;
}) {
  if (!open || !item) {
    return null;
  }

  const promptText = item.prompt || item.inputSummary || '—';
  const host = container ?? document.body;

  return createPortal(
    <div id="sdTdDrawerHost">
      <button
        type="button"
        className="sec-rpt-v2-drawer-mask show"
        aria-label="关闭详情"
        onClick={onClose}
      />
      <aside className="sec-rpt-v2-drawer show" aria-label="测试用例详情">
        <div className="sec-rpt-v2-drawer-head">
          <div className="sec-rpt-v2-drawer-head-main">
            <div className="sec-rpt-v2-drawer-tags">
              {item.riskLevel ? (
                <Badge variant="outline" className={riskBadgeClass(item.riskLevel)}>
                  {readRiskLevelLabel(item.riskLevel)}
                </Badge>
              ) : null}
              {verdictBadge(item.passed)}
            </div>
            <h2>{item.caseName}</h2>
          </div>
          <button type="button" className="sec-rpt-v2-close" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="sec-rpt-v2-drawer-body">
          <div className="cmp-drawer-kv">
            <DrawerKvRow label="控制项 ID">
              <code className="cmp-drawer-code">{item.caseCode || '—'}</code>
            </DrawerKvRow>
            <DrawerKvRow label="合规控制库">{item.libraryTitle || '—'}</DrawerKvRow>
            <DrawerKvRow label="法规条款">{item.regClause || '—'}</DrawerKvRow>
            <DrawerKvRow label="样本类型">{readSampleTypeLabel(item.sampleType)}</DrawerKvRow>
            <DrawerKvRow label="验证问题" valueClassName="cmp-drawer-kv-mono">
              <pre className="cmp-drawer-pre">{promptText}</pre>
            </DrawerKvRow>
            <DrawerKvRow label="预期合规行为" valueClassName="cmp-drawer-kv-pass">
              {item.expectedPass || '—'}
            </DrawerKvRow>
            <DrawerKvRow label="违规命中表现" valueClassName="cmp-drawer-kv-fail">
              {item.expectedFail || '—'}
            </DrawerKvRow>
            <DrawerKvRow label="Agent 实际输出" valueClassName="cmp-drawer-kv-mono">
              <pre className="cmp-drawer-evidence">{item.outputSnippet || '—'}</pre>
            </DrawerKvRow>
            {item.judgmentRule ? (
              <DrawerKvRow label="判定依据">{item.judgmentRule}</DrawerKvRow>
            ) : null}
            {item.recommendation ? (
              <DrawerKvRow label="整改建议">{item.recommendation}</DrawerKvRow>
            ) : null}
          </div>

          {item.evidenceChain?.length ? (
            <div className="cmp-drawer-kv cmp-drawer-kv-secondary">
              <div className="cmp-drawer-kv-section-title">执行证据</div>
              {item.evidenceChain.map((entry) => (
                <DrawerKvRow key={`${entry.label}-${entry.value.slice(0, 24)}`} label={entry.label}>
                  {entry.value}
                </DrawerKvRow>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    </div>,
    host,
  );
}

export function TaskDetailOverviewPanel({
  report,
  task,
  stats,
  taskStatus,
  onOpenFullReport,
}: {
  report: ComplianceReportPreview;
  task?: SecurityScanTask;
  stats: TaskDetailStats;
  taskStatus: ComplianceScanStatus;
  onOpenFullReport?: () => void;
}) {
  const passRate = computePassRate(stats);
  const passRateThreshold = readCompliancePassRateThreshold(report);
  const libLabel =
    report.libraries.length > 0 ? report.libraries.map((lib) => lib.title).join('、') : '—';
  const metadata = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const admission =
    typeof metadata.admissionApplicationId === 'string'
      ? metadata.admissionApplicationId
      : typeof metadata.admission === 'string'
        ? metadata.admission
        : '—';

  const rows: Array<[string, ReactNode]> = [
    ['任务编号', <code key="id">{report.taskId}</code>],
    ['评估对象', report.agentName || task?.assetName || '—'],
    [
      '合规域',
      <Badge key="domain" variant="outline" className="border-violet-200 text-violet-700">
        {report.domain}
      </Badge>,
    ],
    ['评测对象类型', 'Agent API · 合规安全评估'],
    ['合规控制库', libLabel],
    ['评估器', '内置 Agent · 合规规则引擎 latest'],
    [
      '执行时间',
      `${task?.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '—'} ~ ${task?.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '—'}`,
    ],
    ['创建人', task?.ownerName || '—'],
    ['关联准入', admission !== '—' ? admission : '—'],
    ['评估范围', task?.targetSummary || report.taskName || '—'],
    [
      '执行质量',
      <Badge
        key="quality"
        variant="outline"
        className={
          taskStatus === 'running'
            ? 'border-amber-200 text-amber-700'
            : passRate >= passRateThreshold
              ? 'border-emerald-200 text-emerald-700'
              : 'border-orange-200 text-orange-700'
        }
      >
        {taskStatus === 'running' ? `执行中 ${task?.progress ?? 0}%` : `执行成功率 ${passRate}%`}
      </Badge>,
    ],
  ];

  return (
    <div className="sd-td-overview-grid">
      <div className="sd-td-card">
        <div className="sd-td-card-head">
          <h3>任务基础信息</h3>
          <span className="hint">任务元数据与执行配置</span>
        </div>
        <div className="sd-td-card-body">
          <div className="sd-td-kv">
            {rows.flatMap(([label, value]) => [
              <div key={`${label}-k`}>{label}</div>,
              <div key={`${label}-v`}>{value}</div>,
            ])}
          </div>
          {onOpenFullReport && taskStatus !== 'pending' && taskStatus !== 'running' ? (
            <Button type="button" className="mt-4" size="sm" onClick={onOpenFullReport}>
              查看完整报告
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TaskDetailLibraryStatsPanel({
  report,
  stats,
  taskStatus,
}: {
  report?: ComplianceReportPreview;
  stats: TaskDetailStats;
  taskStatus: ComplianceScanStatus;
}) {
  const groups = groupLibraryStats(report);
  const passRateThreshold = readCompliancePassRateThreshold(report);
  if (taskStatus === 'pending' && groups.length === 0) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">📊</div>
        <b>任务尚未执行</b>
        <p>执行后将按合规控制库汇总通过率与违规分布</p>
      </div>
    );
  }
  if (taskStatus === 'running' && groups.every((g) => g.exec === 0)) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">⏳</div>
        <b>合规评估执行中</b>
        <p>正在按合规控制库逐条执行控制项 · 稍候刷新查看分库统计</p>
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="cmp-td-empty">
        <b>暂无分库统计</b>
        <p>未配置合规控制库或未产生执行结果</p>
      </div>
    );
  }

  const execTotal = groups.reduce((n, g) => n + g.exec, 0);
  const passTotal = groups.reduce((n, g) => n + g.pass, 0);
  const failTotal = groups.reduce((n, g) => n + g.fail, 0);
  const overallRate = execTotal > 0 ? Math.round((passTotal / execTotal) * 100) : 0;

  return (
    <>
      <div className="cmp-td-metrics-grid">
        <div className="cmp-td-metric">
          <b>{groups.length}</b>
          <span>纳入合规控制库</span>
        </div>
        <div className="cmp-td-metric">
          <b>{stats.total || execTotal}</b>
          <span>计划 / 执行控制项</span>
        </div>
        <div className="cmp-td-metric">
          <b>{overallRate}%</b>
          <span>整体合规通过率</span>
        </div>
        <div className="cmp-td-metric">
          <b>{failTotal}</b>
          <span>违规控制项</span>
        </div>
      </div>
      <div className="sd-td-card" style={{ marginTop: 0, boxShadow: 'none', border: 0 }}>
        <div className="sd-td-card-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <h3>按合规控制库统计</h3>
          <span className="hint">
            共 {groups.length} 个库 · 已执行 {execTotal} 条（合规 {passTotal} · 违规 {failTotal}）·
            阈值 {passRateThreshold}%
          </span>
        </div>
        <div className="sd-td-card-body" style={{ padding: 0 }}>
          <LibraryStatsTable
            groups={groups}
            taskStatus={taskStatus}
            passRateThreshold={passRateThreshold}
          />
        </div>
      </div>
    </>
  );
}

function LibraryStatsTable({
  groups,
  taskStatus,
  passRateThreshold,
}: {
  groups: LibraryStatGroup[];
  taskStatus: ComplianceScanStatus;
  passRateThreshold: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>合规控制库</TableHead>
          <TableHead>计划</TableHead>
          <TableHead>已执行</TableHead>
          <TableHead>合规</TableHead>
          <TableHead>违规</TableHead>
          <TableHead>待执行</TableHead>
          <TableHead>通过率</TableHead>
          <TableHead>阈值</TableHead>
          <TableHead>结果</TableHead>
          <TableHead>说明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          const rate = libraryPassRate(group);
          const passed = libraryPassed(group, passRateThreshold);
          const status =
            taskStatus === 'pending' && group.exec === 0
              ? '待执行'
              : group.exec
                ? passed
                  ? '通过'
                  : '不通过'
                : group.pending
                  ? '未执行'
                  : '—';
          const note =
            group.fail > 0
              ? '存在违规 · 需整改'
              : group.exec
                ? '整体达标'
                : group.pending
                  ? '缺少执行结果 · 检查 Agent 配置后重跑'
                  : '暂无执行结果';
          return (
            <TableRow key={group.libraryId}>
              <TableCell>
                <div className="font-semibold">{group.title}</div>
                {group.domain ? (
                  <Badge variant="outline" className="mt-1 border-violet-200 text-violet-700">
                    {group.domain}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{group.planned}</TableCell>
              <TableCell>{group.exec || '—'}</TableCell>
              <TableCell>{group.pass || '—'}</TableCell>
              <TableCell>{group.fail || '—'}</TableCell>
              <TableCell>{group.pending || '—'}</TableCell>
              <TableCell>
                <div style={{ minWidth: 88 }}>
                  <b>{group.exec ? `${rate}%` : '—'}</b>
                  <div className={cn('sd-td-progress-line', !passed && group.exec ? 'red' : '')}>
                    <span style={{ width: `${group.exec ? rate : 0}%` }} />
                  </div>
                </div>
              </TableCell>
              <TableCell>{passRateThreshold}%</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    status === '通过'
                      ? 'border-emerald-200 text-emerald-700'
                      : status === '不通过'
                        ? 'border-red-200 text-red-700'
                        : 'border-slate-200 text-slate-600'
                  }
                >
                  {status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{note}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function TaskDetailFindingsPanel({
  items,
  taskStatus,
  pendingPushCount,
  pushSuccessCount,
  onPushOne,
  onPushBatch,
  onGoRemediation,
  isPushing,
}: {
  items: ComplianceCaseExecutionResult[];
  taskStatus: ComplianceScanStatus;
  pendingPushCount: number;
  pushSuccessCount?: number | null;
  onPushOne: (caseId: string) => void;
  onPushBatch: () => void;
  onGoRemediation: () => void;
  isPushing?: boolean;
}) {
  if (taskStatus === 'pending' || taskStatus === 'running') {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">🔍</div>
        <b>任务执行后将展示风险发现</b>
        <p>内置 Agent 对照法规条款判定 · 可推送到风险闭环</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">✓</div>
        <b>无合规风险发现</b>
        <p>全部测试用例判定为合规</p>
      </div>
    );
  }

  return (
    <>
      {pushSuccessCount ? (
        <div className="td-push-success">
          <span>✓ 已推送 {pushSuccessCount} 项到风险闭环</span>
          <Button type="button" size="sm" onClick={onGoRemediation}>
            前往风险闭环
          </Button>
        </div>
      ) : null}
      <div className="sd-td-card">
        <div className="sd-td-card-head">
          <h3>风险发现</h3>
          <span className="text-xs text-muted-foreground">
            共 {items.length} 项 · {pendingPushCount} 项待推送
          </span>
        </div>
        <div className="sd-td-card-body sd-td-finding-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>风险项</TableHead>
                <TableHead>法规条款</TableHead>
                <TableHead>测试输入</TableHead>
                <TableHead>违规片段</TableHead>
                <TableHead>等级</TableHead>
                <TableHead>控制库</TableHead>
                <TableHead>推送状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const caseKey = item.caseId || item.caseCode;
                const isPushed = item.pushStatus === 'pushed';
                return (
                  <TableRow key={caseKey}>
                    <TableCell className="cmp-td-cell-multiline">
                      <div className="font-semibold">{item.caseName}</div>
                      {item.violationNo ? (
                        <code className="text-[11px] text-muted-foreground">
                          {item.violationNo}
                        </code>
                      ) : null}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">{item.regClause || '—'}</TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {item.inputSummary || '—'}
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {item.violationSnippet || item.outputSnippet || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={riskBadgeClass(item.riskLevel)}>
                        {item.riskLevel === 'high' || item.riskLevel === 'critical'
                          ? '高危'
                          : item.riskLevel === 'medium'
                            ? '中危'
                            : '低危'}
                      </Badge>
                    </TableCell>
                    <TableCell className="cmp-td-cell-multiline">
                      {item.libraryTitle || '—'}
                    </TableCell>
                    <TableCell>
                      {isPushed ? (
                        <Badge
                          variant="secondary"
                          className="border-emerald-200 bg-emerald-50 text-emerald-800"
                        >
                          已推送
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 text-amber-800">
                          待推送
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isPushed && caseKey ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPushing}
                          onClick={() => onPushOne(caseKey)}
                        >
                          推送
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end gap-2">
            {pendingPushCount > 0 ? (
              <Button type="button" variant="outline" disabled={isPushing} onClick={onPushBatch}>
                批量推送到风险闭环（{pendingPushCount} 项）
              </Button>
            ) : (
              <Button type="button" disabled style={{ opacity: 0.72 }}>
                已全部推送
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function TaskDetailCasesPanel({
  items,
  taskStatus,
  search,
  statusFilter,
  page,
  pageSize,
  onSearchChange,
  onStatusFilterChange,
  onPageChange,
  onResetFilters,
  onRunTask,
  onRefresh,
  onSelectCase,
}: {
  items: ComplianceCaseExecutionResult[];
  taskStatus: ComplianceScanStatus;
  search: string;
  statusFilter: '' | 'pass' | 'fail';
  page: number;
  pageSize: number;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: '' | 'pass' | 'fail') => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onRunTask?: () => void;
  onRefresh?: () => void;
  onSelectCase: (item: ComplianceCaseExecutionResult) => void;
}) {
  const filtered = filterCaseItems(items, search, statusFilter);
  const pageData = paginateItems(filtered, page, pageSize);

  const toolbar = (
    <div className="cmp-td-toolbar">
      <div className="cmp-td-toolbar-left">
        <input
          className="cmp-td-search"
          placeholder="搜索用例名称 / Prompt / 输出 / 法规条款"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <select
          className="rounded-md border px-2 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as '' | 'pass' | 'fail')}
        >
          <option value="">全部状态</option>
          <option value="pass">合规</option>
          <option value="fail">违规</option>
        </select>
        <Button type="button" size="sm" variant="outline" onClick={onResetFilters}>
          重置
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">
        共 {pageData.total} 条
        {pageData.pages > 1 ? ` · 第 ${pageData.page}/${pageData.pages} 页` : ''}
      </span>
    </div>
  );

  if (taskStatus === 'pending' && filtered.length === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">📋</div>
          <b>任务尚未执行</b>
          <p>点击「开始评估」直接执行已配置的合规测试用例</p>
          {onRunTask ? (
            <Button type="button" className="mt-4" size="sm" onClick={onRunTask}>
              开始评估
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  if (taskStatus === 'running' && filtered.length === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">⏳</div>
          <b>合规评估执行中</b>
          <p>内置 Agent 正在对照法规条款判定 · 稍等几秒后点击刷新</p>
          {onRefresh ? (
            <Button type="button" className="mt-4" size="sm" variant="outline" onClick={onRefresh}>
              刷新
            </Button>
          ) : null}
        </div>
      </>
    );
  }

  if (pageData.total === 0) {
    return (
      <>
        {toolbar}
        <div className="cmp-td-empty">
          <div className="cmp-td-empty-illus">🔍</div>
          <b>无匹配测试用例</b>
          <p>调整关键词或状态筛选后重试</p>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用例名称</TableHead>
            <TableHead>验证问题</TableHead>
            <TableHead>期望输出</TableHead>
            <TableHead>Agent 实际输出</TableHead>
            <TableHead>等级</TableHead>
            <TableHead>判定</TableHead>
            <TableHead>法规条款</TableHead>
            <TableHead>合规控制库</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageData.slice.map((item) => (
            <TableRow key={item.caseId || item.caseCode}>
              <TableCell className="cmp-td-cell-multiline font-medium">{item.caseName}</TableCell>
              <TableCell className="cmp-td-cell-multiline">
                {item.prompt || item.inputSummary || '—'}
              </TableCell>
              <TableCell className="cmp-td-cell-multiline">{item.expectedFail || '—'}</TableCell>
              <TableCell className="cmp-td-cell-multiline">{item.outputSnippet || '—'}</TableCell>
              <TableCell>
                <Badge variant="outline" className={riskBadgeClass(item.riskLevel)}>
                  {item.riskLevel || '—'}
                </Badge>
              </TableCell>
              <TableCell>{verdictBadge(item.passed)}</TableCell>
              <TableCell className="cmp-td-cell-multiline">{item.regClause || '—'}</TableCell>
              <TableCell className="cmp-td-cell-multiline">{item.libraryTitle || '—'}</TableCell>
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectCase(item)}
                >
                  详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageData.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            显示 {pageData.slice.length} / {pageData.total} 条
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageData.page <= 1}
              onClick={() => onPageChange(pageData.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageData.page >= pageData.pages}
              onClick={() => onPageChange(pageData.page + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function TaskDetailPushPanel({
  report,
  task,
  stats,
  taskStatus,
  violationItems,
  pendingPushCount,
  pushSuccessCount,
  onPushBatch,
  onGoRemediation,
  isPushing,
}: {
  report?: ComplianceReportPreview;
  task?: SecurityScanTask;
  stats: TaskDetailStats;
  taskStatus: ComplianceScanStatus;
  violationItems: ComplianceCaseExecutionResult[];
  pendingPushCount: number;
  pushSuccessCount?: number | null;
  onPushBatch: () => void;
  onGoRemediation: () => void;
  isPushing?: boolean;
}) {
  if (taskStatus === 'pending' || taskStatus === 'running') {
    return (
      <div className="cmp-td-empty">
        <div className="cmp-td-empty-illus">📤</div>
        <b>任务完成后可推送到风险闭环</b>
        <p>将合规违规项与法规映射一并写入整改数据库</p>
      </div>
    );
  }

  const highCount = violationItems.filter(
    (item) => item.riskLevel === 'high' || item.riskLevel === 'critical',
  ).length;
  const p1Count = violationItems.length - highCount;

  const timeline = [
    {
      n: 1,
      title: '合规违规项',
      desc: `推送 ${violationItems.length || stats.fail} 项违规控制项及判定证据摘要。`,
    },
    { n: 2, title: '法规映射', desc: '同步法规条款引用与合规控制库映射关系。' },
    {
      n: 3,
      title: '整改建议 / 复测',
      desc: '写入整改建议、优先级与复测范围，进入风险闭环数据库统一跟踪。',
    },
  ];

  return (
    <>
      {pushSuccessCount ? (
        <div className="td-push-success">
          <span>✓ 已推送 {pushSuccessCount} 项到风险闭环</span>
          <Button type="button" size="sm" onClick={onGoRemediation}>
            前往风险闭环
          </Button>
        </div>
      ) : null}
      <div className="sd-td-overview-grid">
        <div className="sd-td-card">
          <div className="sd-td-card-head">
            <h3>推送到风险闭环</h3>
            <span className="hint">将合规违规项与法规映射一并推送</span>
          </div>
          <div className="sd-td-card-body">
            {timeline.map((step) => (
              <div key={step.n} className="sd-td-timeline-item">
                <div className="sd-td-timeline-icon">{step.n}</div>
                <div>
                  <b>{step.title}</b>
                  <div className="sub text-xs text-muted-foreground mt-1 leading-relaxed">
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
            <div className="sd-td-notice gray">
              推送后可在「风险闭环」查看任务视角与按 Agent 分组的风险项。
            </div>
          </div>
        </div>
        <div className="sd-td-card">
          <div className="sd-td-card-head">
            <h3>本次推送内容</h3>
          </div>
          <div className="sd-td-card-body">
            <div className="sd-td-kv">
              <div>推送方式</div>
              <div>写入风险闭环数据库</div>
              <div>违规项数</div>
              <div>{violationItems.length || stats.fail} 项</div>
              <div>Agent</div>
              <div>{report?.agentName || task?.assetName || '—'}</div>
              <div>负责人</div>
              <div>{task?.ownerName || '—'}</div>
              <div>默认优先级</div>
              <div>
                P0 {highCount} 项 · P1 {p1Count} 项
              </div>
              <div>待推送</div>
              <div>{pendingPushCount} 项</div>
            </div>
            {pendingPushCount > 0 ? (
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={isPushing}
                onClick={onPushBatch}
              >
                推送到风险闭环（{pendingPushCount} 项）
              </Button>
            ) : (
              <Button type="button" className="mt-4 w-full" disabled style={{ opacity: 0.72 }}>
                已全部推送
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function TaskDetailHeroSection({
  conclusion,
  score,
  stats,
  onGotoTab,
}: {
  conclusion: ReturnType<typeof import('./compliance-task-detail-utils').computeConclusionMeta>;
  score: ReturnType<typeof import('./compliance-task-detail-utils').computeScoreMeta>;
  stats: TaskDetailStats;
  onGotoTab: (tab: ComplianceDetailTab) => void;
}) {
  const ringStyle = {
    background: `conic-gradient(${score.ringColor} 0 ${score.ringPct}%, #f3f4f6 ${score.ringPct}% 100%)`,
  };

  return (
    <section className="sd-td-hero">
      <div className={`sd-td-conclusion ${conclusion.pillCls}`}>
        <div className={`sd-td-result-pill ${conclusion.pillCls}`}>{conclusion.pill}</div>
        <h2>{conclusion.title}</h2>
        <div className="desc">{conclusion.desc}</div>
        <div className="sd-td-hero-actions">
          {conclusion.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.tab === 2 ? 'default' : 'outline'}
              onClick={() => onGotoTab(action.tab)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="sd-td-score-box sd-td-score-box-v2">
        <div className="sd-td-score-top">
          <div className="sd-td-score-ring" style={ringStyle}>
            <b>{score.score}</b>
          </div>
          <div className="sd-td-score-meta">
            <div className="sd-td-score-label">合规综合评分 / 100</div>
            <div className="sd-td-score-sub">{score.sub}</div>
          </div>
        </div>
        <div className="sd-td-score-list">
          <div className="sd-td-score-mini">
            <b>{stats.fail}</b>
            <span>违规项</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.pass}</b>
            <span>合规项</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.pending}</b>
            <span>待执行</span>
          </div>
          <div className="sd-td-score-mini">
            <b>{stats.total}</b>
            <span>计划总数</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TaskDetailStatStrip({
  stats,
  taskStatus,
  duration,
  passRateThreshold,
}: {
  stats: TaskDetailStats;
  taskStatus: ComplianceScanStatus;
  duration: string;
  passRateThreshold: number;
}) {
  const exec = stats.pass + stats.fail;
  const passRate = computePassRate(stats);
  const execCls =
    taskStatus === 'running' ? 'orange' : exec >= stats.total && stats.total ? 'green' : '';
  const passCls = passRate >= passRateThreshold ? 'green' : 'orange';

  return (
    <section className="sd-td-stat-grid">
      <div className="sd-td-stat red">
        <b>{stats.total}</b>
        <span>计划测试用例</span>
        <div className="small">来自合规控制库</div>
      </div>
      <div
        className={cn(
          'sd-td-stat',
          execCls === 'green' ? 'blue' : execCls === 'orange' ? 'orange' : '',
        )}
      >
        <b>{exec}</b>
        <span>有效执行</span>
        <div className="small">合规 + 违规</div>
      </div>
      <div
        className={cn(
          'sd-td-stat',
          passCls === 'green' ? 'green' : passCls === 'orange' ? 'orange' : '',
        )}
      >
        <b>{taskStatus === 'pending' ? '—' : `${passRate}%`}</b>
        <span>合规通过率</span>
        <div className="small">
          {passRate >= passRateThreshold
            ? `达到设定 ${passRateThreshold}% 阈值`
            : `低于设定 ${passRateThreshold}% 阈值`}
        </div>
      </div>
      <div className="sd-td-stat blue">
        <b>{duration}</b>
        <span>评估耗时</span>
        <div className="small">含 API 对话与文件审查</div>
      </div>
      <div className={cn('sd-td-stat', stats.fail ? 'orange' : '')}>
        <b>{stats.fail}</b>
        <span>违规用例</span>
        <div className="small">需整改 · 可推送风险</div>
      </div>
    </section>
  );
}
