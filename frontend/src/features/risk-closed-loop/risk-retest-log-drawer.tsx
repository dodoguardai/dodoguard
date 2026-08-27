import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildRetestRunsForTask,
  formatTaskDisplayLabel,
  isRetestActivelyRunning,
  resolveRetestProgress,
  type EnrichedRiskRow,
  type LiveRetestProgress,
  type TaskRiskGroup,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import type { SecurityRetestRun } from '@/services/api/detection-scanning';
import { RetestExecutionProgress } from '@/features/risk-closed-loop/retest-execution-progress';
import '@/features/risk-closed-loop/risk-retest-log-drawer.css';

type RiskRetestLogDrawerProps = {
  group: TaskRiskGroup | null;
  allRows: EnrichedRiskRow[];
  retestRuns?: SecurityRetestRun[];
  open: boolean;
  onClose: () => void;
  onRunRetest: (taskId: string) => void;
  onOpenReport: (reportId: string, taskId: string) => void;
  liveRetestProgress?: LiveRetestProgress | null;
};

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
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }
  return date.toLocaleString('zh-CN');
}

export function RiskRetestLogDrawer({
  group,
  allRows,
  retestRuns = [],
  open,
  onClose,
  onRunRetest,
  onOpenReport,
  liveRetestProgress,
}: RiskRetestLogDrawerProps) {
  if (!open || !group) {
    return null;
  }

  // KPI 统计口径需要与任务表菜单里的 `countRetestRunsForTask(group.rows, taskId)` 对齐。
  // 否则当 `allRows` 包含已关闭/归档历史时会出现“菜单显示 1，但抽屉显示 2”的不一致。
  const scopedRows = group.rows.length > 0 ? group.rows : allRows;
  const runs = buildRetestRunsForTask(scopedRows, group.taskId, retestRuns);
  const latest = runs[0];
  const runningRows = group.rows.filter(isRetestActivelyRunning);
  const running = runningRows.length > 0;
  const runningMeta = runningRows[0]?.metadata as Record<string, unknown> | undefined;
  const runningProgress =
    liveRetestProgress &&
    (liveRetestProgress.taskId === group.taskId ||
      group.rows.some((row) => liveRetestProgress.riskIds.includes(row.id)))
      ? liveRetestProgress.progress
      : runningRows.length > 0
        ? Math.max(...runningRows.map((row) => resolveRetestProgress(row)), 0)
        : 0;

  const host = (
    <div id="rrcRetestLogHost">
      <button
        type="button"
        className="sec-rpt-v2-drawer-mask show"
        aria-label="关闭"
        onClick={onClose}
      />
      <aside className="sec-rpt-v2-drawer show" aria-label="复测记录">
        <div className="sec-rpt-v2-drawer-head">
          <div className="sec-rpt-v2-drawer-head-main">
            <h2>复测记录</h2>
            <p className="sec-rpt-v2-drawer-subtitle">
              {formatTaskDisplayLabel(group.taskId, group.taskName)} · {group.agentName}
            </p>
          </div>
          <button type="button" className="sec-rpt-v2-close" aria-label="关闭" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="sec-rpt-v2-drawer-body">
          {running ? (
            <div className="sec-rpt-v2-drawer-block">
              <h4>当前复测</h4>
              <RetestExecutionProgress
                progress={runningProgress}
                label={
                  (typeof runningMeta?.retestTaskId === 'string' && runningMeta.retestTaskId) ||
                  '复测任务执行中'
                }
              />
            </div>
          ) : null}

          <div className="rrc-retest-log-kpi">
            <div className="rrc-retest-log-kpi-item" data-testid="retest-log-kpi-total">
              <strong>{runs.length}</strong>
              <span>累计复测</span>
            </div>
            <div className="rrc-retest-log-kpi-item">
              <strong className="text-emerald-600">{latest?.pass ?? '—'}</strong>
              <span>最近通过</span>
            </div>
            <div className="rrc-retest-log-kpi-item">
              <strong className={latest?.fail ? 'text-red-600' : 'text-muted-foreground'}>
                {latest?.fail ?? '—'}
              </strong>
              <span>最近失败</span>
            </div>
          </div>

          <div className="sec-rpt-v2-drawer-block">
            <h4>历次复测</h4>
            <div className="rrc-retest-log-list">
              {runs.length === 0 ? (
                <div className="rrc-empty-state">暂无复测记录</div>
              ) : (
                runs.map((run) => {
                  const runProgress =
                    run.status === 'running' &&
                    liveRetestProgress &&
                    (liveRetestProgress.planId === run.batchId ||
                      group.rows.some((row) => liveRetestProgress.riskIds.includes(row.id)))
                      ? liveRetestProgress.progress
                      : run.progress;
                  return (
                    <div key={run.retestScanTaskId ?? run.batchId} className="rrc-retest-log-item">
                      <div className="rrc-retest-log-item-main">
                        <div className="rrc-retest-log-item-time">
                          {formatRelativeTime(run.time)}
                        </div>
                        <div className="rrc-retest-log-item-meta">
                          <code>{run.reportId}</code>
                          {run.batchId !== run.reportId ? (
                            <>
                              {' '}
                              · <code>{run.batchId}</code>
                            </>
                          ) : null}
                        </div>
                        <div className="rrc-retest-log-item-result">
                          {run.status === 'running' ? (
                            <RetestExecutionProgress progress={runProgress} compact />
                          ) : run.status === 'awaiting_confirm' ? (
                            <Badge variant="outline" className="border-violet-200 text-violet-800">
                              待确认
                            </Badge>
                          ) : (
                            <>
                              <b className="text-emerald-600">{run.pass}</b> 通过 ·{' '}
                              <b className={run.fail ? 'rrc-retest-log-fail' : ''}>{run.fail}</b>{' '}
                              失败
                            </>
                          )}
                          <span className="rrc-retest-log-item-summary">{run.summary}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mini-btn shrink-0"
                        onClick={() => onOpenReport(run.reportId, group.taskId)}
                        data-testid="retest-log-view-report"
                      >
                        查看报告
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rrc-retest-log-foot">
            <Button type="button" onClick={() => onRunRetest(group.taskId)}>
              发起复测
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );

  return createPortal(host, document.body);
}

export function buildRetestQueueRows(rows: EnrichedRiskRow[]) {
  return rows.filter(
    (r) =>
      r.status === 'retesting' ||
      (r.metadata &&
        typeof r.metadata === 'object' &&
        (r.metadata as Record<string, unknown>).retestTaskId != null),
  );
}
