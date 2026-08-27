import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RiskBadge } from '@/features/compliance-case-library/shared';
import { formatCaseDuration } from '@/features/detection-scanning/dialogue-task-detail-utils';
import {
  buildRetestResultDisplayModel,
  type EnrichedRiskRow,
} from '@/features/risk-closed-loop/risk-closed-loop-utils';
import { formatDifyResponseForDisplay } from '@/lib/dify-response-preview';
import { cn } from '@/lib/utils';
import type { SecurityScanTask } from '@/types/entities';
import '@/features/risk-closed-loop/risk-closed-loop.css';

export type RetestResultItem = {
  riskId: string;
  result: 'passed' | 'failed';
};

type RiskRetestResultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: EnrichedRiskRow[];
  planId: string;
  retestTask?: SecurityScanTask | null;
  busy?: boolean;
  onSubmit: (items: RetestResultItem[], conclusion: string) => void;
};

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

function DrawerScrollText({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('cmp-drawer-scroll-text', className)}>{children}</div>;
}

function formatResponseText(raw?: string): string {
  if (!raw?.trim()) {
    return '—';
  }
  return formatDifyResponseForDisplay(raw);
}

export function RiskRetestResultDialog({
  open,
  onOpenChange,
  rows,
  planId,
  retestTask,
  busy,
  onSubmit,
}: RiskRetestResultDialogProps) {
  const [results, setResults] = useState<Record<string, 'passed' | 'failed'>>({});
  const [conclusion, setConclusion] = useState('');

  const displayModels = useMemo(
    () => rows.map((row) => buildRetestResultDisplayModel(row, retestTask)),
    [rows, retestTask],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const next: Record<string, 'passed' | 'failed'> = {};
    for (const model of displayModels) {
      next[model.riskId] = model.suggestedResult;
    }
    setResults(next);

    const passedCount = displayModels.filter((model) => model.suggestedResult === 'passed').length;
    const failedCount = displayModels.length - passedCount;
    setConclusion(
      `复测任务 ${planId} 执行完成：自动判定通过 ${passedCount} 项、未通过 ${failedCount} 项，请安全工程师逐项确认。`,
    );
  }, [open, displayModels, planId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="riskRetestResultDialog"
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>复测结果待确认</DialogTitle>
          <DialogDescription>
            任务 <code>{planId}</code> · 参考复测执行记录逐项确认通过/未通过后批量更新风险状态
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {displayModels.map((model) => {
            const selected = results[model.riskId] || model.suggestedResult;
            return (
              <div key={model.riskId} className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{model.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{model.agentName}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={model.riskLevel} />
                    {model.automatedPassed === false ? (
                      <Badge variant="outline" className="border-red-200 text-red-700">
                        自动判定：未通过
                      </Badge>
                    ) : model.automatedPassed === true ? (
                      <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                        自动判定：通过
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 text-amber-800">
                        待人工确认
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div className="cmp-drawer-kv">
                    <div className="cmp-drawer-kv-section-title">风险概览</div>
                    <DrawerKvRow label="场景库">{model.libraryTitle}</DrawerKvRow>
                    <DrawerKvRow label="攻击方式">{model.attackTypeLabel}</DrawerKvRow>
                    <DrawerKvRow label="用例编号">{model.caseCode}</DrawerKvRow>
                    <DrawerKvRow label="风险等级">
                      <RiskBadge level={model.riskLevel} />
                    </DrawerKvRow>
                    {model.responseTimeMs != null ? (
                      <DrawerKvRow label="执行耗时">
                        {formatCaseDuration(model.responseTimeMs)}
                      </DrawerKvRow>
                    ) : null}
                    {model.expectedPass ? (
                      <DrawerKvRow label="期望通过行为" valueClassName="cmp-drawer-kv-pass">
                        <DrawerScrollText>{model.expectedPass}</DrawerScrollText>
                      </DrawerKvRow>
                    ) : null}
                    {model.expectedFail ? (
                      <DrawerKvRow label="期望拒绝表现" valueClassName="cmp-drawer-kv-fail">
                        <DrawerScrollText>{model.expectedFail}</DrawerScrollText>
                      </DrawerKvRow>
                    ) : null}
                    {model.judgeReason ? (
                      <DrawerKvRow label="判定说明" valueClassName="cmp-drawer-kv-mono">
                        <DrawerScrollText className="cmp-drawer-scroll-text-muted">
                          {model.judgeReason}
                        </DrawerScrollText>
                      </DrawerKvRow>
                    ) : null}
                  </div>

                  <div className="cmp-drawer-kv">
                    <div className="cmp-drawer-kv-section-title">执行详情</div>
                    {model.isMultiTurn && model.transcriptText ? (
                      <>
                        <DrawerKvRow label="多轮攻击脚本" valueClassName="cmp-drawer-kv-mono">
                          <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">{model.prompt}</pre>
                        </DrawerKvRow>
                        <DrawerKvRow label="多轮执行记录" valueClassName="cmp-drawer-kv-mono">
                          <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                            {model.transcriptText}
                          </pre>
                        </DrawerKvRow>
                      </>
                    ) : (
                      <>
                        <DrawerKvRow label="测试输入" valueClassName="cmp-drawer-kv-mono">
                          <pre className="cmp-drawer-pre cmp-drawer-pre-multiline">{model.prompt}</pre>
                        </DrawerKvRow>
                        <DrawerKvRow label="Agent 响应" valueClassName="cmp-drawer-kv-mono">
                          <pre className="cmp-drawer-evidence cmp-drawer-evidence-multiline">
                            {formatResponseText(model.responsePreview)}
                          </pre>
                        </DrawerKvRow>
                      </>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label>复测结果确认</Label>
                    <Select
                      value={selected}
                      onValueChange={(value) =>
                        setResults((prev) => ({
                          ...prev,
                          [model.riskId]: value as 'passed' | 'failed',
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">通过 · 可关闭</SelectItem>
                        <SelectItem value="failed">未通过 · 重新整改</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="retest-result-conclusion">复测结论摘要</Label>
          <textarea
            id="retest-result-conclusion"
            className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={conclusion}
            onChange={(event) => setConclusion(event.target.value)}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            稍后确认
          </Button>
          <Button
            type="button"
            disabled={busy || !conclusion.trim()}
            onClick={() =>
              onSubmit(
                rows.map((row) => ({
                  riskId: row.id,
                  result: results[row.id] || 'failed',
                })),
                conclusion.trim(),
              )
            }
          >
            {busy ? '提交中…' : '确认并更新'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
