import { useEffect, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { updatePatrolPlan } from './create-patrol-plan';
import {
  defaultPeriodicPlanConfig,
  labelFromOptions,
  type PeriodicPlanConfig,
  periodicFailurePolicyOptions,
  periodicFrequencyOptions,
  periodicScopeOptions,
} from './periodic-plan-config';
import { type PatrolRow, patrolPlanFromTask } from './patrol-utils';

type PatrolPlanEditDialogProps = {
  row: PatrolRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
};

function configFromRow(row: PatrolRow): PeriodicPlanConfig {
  const plan = patrolPlanFromTask(row.task);
  const defaults = defaultPeriodicPlanConfig();
  return {
    frequency:
      (plan.frequency as PeriodicPlanConfig['frequency'] | undefined) || defaults.frequency,
    firstRunAt: plan.firstRunAt || defaults.firstRunAt,
    runAtTime: plan.runAtTime || defaults.runAtTime,
    scope: (plan.scope as PeriodicPlanConfig['scope'] | undefined) || defaults.scope,
    replayFailedCases:
      typeof plan.replayFailedCases === 'boolean' ? plan.replayFailedCases : defaults.replayFailedCases,
    enabled: typeof plan.enabled === 'boolean' ? plan.enabled : defaults.enabled,
    failurePolicy:
      (plan.failurePolicy as PeriodicPlanConfig['failurePolicy'] | undefined) ||
      defaults.failurePolicy,
  };
}

export function PatrolPlanEditDialog({
  row,
  open,
  onOpenChange,
  onUpdated,
}: PatrolPlanEditDialogProps) {
  const [taskName, setTaskName] = useState('');
  const [periodicConfig, setPeriodicConfig] = useState<PeriodicPlanConfig>(
    defaultPeriodicPlanConfig(),
  );

  useEffect(() => {
    if (!open || !row) {
      return;
    }
    setTaskName(row.task.name);
    setPeriodicConfig(configFromRow(row));
  }, [open, row]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!row) {
        throw new Error('未选择巡检任务');
      }
      if (!taskName.trim()) {
        throw new Error('请填写计划名称');
      }
      return updatePatrolPlan({
        task: row.task,
        taskName: taskName.trim(),
        periodicConfig,
      });
    },
    onSuccess: () => {
      toast.success('周期巡检计划已更新');
      onOpenChange(false);
      onUpdated?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || '更新周期巡检计划失败');
    },
  });

  const scopeLabel = labelFromOptions(periodicScopeOptions, periodicConfig.scope);
  const frequencyLabel = labelFromOptions(periodicFrequencyOptions, periodicConfig.frequency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑周期巡检计划</DialogTitle>
          <DialogDescription>
            修改计划名称、执行频率与调度时间。保存后下次执行时间将按新配置重新计算。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>计划名称</Label>
            <Input
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
              placeholder="例如：dify - test · 周期巡检"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>巡检频率</Label>
              <Select
                value={periodicConfig.frequency}
                onValueChange={(value) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    frequency: value as PeriodicPlanConfig['frequency'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodicFrequencyOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>巡检范围</Label>
              <Select
                value={periodicConfig.scope}
                onValueChange={(value) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    scope: value as PeriodicPlanConfig['scope'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodicScopeOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>首次执行日期</Label>
              <Input
                type="date"
                value={periodicConfig.firstRunAt}
                onChange={(event) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    firstRunAt: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>执行时间</Label>
              <Input
                type="time"
                value={periodicConfig.runAtTime}
                onChange={(event) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    runAtTime: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>失败处置</Label>
              <Select
                value={periodicConfig.failurePolicy}
                onValueChange={(value) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    failurePolicy: value as PeriodicPlanConfig['failurePolicy'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodicFailurePolicyOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-4">
              <Label>纳入原失败用例回放</Label>
              <Switch
                checked={periodicConfig.replayFailedCases}
                onCheckedChange={(checked) =>
                  setPeriodicConfig((current) => ({
                    ...current,
                    replayFailedCases: checked,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label>启用计划</Label>
              <Switch
                checked={periodicConfig.enabled}
                onCheckedChange={(checked) =>
                  setPeriodicConfig((current) => ({ ...current, enabled: checked }))
                }
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            当前配置：{scopeLabel} · {frequencyLabel} · {periodicConfig.firstRunAt}{' '}
            {periodicConfig.runAtTime}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
