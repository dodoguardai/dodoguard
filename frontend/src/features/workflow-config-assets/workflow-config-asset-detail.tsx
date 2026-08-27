import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  GitBranch,
  Loader2,
  LogIn,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  StickyNote,
  Variable,
  Wrench,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { DifyStructureWorkflowGraph } from '@/features/dify-config-audit/dify-structure-workflow-graph';
import { WorkflowConfigRawViewer } from '@/features/workflow-config-assets/workflow-config-raw-viewer';
import {
  groupNodeTypeDistribution,
  normalizeWorkflowNodeTypeKey,
  type WorkflowNodeCategoryId,
} from '@/features/workflow-config-assets/workflow-node-type-grouping';
import { getApiClientErrorMessage } from '@/services/api/client';
import { workflowConfigAssetsApi } from '@/services/api/workflow-config-assets';
import type { WorkflowConfigAssetParseSummary } from '@/services/api/workflow-config-assets';

function isParseSummary(v: unknown): v is WorkflowConfigAssetParseSummary {
  return typeof v === 'object' && v !== null;
}

const CATEGORY_ICONS: Record<WorkflowNodeCategoryId, ComponentType<{ className?: string }>> = {
  entry: LogIn,
  llm: Brain,
  knowledge: BookOpen,
  tools: Wrench,
  code_data: Code2,
  variables: Variable,
  control: GitBranch,
  output: MessageSquare,
  annotation: StickyNote,
  other: MoreHorizontal,
};

function humanizeNodeTypeFallback(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) {
    return '—';
  }
  return s
    .replace(/_/g, '-')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function WorkflowConfigAssetDetailPage({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const p = 'pages.workflowConfigAssets.detail';
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [rawMobileOpen, setRawMobileOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setRawMobileOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!graphFullscreen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGraphFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [graphFullscreen]);

  const {
    data: asset,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['workflow-config-assets', assetId, 'full'],
    queryFn: () => workflowConfigAssetsApi.get(assetId, { includeGraph: true, includeRaw: true }),
  });

  const summary = asset?.parseSummary;
  const dsl = isParseSummary(summary) ? summary.dslParseSummary : undefined;
  const distribution = dsl?.node_type_distribution ?? {};
  const distEntries = useMemo(() => {
    return Object.entries(distribution)
      .map(([k, v]) => ({ type: k, count: typeof v === 'number' ? v : 0 }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [distribution]);
  const groupedByCategory = useMemo(() => groupNodeTypeDistribution(distEntries), [distEntries]);
  const distSum = useMemo(() => distEntries.reduce((s, e) => s + e.count, 0), [distEntries]);
  const nodeTotalForShare = useMemo(() => {
    const fromDsl = typeof dsl?.node_count === 'number' ? dsl.node_count : 0;
    const base = fromDsl > 0 ? fromDsl : distSum;
    return base > 0 ? base : 1;
  }, [dsl?.node_count, distSum]);

  const downloadRaw = () => {
    if (!asset?.rawContent) {
      return;
    }
    const ext = asset.rawFormat === 'json' ? 'json' : 'yaml';
    const base = asset.fileName?.replace(/\.[^.]+$/, '') || asset.name || 'config-asset';
    const blob = new Blob([asset.rawContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAssetId = async () => {
    if (!asset?.id) {
      return;
    }
    try {
      await navigator.clipboard.writeText(asset.id);
      setCopiedId(true);
      toast.success(t(`${p}.copyIdToast`));
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.error(t(`${p}.copyIdError`));
    }
  };

  const notSupported =
    isError &&
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === 501;

  if (isLoading) {
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
        <Main className="flex flex-1 flex-col">
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </Main>
      </>
    );
  }

  if (notSupported) {
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
        <Main className="flex flex-1 flex-col gap-6">
          <div className="container max-w-4xl">
            <Alert variant="destructive">
              <AlertTitle>{t(`${p}.notSupportedTitle`)}</AlertTitle>
              <AlertDescription>{t(`${p}.notSupportedBody`)}</AlertDescription>
            </Alert>
          </div>
        </Main>
      </>
    );
  }

  if (isError || !asset) {
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
        <Main className="flex flex-1 flex-col gap-6">
          <div className="container max-w-4xl space-y-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/workflow-config-assets">
                <ArrowLeft className="mr-2 size-4" />
                {t(`${p}.backList`)}
              </Link>
            </Button>
            <Alert variant="destructive">
              <AlertTitle>{t(`${p}.loadError`)}</AlertTitle>
              <AlertDescription>{getApiClientErrorMessage(error)}</AlertDescription>
            </Alert>
          </div>
        </Main>
      </>
    );
  }

  const truncatedGraph =
    isParseSummary(summary) && (summary.inventoryTruncated || summary.normalizedMeta?.truncated);

  const hasGraph = asset.parseStatus === 'ok' && Boolean(asset.graphSnapshot?.nodes?.length);

  const graphEmptyPlaceholder =
    asset.parseStatus === 'failed'
      ? t(`${p}.noGraphParseFailed`)
      : asset.parseStatus === 'ok'
        ? t(`${p}.noGraphOkButEmpty`)
        : t(`${p}.noGraph`);

  const graphNodeCount = asset.graphSnapshot?.nodes?.length ?? 0;
  const totalNodesMeta = isParseSummary(summary)
    ? summary.normalizedMeta?.node_count_total
    : undefined;
  const truncatedCountMismatch =
    Boolean(truncatedGraph) &&
    typeof totalNodesMeta === 'number' &&
    graphNodeCount > 0 &&
    totalNodesMeta > graphNodeCount;

  const statsBody: ReactNode = (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm">
          <div className="text-muted-foreground text-xs">{t(`${p}.nodeTotal`)}</div>
          <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">
            {dsl?.node_count ?? '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm">
          <div className="text-muted-foreground text-xs">{t(`${p}.edgeTotal`)}</div>
          <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">
            {dsl?.edge_count ?? '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm">
          <div className="text-muted-foreground text-xs">{t(`${p}.branchEdges`)}</div>
          <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">
            {dsl?.branch_count ?? '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/80 px-3 py-2.5 shadow-sm">
          <div className="text-muted-foreground text-xs">{t(`${p}.refTokens`)}</div>
          <div className="text-xl font-semibold tabular-nums leading-tight tracking-tight">
            {dsl?.ref_count ?? '—'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t(`${p}.byTypeGrouped`)}</div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t(`${p}.byTypeGroupedHint`)}
        </p>
      </div>

      {distEntries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t(`${p}.noDistribution`)}</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {groupedByCategory.map((group) => {
            const Icon = CATEGORY_ICONS[group.id];
            return (
              <div
                key={group.id}
                className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-sm shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-2.5 py-2 dark:bg-muted/20">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background/90 text-muted-foreground ring-1 ring-border/40">
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-tight">
                      {t(`${p}.category.${group.id}`)}
                      <span className="text-muted-foreground font-normal">
                        （{t(`${p}.categoryTypeCount`, { n: group.items.length })}）
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[11px] tabular-nums leading-tight">
                      {t(`${p}.categoryNodeTotal`, { count: group.total })}
                    </div>
                  </div>
                </div>
                <ul className="divide-y divide-border/50">
                  {group.items.map(({ type, count }) => {
                    const nk = normalizeWorkflowNodeTypeKey(type);
                    const labelKey = `${p}.nodeTypeLabels.${nk}`;
                    const label = t(labelKey, { defaultValue: humanizeNodeTypeFallback(type) });
                    const pctOfWorkflow = (count / nodeTotalForShare) * 100;
                    const barPct = Math.min(100, Math.max(0, pctOfWorkflow));
                    return (
                      <li key={type} className="px-0 py-0">
                        <Link
                          to="/workflow-config-assets/$assetId/node-type-detail"
                          params={{ assetId }}
                          search={{ nodeType: type }}
                          className="hover:bg-muted/35 block px-2.5 py-2 text-[13px] transition-colors"
                        >
                          <div className="flex cursor-pointer items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium leading-tight" title={type}>
                                {label}
                              </div>
                              <div className="text-muted-foreground truncate font-mono text-[10px] leading-tight">
                                {type}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-sm font-semibold tabular-nums">{count}</span>
                              <div className="text-muted-foreground text-[10px] tabular-nums leading-tight">
                                {t(`${p}.shareOfNodes`, { pct: pctOfWorkflow.toFixed(0) })}
                              </div>
                            </div>
                          </div>
                          <Progress value={barPct} className="mt-1.5 h-1" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const rawSectionInner = asset.rawContent ? (
    <WorkflowConfigRawViewer
      key={asset.id}
      rawContent={asset.rawContent}
      rawFormat={asset.rawFormat}
    />
  ) : (
    <p className="text-muted-foreground text-sm">{t(`${p}.noRaw`)}</p>
  );

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

      <Main className="flex min-h-0 flex-1 flex-col gap-4 bg-muted/15 py-2 md:py-3 dark:bg-muted/5">
        <div className="container flex max-w-[1400px] min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                <Link to="/workflow-config-assets">
                  <ArrowLeft className="mr-2 size-4" />
                  {t(`${p}.backList`)}
                </Link>
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{asset.sourceType}</Badge>
                <Badge variant={asset.parseStatus === 'ok' ? 'default' : 'destructive'}>
                  {asset.parseStatus}
                </Badge>
                <span className="text-xs tabular-nums">{asset.parserVersion}</span>
                {asset.createdAt && (
                  <span>
                    {t(`${p}.created`)}: {format(new Date(asset.createdAt), 'yyyy-MM-dd HH:mm')}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground font-mono text-xs break-all">
                <span className="mr-2 font-sans text-muted-foreground">
                  {t(`${p}.assetIdLabel`)}
                </span>
                {asset.id}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={copyAssetId}>
                {copiedId ? (
                  <Check className="size-4 text-emerald-600" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {t(`${p}.copyId`)}
              </Button>
              {asset.rawContent ? (
                <Button variant="outline" size="sm" className="gap-2" onClick={downloadRaw}>
                  <Download className="size-4" aria-hidden />
                  {t(`${p}.download`)}
                </Button>
              ) : null}
            </div>
          </div>

          {asset.parseStatus === 'failed' && asset.parseError && (
            <Alert variant="destructive">
              <AlertTitle>{t(`${p}.parseFailed`)}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="whitespace-pre-wrap">{asset.parseError}</p>
                <p className="text-sm opacity-90">{t(`${p}.parseFailedHint`)}</p>
              </AlertDescription>
            </Alert>
          )}

          {truncatedGraph ? (
            <Alert>
              <AlertTitle>{t(`${p}.truncatedTitle`)}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{t(`${p}.truncatedBody`)}</p>
                {truncatedCountMismatch ? (
                  <p className="text-sm font-medium text-foreground">
                    {t(`${p}.truncatedCountsDetail`, {
                      shown: graphNodeCount,
                      total: totalNodesMeta,
                    })}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col gap-6">
            <div>
              <Card className="hidden overflow-hidden border-border/80 shadow-sm md:block">
                <CardHeader className="border-b border-border/50 bg-muted/15 pb-4">
                  <CardTitle className="text-lg">{t(`${p}.statsTitle`)}</CardTitle>
                  <CardDescription>{t(`${p}.statsHint`)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">{statsBody}</CardContent>
              </Card>

              <Collapsible defaultOpen={false} className="group/cstat md:hidden">
                <Card className="overflow-hidden border-border/80 shadow-sm">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 border-b border-border/50 bg-muted/15 px-6 py-4 text-left transition-colors hover:bg-muted/25"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-lg font-semibold">{t(`${p}.statsTitle`)}</div>
                        <p className="text-muted-foreground text-sm">{t(`${p}.statsHint`)}</p>
                      </div>
                      <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/cstat:rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-4 pt-4">{statsBody}</CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <Card className="flex min-h-[min(520px,62vh)] flex-1 flex-col overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="shrink-0 border-b border-border/60 bg-gradient-to-r from-muted/40 via-background to-muted/20 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg">{t(`${p}.graphTitle`)}</CardTitle>
                    <CardDescription>{t(`${p}.graphHint`)}</CardDescription>
                  </div>
                  {hasGraph ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 gap-2 shadow-sm"
                      onClick={() => setGraphFullscreen(true)}
                    >
                      <Maximize2 className="size-4" aria-hidden />
                      {t(`${p}.graphFullscreen`)}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
                {hasGraph && !graphFullscreen ? (
                  <DifyStructureWorkflowGraph
                    normalized={asset.graphSnapshot ?? undefined}
                    selectedNodeId={selectedNodeId}
                    onSelectNodeId={setSelectedNodeId}
                    showToolbar
                  />
                ) : hasGraph && graphFullscreen ? (
                  <div className="flex min-h-[min(360px,42vh)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
                    <p className="text-muted-foreground max-w-md text-sm">
                      {t(`${p}.graphFullscreenCardPlaceholder`)}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setGraphFullscreen(false)}
                    >
                      {t(`${p}.graphExitFullscreen`)}
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground max-w-xl mx-auto py-8 px-2 text-center text-sm leading-relaxed">
                    {graphEmptyPlaceholder}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t(`${p}.rawTitle`)}</CardTitle>
                <CardDescription>{t(`${p}.rawHint`)}</CardDescription>
              </CardHeader>
              <CardContent className="hidden md:block">{rawSectionInner}</CardContent>
              <CardContent className="md:hidden">
                <Collapsible
                  open={rawMobileOpen}
                  onOpenChange={setRawMobileOpen}
                  className="group/raw"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      className="mb-3 w-full justify-between gap-2 font-normal"
                    >
                      <span>{rawMobileOpen ? t(`${p}.rawCollapse`) : t(`${p}.rawExpand`)}</span>
                      <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/raw:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>{rawSectionInner}</CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>

      {graphFullscreen && hasGraph ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-background/98 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={t(`${p}.graphFullscreen`)}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-muted/50 via-card/80 to-muted/30 px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {t(`${p}.graphFullscreenBadge`)}
              </p>
              <p className="truncate text-sm font-semibold sm:text-base">{asset.name}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-2"
              onClick={() => setGraphFullscreen(false)}
            >
              <X className="size-4" aria-hidden />
              {t(`${p}.graphExitFullscreen`)}
            </Button>
          </header>
          <div className="min-h-0 flex-1 p-3 sm:p-4">
            <DifyStructureWorkflowGraph
              normalized={asset.graphSnapshot ?? undefined}
              selectedNodeId={selectedNodeId}
              onSelectNodeId={setSelectedNodeId}
              showToolbar
              className="h-full min-h-[50dvh] rounded-xl border-border/60 shadow-lg"
            />
          </div>
          <p className="text-muted-foreground shrink-0 px-4 pb-3 text-center text-xs">
            {t(`${p}.graphFullscreenHint`)}
          </p>
        </div>
      ) : null}
    </>
  );
}
