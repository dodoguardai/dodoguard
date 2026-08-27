import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type RetestExecutionProgressProps = {
  progress: number;
  compact?: boolean;
  label?: string;
  className?: string;
};

export function RetestExecutionProgress({
  progress,
  compact,
  label,
  className,
}: RetestExecutionProgressProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={cn('rrc-retest-progress', compact && 'is-compact', className)}>
      <div className="rrc-retest-progress-head">
        <span className="rrc-retest-progress-label">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {label || '复测执行中'}
        </span>
        <span className="rrc-retest-progress-value">{safeProgress}%</span>
      </div>
      <div className="rrc-retest-progress-bar" aria-hidden>
        <div className="rrc-retest-progress-fill" style={{ width: `${safeProgress}%` }} />
      </div>
    </div>
  );
}
