import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import { formatPatrolNextRun, mapPatrolStatus, type PatrolRow } from './patrol-utils';

type PatrolTaskDrawerProps = {
  row: PatrolRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PatrolRunSummary = {
  id: string;
  taskId: string;
  startedAt?: string;
  completedAt?: string;
  status?: string;
  mode?: string;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  errorMessage?: string;
};

function readPatrolRuns(row: PatrolRow | null): PatrolRunSummary[] {
  const runs = row?.task.metadata?.patrolRuns;
  if (!Array.isArray(runs)) {
    return [];
  }
  return runs
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as Record<string, unknown>;
      const taskId = typeof record.taskId === 'string' ? record.taskId : '';
      if (!taskId) {
        return null;
      }
      return {
        id: typeof record.id === 'string' ? record.id : `${taskId}-${index}`,
        taskId,
        startedAt: typeof record.startedAt === 'string' ? record.startedAt : undefined,
        completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
        status: typeof record.status === 'string' ? record.status : undefined,
        mode: typeof record.mode === 'string' ? record.mode : undefined,
        highCount: typeof record.highCount === 'number' ? record.highCount : undefined,
        mediumCount: typeof record.mediumCount === 'number' ? record.mediumCount : undefined,
        lowCount: typeof record.lowCount === 'number' ? record.lowCount : undefined,
        errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : undefined,
      };
    })
    .filter(Boolean) as PatrolRunSummary[];
}

function formatRunTime(value?: string): string {
  if (!value) {
    return '时间未记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRunMode(mode?: string): string {
  if (mode === 'scheduled') {
    return '定时执行';
  }
  if (mode === 'manual') {
    return '手动巡检';
  }
  return mode || '未记录';
}

function riskTotal(run: PatrolRunSummary): number {
  return (run.highCount || 0) + (run.mediumCount || 0) + (run.lowCount || 0);
}

function buildAiJudgement(row: PatrolRow): string[] {
  if (row.openFindings.length > 0) {
    return [
      '建议升级为风险闭环事项。',
      '连续巡检命中开放发现项，说明修复可能未完全生效。',
      '建议扩大复测范围并增加原失败用例回放验证。',
    ];
  }
  if (row.task.status === 'completed') {
    return [
      '当前巡检结果正常。',
      '未发现开放安全风险，建议维持当前巡检频率。',
      '若 Prompt、Skill、MCP 或知识库变更，建议自动触发回归巡检。',
    ];
  }
  return [
    '建议按计划执行本轮巡检。',
    '该 Agent 处于上线观测期，建议覆盖原阻断项与变更组件。',
    '如本轮通过，可继续维持当前周期巡检计划。',
  ];
}

export function PatrolTaskDrawer({ row, open, onOpenChange }: PatrolTaskDrawerProps) {
  const navigate = useNavigate();
  const patrolRuns = useMemo(() => readPatrolRuns(row), [row]);
  const latestRunTaskId =
    row && typeof row.task.metadata?.latestPatrolRunTaskId === 'string'
      ? row.task.metadata.latestPatrolRunTaskId
      : row && typeof row.task.runConfig?.latestPatrolRunTaskId === 'string'
        ? row.task.runConfig.latestPatrolRunTaskId
        : '';
  const [selectedRunTaskId, setSelectedRunTaskId] = useState('');

  useEffect(() => {
    if (!open || !row) {
      setSelectedRunTaskId('');
      return;
    }
    setSelectedRunTaskId(latestRunTaskId || patrolRuns[0]?.taskId || '');
  }, [latestRunTaskId, open, patrolRuns, row]);

  const selectedRun = patrolRuns.find((run) => run.taskId === selectedRunTaskId);
  const findingsQuery = useQuery({
    queryKey: ['launch-monitoring-run-findings', selectedRunTaskId],
    queryFn: () => detectionScanningApi.listFindings({ taskId: selectedRunTaskId, limit: 100 }),
    enabled: open && Boolean(selectedRunTaskId),
  });
  const selectedFindings = selectedRunTaskId
    ? findingsQuery.data?.data || []
    : row?.openFindings || [];
  const selectedOpenFindings = selectedFindings.filter((finding) => finding.status === 'open');

  if (!row) {
    return null;
  }

  const aiItems = buildAiJudgement(row);
  const statusLabel = mapPatrolStatus(row.task);
  const agentName = row.asset?.name || row.task.assetName || '未关联资产';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle>{row.task.name}</SheetTitle>
          <SheetDescription>
            {agentName} · {row.plan.scopeLabel || '标准周期巡检'} · {statusLabel}
          </SheetDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-purple-200 text-purple-700">
              定期巡检
            </Badge>
            {row.openFindings.length > 0 ? (
              <Badge variant="outline" className="border-orange-200 text-orange-700">
                复发风险
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                无开放风险
              </Badge>
            )}
            {row.plan.enabled === false ? (
              <Badge variant="outline" className="border-slate-200 text-slate-500">
                已暂停
              </Badge>
            ) : null}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-[18px] border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4">
            <div className="mb-2 text-sm font-black">AI 巡检判断</div>
            <ul className="grid gap-2">
              {aiItems.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground"
                >
                  <span className="font-black text-emerald-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <section className="rounded-2xl border p-4">
            <h4 className="text-sm font-bold">巡检计划</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              巡检范围：{row.plan.scopeLabel || '标准周期巡检'}。 执行频率：
              {row.plan.frequencyLabel || '未设置'}，下次执行 {formatPatrolNextRun(row.plan)}。
              失败处置：{row.plan.failurePolicyLabel || '通知负责人'}。
            </p>
          </section>

          <section className="rounded-2xl border p-4">
            <h4 className="text-sm font-bold">证据与指标</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              当前计划状态 {statusLabel}，最近批次开放发现项 {row.openFindings.length}{' '}
              个，最近批次累计风险 {row.totalRisk} 项。
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <strong className="block text-lg">{row.openFindings.length}</strong>
                <span className="text-xs text-muted-foreground">开放发现项</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <strong className="block text-lg">{row.totalRisk}</strong>
                <span className="text-xs text-muted-foreground">风险计数</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 text-center">
                <strong className="block text-lg">
                  {row.plan.frequencyLabel?.slice(0, 2) || '—'}
                </strong>
                <span className="text-xs text-muted-foreground">巡检频率</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold">巡检批次</h4>
              {patrolRuns.length > 0 ? (
                <Badge variant="outline">最近 {patrolRuns.length} 次</Badge>
              ) : null}
            </div>
            {patrolRuns.length > 0 ? (
              <div className="grid gap-2">
                {patrolRuns.map((run) => {
                  const selected = run.taskId === selectedRunTaskId;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left transition-colors',
                        selected ? 'border-blue-300 bg-blue-50' : 'bg-background hover:bg-muted/30',
                      )}
                      onClick={() => setSelectedRunTaskId(run.taskId)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black">
                          {formatRunTime(run.startedAt || run.completedAt)}
                        </span>
                        <Badge variant="outline">
                          {run.status === 'blocked' ? '异常' : '完成'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{formatRunMode(run.mode)}</span>
                        <span>风险 {riskTotal(run)}</span>
                        <span className="truncate">批次 {run.taskId.slice(0, 8)}</span>
                      </div>
                      {run.errorMessage ? (
                        <p className="mt-1 text-xs text-destructive">{run.errorMessage}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                还没有巡检批次。到点执行或点击“重新巡检”后，这里会显示每一次批次结果。
              </p>
            )}
          </section>

          <section className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold">本次发现项</h4>
              <Badge variant="outline">开放 {selectedOpenFindings.length}</Badge>
            </div>
            {selectedRunTaskId && findingsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">正在读取批次发现项...</p>
            ) : selectedFindings.length > 0 ? (
              <div className="grid gap-2">
                {selectedFindings.slice(0, 8).map((finding) => (
                  <div key={finding.id} className="rounded-xl border bg-muted/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="min-w-0 truncate text-sm">{finding.title}</strong>
                      <Badge
                        variant="outline"
                        className={
                          finding.status === 'open'
                            ? 'border-orange-200 text-orange-700'
                            : 'border-emerald-200 text-emerald-700'
                        }
                      >
                        {finding.status === 'open' ? '开放' : finding.status}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {finding.description}
                    </p>
                  </div>
                ))}
                {selectedFindings.length > 8 ? (
                  <p className="text-center text-xs text-muted-foreground">
                    仅展示前 8 项，共 {selectedFindings.length} 项。
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedRun ? '该批次未产生发现项。' : '请选择一个巡检批次查看发现项。'}
              </p>
            )}
          </section>

          <section className="rounded-2xl border p-4">
            <h4 className="text-sm font-bold">处理时间线</h4>
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-[78px_1fr] gap-2 text-xs">
                <strong>创建</strong>
                <span className="text-muted-foreground">周期巡检计划已创建</span>
              </div>
              <div className="grid grid-cols-[78px_1fr] gap-2 text-xs">
                <strong>状态</strong>
                <span className="text-muted-foreground">当前 {statusLabel}</span>
              </div>
              <div className="grid grid-cols-[78px_1fr] gap-2 text-xs">
                <strong>下次</strong>
                <span className="text-muted-foreground">{formatPatrolNextRun(row.plan)}</span>
              </div>
            </div>
          </section>
        </div>

        <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:justify-start sm:space-x-2">
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                to: '/reports/audit-center/$taskId',
                params: { taskId: selectedRunTaskId || row.task.id },
                search: { category: 'periodic' },
              })
            }
          >
            查看选中批次报告
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
