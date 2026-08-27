/**
 * Six-tab PoC document suite preview; shell UI in English, report HTML inside iframes unchanged (CN templates).
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FolderArchive } from 'lucide-react';
import { toast } from 'sonner';

import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAttackTaskTypeLabel } from '@/features/tasks/task-type-label';
import { Route as PocSuiteRoute } from '@/routes/_authenticated/reports/poc-suite';
import { agentsApi } from '@/services/api/agents';
import { reportsApi } from '@/services/api/reports';
import { tasksApi } from '@/services/api/tasks';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';

import { buildPocFillContext } from './build-poc-context';
import {
  buildPocSuiteClientZipBlob,
  buildPocSuitePdfDocuments,
  getPocSuiteZipFileName,
  triggerZipDownload,
  type PocSuiteBundleFormat,
} from './download-poc-suite-bundle';
import { fillPocHtml } from './fill-poc-html';
import { POC_DOCUMENTS } from './poc-documents';

export function PocSuitePage() {
  const navigate = useNavigate();
  const { taskId } = PocSuiteRoute.useSearch();
  const [activeTab, setActiveTab] = useState<string>(POC_DOCUMENTS[0].id);
  const [bundleDownloading, setBundleDownloading] = useState(false);

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['task-types'],
    queryFn: () => tasksApi.listTaskTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: task,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['attack-task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
  });

  const { data: taskResultsPayload } = useQuery({
    queryKey: ['attack-task-results', taskId],
    queryFn: () => tasksApi.getResults(taskId!),
    enabled: !!taskId,
  });

  const { data: vulnsListResponse } = useQuery({
    queryKey: ['vulnerabilities', 'for-poc-suite'],
    queryFn: () => vulnerabilitiesApi.list({ limit: 2000 }),
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000,
  });

  const agentIdForTask =
    task?.targetType === 'agent' &&
    task.targetConfig &&
    typeof (task.targetConfig as { agentId?: unknown }).agentId === 'string'
      ? (task.targetConfig as { agentId: string }).agentId
      : undefined;

  const { data: targetAgent } = useQuery({
    queryKey: ['target-agents', agentIdForTask],
    queryFn: () => agentsApi.get(agentIdForTask!),
    enabled: Boolean(agentIdForTask),
  });

  const vulnNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vulnsListResponse?.data ?? []) {
      map.set(v.id, v.name);
    }
    return map;
  }, [vulnsListResponse]);

  const filledById = useMemo(() => {
    if (!task) {
      return null;
    }
    const typeLabel = getAttackTaskTypeLabel(task, taskTypes);
    const ctx = buildPocFillContext(task, typeLabel, {
      results: taskResultsPayload?.results,
      vulnNameById,
      targetAgent: targetAgent ?? null,
    });
    const out: Record<string, string> = {};
    for (const spec of POC_DOCUMENTS) {
      out[spec.id] = fillPocHtml(spec.rawHtml, spec.id, ctx);
    }
    return out;
  }, [task, taskTypes, taskResultsPayload?.results, vulnNameById, targetAgent]);

  const runBundleDownload = async (format: PocSuiteBundleFormat) => {
    if (!taskId || !filledById) {
      return;
    }
    setBundleDownloading(true);
    try {
      const zipName = getPocSuiteZipFileName(task?.name, format);
      if (format === 'pdf') {
        const documents = buildPocSuitePdfDocuments(filledById, POC_DOCUMENTS, task?.name);
        const blob = await reportsApi.downloadPocSuitePdfZip({ taskId, documents });
        triggerZipDownload(blob, zipName);
      } else {
        const blob = await buildPocSuiteClientZipBlob(filledById, POC_DOCUMENTS, format, task?.name);
        triggerZipDownload(blob, zipName);
      }
      toast.success('Bundle downloaded');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Download failed';
      toast.error(message);
    } finally {
      setBundleDownloading(false);
    }
  };

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Agent PoC document suite</h1>
            <p className="text-sm text-muted-foreground">
              This page previews and lets you download six prefilled PoC report templates for the selected task.
            </p>
            {task ? (
              <p className="text-sm text-muted-foreground">
                Task: <span className="font-medium text-foreground">{task.name}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <code className="text-xs">{task.id}</code>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!filledById || !taskId || bundleDownloading}
                >
                  <FolderArchive className="me-2 h-4 w-4" />
                  {bundleDownloading ? 'Preparing…' : 'Download bundle (ZIP)'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>All 6 documents</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void runBundleDownload('pdf')}>
                  PDF (.pdf per file)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runBundleDownload('html')}>
                  HTML (.html per file)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runBundleDownload('md')}>
                  Markdown (.md per file)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!taskId && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No task selected.{' '}
            <Button
              variant="link"
              className="mx-1 h-auto p-0"
              onClick={() =>
                navigate({ to: '/tasks', search: { surface: 'all', status: 'all' } })
              }
            >
              Go to tasks
            </Button>
            , open the row menu, and choose{' '}
            <span className="font-medium text-foreground">PoC document suite (6)</span>.
          </div>
        )}

        {taskId && isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full max-w-md" />
            <Skeleton className="h-[480px] w-full" />
          </div>
        )}

        {taskId && isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Could not load this task. Check the task ID and that you still have access.
          </div>
        )}

        {taskId && task && filledById && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            orientation="vertical"
            className="space-y-4"
          >
            <div className="w-full overflow-x-auto pb-2">
              <TabsList>
                {POC_DOCUMENTS.map((d) => (
                  <TabsTrigger key={d.id} value={d.id} className="whitespace-nowrap">
                    {d.tabLabel}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {POC_DOCUMENTS.map((d) => (
              <TabsContent key={d.id} value={d.id} className="mt-0 min-h-[480px] flex-1">
                <iframe
                  title={d.tabLabel}
                  className="h-[min(70vh,800px)] w-full rounded-lg border bg-background"
                  sandbox="allow-same-origin"
                  srcDoc={filledById[d.id] ?? ''}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </Main>
    </>
  );
}
