import { Fragment } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  MoreHorizontal,
  RotateCcw,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import {
  countRetestRunsForTask,
  countHighRisk,
  DISPLAY_STATUS_CLASS,
  DISPLAY_STATUS_LABEL,
  formatTaskDisplayLabel,
  isRetestActivelyRunning,
  resolveRetestProgress,
  resolveRiskRowLibraryLabel,
  resolveTaskGroupRetestState,
  type EnrichedRiskRow,
  type LiveRetestProgress,
  type TaskRiskGroup,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import type { SecurityRetestRun } from '@/services/api/detection-scanning';
import { RetestExecutionProgress } from '@/features/risk-closed-loop/retest-execution-progress';
import { cn } from '@/lib/utils';

export type TaskTableActions = {
  onRetest: (group: TaskRiskGroup) => void;
  onCopy: (group: TaskRiskGroup) => void;
  onDelete: (group: TaskRiskGroup) => void;
  onRetestLog: (group: TaskRiskGroup) => void;
  onStop: (taskId: string) => void;
  onSelectRisk: (row: EnrichedRiskRow) => void;
};

type RiskTaskTableViewProps = {
  groups: TaskRiskGroup[];
  expandedTasks: Set<string>;
  selectedId?: string | null;
  busy?: boolean;
  liveRetestProgress?: LiveRetestProgress | null;
  retestRunsByTaskId?: Map<string, SecurityRetestRun[]>;
  onToggleTask: (taskId: string) => void;
  actions: TaskTableActions;
};

function TaskRowOps({
  group,
  openCount,
  retestCount,
  stopItems,
  actions,
  busy,
}: {
  group: TaskRiskGroup;
  openCount: number;
  retestCount: number;
  stopItems?: Array<{ taskId: string; label: string }>;
  actions: TaskTableActions;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-start">
      <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="任务操作"
          disabled={busy}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>操作</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {openCount > 0 ? (
          <DropdownMenuItem onClick={() => actions.onRetest(group)}>
            <RotateCcw className="h-4 w-4" />
            批量复测
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => actions.onCopy(group)}>
          <Copy className="h-4 w-4" />
          复制
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => actions.onDelete(group)}
          data-testid="task-delete"
        >
          <Trash2 className="h-4 w-4" />
          删除
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => actions.onRetestLog(group)}
          data-testid="retest-log-open"
        >
          <ClipboardList className="h-4 w-4" />
          复测记录{retestCount > 0 ? ` (${retestCount})` : ''}
        </DropdownMenuItem>
        {stopItems?.length
          ? stopItems.map((item) => (
              <DropdownMenuItem
                key={item.taskId}
                onClick={() => actions.onStop(item.taskId)}
              >
                <StopCircle className="h-4 w-4" />
                {item.label}
              </DropdownMenuItem>
            ))
          : null}
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function RiskTaskTableView({
  groups,
  expandedTasks,
  selectedId,
  busy,
  liveRetestProgress,
  retestRunsByTaskId,
  onToggleTask,
  actions,
}: RiskTaskTableViewProps) {
  if (groups.length === 0) {
    return (
      <div className="rrc-empty-state py-10 text-center text-sm text-muted-foreground">
        暂无评估任务风险
      </div>
    );
  }

  return (
    <div className="rrc-task-table-wrap overflow-x-auto">
      <table className="rrc-task-table">
        <colgroup>
          <col />
          <col />
          <col style={{ width: '72px' }} />
          <col style={{ width: '64px' }} />
          <col style={{ width: '180px' }} />
          <col style={{ width: '96px' }} />
          <col style={{ width: '108px' }} />
          <col style={{ width: '88px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>评估任务 / 风险标题</th>
            <th>检测范围</th>
            <th>风险数</th>
            <th>高危</th>
            <th className="rrc-task-progress-col">进度</th>
            <th>复测</th>
            <th className="rrc-owner-col">负责人</th>
            <th className="rrc-sticky-ops-col">操作</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const expanded = expandedTasks.has(group.taskId);
            const openCount = group.openCount;
            const closedCount = group.rows.length - openCount;
            const hiCount = countHighRisk(group.rows);
            const retestCount = countRetestRunsForTask(
              group.rows,
              group.taskId,
              retestRunsByTaskId?.get(group.taskId),
            );
            const pendingRetest = group.rows.filter(
              (r) => r.displayStatus === 'pending_retest',
            ).length;
            const {
              isRunning,
              progress: runningProgress,
            } = resolveTaskGroupRetestState(group, liveRetestProgress);
            const scanTaskStatus = group.rows[0]?.scanTask?.status;
            const stopScanTaskId = scanTaskStatus === 'running' ? group.taskId : undefined;
            const stopRetestTaskId = isRunning ? liveRetestProgress?.retestTaskId : undefined;
            const stopItems = [
              stopRetestTaskId ? { taskId: stopRetestTaskId, label: '停止复测' } : null,
              stopScanTaskId ? { taskId: stopScanTaskId, label: '停止任务' } : null,
            ].filter((v): v is { taskId: string; label: string } => v != null);
            const owner =
              group.rows.find((r) => r.ownerName)?.ownerName ||
              group.rows[0]?.scanTask?.ownerName ||
              '—';
            const taskLabel = formatTaskDisplayLabel(group.taskId, group.taskName);
            const agentLabel = group.agentName !== '未关联 Agent' ? group.agentName : '—';

            return (
              <Fragment key={group.taskId}>
                <tr className="rrc-task-row" onClick={() => onToggleTask(group.taskId)}>
                  <td>
                    <div className="rrc-task-name flex items-start gap-1">
                      <span className="rrc-toggle mt-0.5 shrink-0">
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">{taskLabel}</div>
                        <div className="rrc-hint">检测对象：{agentLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td>{group.scopeLabel}</td>
                  <td>
                    <b>{openCount}</b>
                    {closedCount > 0 ? (
                      <div className="rrc-hint">共 {group.rows.length} 项</div>
                    ) : null}
                  </td>
                  <td className="rrc-num-red font-semibold">{hiCount || '—'}</td>
                  <td className="rrc-task-progress-col">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {isRunning ? (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-800"
                        >
                          复测中
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          {openCount > 0 ? `待处理 ${openCount}` : '已关闭'}
                        </Badge>
                      )}
                      {isRunning ? (
                        <span className="text-xs text-muted-foreground">
                          {runningProgress}%
                        </span>
                      ) : null}
                    </div>
                    {isRunning ? <Progress value={runningProgress} /> : null}
                  </td>
                  <td>
                    {pendingRetest > 0 ? (
                      <Badge variant="secondary">待复测 {pendingRetest}</Badge>
                    ) : retestCount > 0 ? (
                      <Badge variant="outline">已复测 {retestCount}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="rrc-owner-col">{owner}</td>
                  <td
                    className="rrc-row-ops rrc-sticky-ops-col"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TaskRowOps
                      group={group}
                      openCount={openCount}
                      retestCount={retestCount}
                      stopItems={stopItems.length ? stopItems : undefined}
                      actions={actions}
                      busy={busy}
                    />
                  </td>
                </tr>
                {expanded ? (
                  <tr key={`${group.taskId}-expand`} className="rrc-task-expand-row">
                    <td colSpan={8} className="rrc-task-expand-cell">
                      <div className="rrc-task-risk-subtable">
                        <div className="rrc-task-risk-subtable-head">
                          共发现 {group.rows.length} 个风险
                        </div>
                        {group.rows.map((row) => (
                          <div
                            key={row.id}
                            className={cn(
                              'rrc-task-risk-subrow',
                              selectedId === row.id && 'active',
                            )}
                            onClick={() => actions.onSelectRisk(row)}
                          >
                            <div className="rrc-task-risk-subrow-main min-w-0">
                              <div className="font-medium">{row.title}</div>
                              <div className="rrc-hint">
                                {row.violationNo || row.id.slice(0, 12)}
                              </div>
                            </div>
                            <div className="text-xs">
                              {resolveRiskRowLibraryLabel(row)}
                              <div className="rrc-hint">{row.agentName}</div>
                            </div>
                            <div>
                              <RiskBadge level={row.riskLevel} />
                            </div>
                            <div>
                              <Badge
                                variant="outline"
                                className={DISPLAY_STATUS_CLASS[row.displayStatus]}
                              >
                                {DISPLAY_STATUS_LABEL[row.displayStatus]}
                              </Badge>
                            </div>
                            <div className="text-xs">
                              {isRetestActivelyRunning(row) ? (
                                <RetestExecutionProgress
                                  progress={resolveRetestProgress(
                                    row,
                                    liveRetestProgress?.riskIds.includes(row.id)
                                      ? liveRetestProgress.progress
                                      : undefined,
                                  )}
                                  compact
                                />
                              ) : row.retestStatus === 'not_started' ? (
                                '—'
                              ) : row.retestStatus === 'passed' ? (
                                '已通过'
                              ) : row.retestStatus === 'failed' ? (
                                '未通过'
                              ) : (
                                '复测中'
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
