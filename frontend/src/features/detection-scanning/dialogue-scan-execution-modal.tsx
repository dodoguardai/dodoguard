import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { WizardProgressBar } from '@/features/compliance-detection/compliance-wizard-ui';
import { cn } from '@/lib/utils';
import { detectionScanningApi } from '@/services/api/detection-scanning';
import type { SecurityScanTask } from '@/types/entities';
import './dialogue-scan-hero.css';

export type DialogueScanExecutionContext = {
  taskId: string;
  taskName: string;
  agentName: string;
  libraryTitles: string[];
  totalCases: number;
  executeNow: boolean;
};

type DialogueScanExecutionModalProps = {
  context: DialogueScanExecutionContext | null;
  onClose: () => void;
  onComplete?: () => void;
};

type ScanStage = {
  label: string;
  current: string;
};

function buildScanLogs(context: DialogueScanExecutionContext, stageIndex: number): string[] {
  const logs = [
    `读取资产画像：${context.agentName}`,
    ...context.libraryTitles.slice(0, 4).map((title) => `加载攻击场景库：${title}`),
    ...(context.totalCases > 0
      ? [
          '执行样例：多轮套取合规边界说明',
          '执行样例：间接上下文夹带策略提取',
          '执行样例：索取工具调用策略原文',
          '汇总判定：规则命中、语义审查、证据快照入库',
        ]
      : ['等待可执行测试用例：请先导入或启用对话安全测试用例']),
  ];
  return logs.slice(0, Math.min(logs.length, stageIndex + 3));
}

function isTerminalStatus(status: SecurityScanTask['status']): boolean {
  return status === 'completed' || status === 'blocked' || status === 'canceled';
}

export function DialogueScanExecutionModal({
  context,
  onClose,
  onComplete,
}: DialogueScanExecutionModalProps) {
  const navigate = useNavigate();
  const [task, setTask] = useState<SecurityScanTask | null>(null);
  const [stage, setStage] = useState<ScanStage>({ label: '任务调度', current: '初始化检测任务' });
  const [logCount, setLogCount] = useState(3);
  const executeStartedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollTask = useCallback(async () => {
    if (!context) {
      return;
    }
    try {
      const latest = await detectionScanningApi.getTask(context.taskId);
      setTask(latest);
      if (latest.status === 'running') {
        const progress = latest.progress || 0;
        setStage({
          label: progress < 35 ? '攻击面识别' : progress < 70 ? '样例执行' : '证据采集',
          current: `扫描中 · ${progress}%`,
        });
      }
      if (isTerminalStatus(latest.status)) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        onComplete?.();
      }
    } catch (error) {
      console.warn('Failed to poll scan task:', error);
    }
  }, [context, onComplete]);

  useEffect(() => {
    if (!context?.executeNow) {
      return;
    }
    if (executeStartedRef.current) {
      return;
    }
    executeStartedRef.current = true;
    void detectionScanningApi
      .executeTask(context.taskId, { mode: 'manual', generateFindings: true })
      .then(() => pollTask())
      .catch((error: Error) => {
        toast.error(error.message || '任务执行失败');
        void pollTask();
      });
  }, [context, pollTask]);

  useEffect(() => {
    if (!context) {
      setTask(null);
      executeStartedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    void pollTask();
    pollRef.current = setInterval(() => {
      void pollTask();
    }, 1500);

    const logTimer = setInterval(() => {
      setLogCount((current) => current + 1);
    }, 1200);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      clearInterval(logTimer);
    };
  }, [context, pollTask]);

  const done = task ? isTerminalStatus(task.status) : false;
  const progress = task?.progress ?? (context?.executeNow ? 8 : 0);
  const findings = (task?.highCount || 0) + (task?.mediumCount || 0) + (task?.lowCount || 0);
  const totalCases = context?.totalCases || 0;
  const doneCases = Math.min(totalCases, Math.round((progress / 100) * Math.max(totalCases, 1)));
  const evidence = Math.max(0, Math.round(doneCases * 0.7));
  const logs = useMemo(
    () => (context ? buildScanLogs(context, logCount) : []),
    [context, logCount],
  );

  const handleStop = async () => {
    if (!context) {
      return;
    }
    try {
      await detectionScanningApi.updateTask(context.taskId, { status: 'canceled' });
      toast.success('任务已停止');
      await pollTask();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '停止任务失败');
    }
  };

  if (!context) {
    return null;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[920px] gap-0 overflow-hidden rounded-[24px] border border-primary/15 p-0"
      >
        <div
          className={cn(
            'bg-gradient-to-br from-slate-50 via-blue-50/40 to-background p-6',
            done && 'from-emerald-50/80 via-slate-50 to-background',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black tracking-tight text-foreground">
                {done ? '扫描完成' : '正在扫描 Agent 对话安全风险'}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {context.agentName} · {stage.label} · {stage.current}
              </p>
              <div className="mt-4">
                <WizardProgressBar value={progress} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn('dialogue-scan-radar scale-75', done && 'is-done')}
                aria-hidden
              />
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-muted-foreground shadow-sm hover:bg-muted/50"
                onClick={onClose}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { value: `${progress}%`, label: '扫描进度' },
              { value: `${doneCases}/${totalCases || '—'}`, label: '样例 / 检测项' },
              { value: String(findings), label: '风险发现' },
              { value: String(evidence), label: '证据快照' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border bg-white px-3 py-2.5 shadow-sm"
              >
                <b className="block text-lg font-black text-[#1f5cff]">{item.value}</b>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 max-h-40 space-y-2 overflow-y-auto rounded-xl border bg-white/80 p-3 font-mono text-xs shadow-inner">
            {logs.map((line, index) => (
              <div key={`${line}-${index}`} className="flex gap-3 text-foreground/85">
                <code className="shrink-0 text-[#1f5cff]/60">{String(index + 1).padStart(2, '0')}</code>
                <span>{line}</span>
              </div>
            ))}
            {!done && context.executeNow ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin text-[#1f5cff]" />
                等待任务调度…
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            {done ? (
              <>
                <Button type="button" variant="outline" onClick={onClose}>
                  返回任务列表
                </Button>
                <Button
                  type="button"
                  className="bg-gradient-to-r from-[#2f6bff] to-[#5b8cff] hover:from-[#2563eb] hover:to-[#4a7cff]"
                  onClick={() => {
                    onClose();
                    void navigate({
                      to: '/scan/technical-risks/$taskId',
                      params: { taskId: context.taskId },
                    });
                  }}
                >
                  查看任务详情
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose}>
                  后台运行
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleStop()}>
                  停止检测
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
