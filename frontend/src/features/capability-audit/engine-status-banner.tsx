import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { EngineRunStatus } from '@/services/api/capability-scan';

type EngineStatusBannerProps = {
  engines: EngineRunStatus[];
  isZh: boolean;
};

const STATUS_VARIANT: Record<
  EngineRunStatus['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  success: 'default',
  skipped: 'secondary',
  failed: 'destructive',
  timeout: 'destructive',
};

export function EngineStatusBanner({ engines, isZh }: EngineStatusBannerProps) {
  if (engines.length === 0) {
    return null;
  }

  const tr = (en: string, zh: string) => (isZh ? zh : en);

  return (
    <Alert className="mb-4">
      <AlertTitle>{tr('Engine runs', '扫描引擎执行')}</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1.5">
          {engines.map((e) => (
            <li key={e.engine} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono">{e.engine}</span>
              <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
              <span className="text-muted-foreground">
                {e.findingCount} {tr('findings', '项')}
                {e.durationMs != null ? ` · ${e.durationMs}ms` : ''}
              </span>
              {e.message && (
                <span className="text-muted-foreground w-full">{e.message}</span>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
