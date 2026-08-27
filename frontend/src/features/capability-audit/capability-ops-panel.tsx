import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getApiClientErrorMessage } from '@/services/api/client';
import { capabilityScanApi } from '@/services/api/capability-scan';
import { useAuthStore } from '@/stores/auth-store';
import { engineLabel } from 'capability-audit/shared/engines';

type CapabilityOpsPanelProps = {
  isZh: boolean;
};

function phaseLabel(phase: string, isZh: boolean): string {
  const map: Record<string, [string, string]> = {
    phase1: ['Core', '核心'],
    phase2: ['Extended', '扩展'],
    phase3: ['Advanced', '高级'],
    online: ['Online', '在线'],
    debug: ['Debug', '调试'],
  };
  const pair = map[phase];
  return pair ? (isZh ? pair[1] : pair[0]) : phase;
}

function isRuntimeSelectedEngine(engine: { engine: string; available: boolean }): boolean {
  return engine.engine === 'llm' && !engine.available;
}

export function CapabilityOpsPanel({ isZh }: CapabilityOpsPanelProps) {
  const tr = (en: string, zh: string) => (isZh ? zh : en);
  const accessToken = useAuthStore((s) => s.auth.accessToken);

  const enginesQuery = useQuery({
    queryKey: ['capability-engine-status', accessToken],
    queryFn: () => capabilityScanApi.listEngineStatus(),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });

  const engines = enginesQuery.data ?? [];

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {tr('Engine status', '引擎状态')}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => void enginesQuery.refetch()}
          disabled={enginesQuery.isFetching}
          title={tr('Refresh', '刷新')}
        >
          <RefreshCw className={`size-3.5 ${enginesQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {enginesQuery.isLoading && (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {tr('Loading…', '加载中…')}
        </div>
      )}

      {enginesQuery.isError && (
        <div className="space-y-2 py-2 text-center">
          <p className="text-xs text-red-600 dark:text-red-400">
            {getApiClientErrorMessage(enginesQuery.error)}
          </p>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void enginesQuery.refetch()}>
            {tr('Retry', '重试')}
          </Button>
        </div>
      )}

      {!enginesQuery.isLoading && !enginesQuery.isError && (
        <div className="space-y-1.5">
          {engines.map((engine) => {
            const runtimeSelected = isRuntimeSelectedEngine(engine);
            return (
              <div
                key={engine.engine}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-2 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{engineLabel(engine.engine, isZh)}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                      {phaseLabel(engine.phase, isZh)}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground truncate text-[10px]">
                    {engine.version || engine.message || '—'}
                  </div>
                </div>
                <Badge
                  variant={engine.available ? 'secondary' : 'outline'}
                  className={
                    engine.available
                      ? 'shrink-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : runtimeSelected
                        ? 'shrink-0 border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300'
                        : 'shrink-0 text-amber-700 dark:text-amber-400'
                  }
                >
                  {engine.available
                    ? tr('Ready', '可用')
                    : runtimeSelected
                      ? tr('Runtime selected', '运行时选择')
                      : tr('Missing', '缺失')}
                </Badge>
              </div>
            );
          })}
          {engines.length === 0 && (
            <div className="text-muted-foreground py-4 text-center text-xs">
              {tr('No engines configured', '未配置扫描引擎')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
