import { cn } from '@/lib/utils';

const DEFAULT_STEPS = ['资产入库', '检测扫描', '安全放行', '风险闭环', '上线观测', '报告审计'];

type GovernanceFlowStripProps = {
  active?: number;
  steps?: string[];
};

export function GovernanceFlowStrip({
  active = 0,
  steps = DEFAULT_STEPS,
}: GovernanceFlowStripProps) {
  return (
    <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
      {steps.map((step, index) => (
        <div key={step} className="flex min-w-fit items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs',
              index <= active
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground',
            )}
          >
            {index + 1}
          </span>
          <span
            className={cn(
              'text-xs',
              index === active ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {step}
          </span>
          {index < steps.length - 1 ? <span className="text-muted-foreground">›</span> : null}
        </div>
      ))}
    </div>
  );
}
