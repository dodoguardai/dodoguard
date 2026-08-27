import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Check, ChevronRight, Layers, Loader2, Network, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { normalizeWorkflowNodeTypeKey } from '@/features/workflow-config-assets/workflow-node-type-grouping';
import { getApiClientErrorMessage } from '@/services/api/client';
import { workflowConfigAssetsApi } from '@/services/api/workflow-config-assets';

function titlesAlign(a: string, b: string): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

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

const p = 'pages.workflowConfigAssets.nodeTypeDetail';

type Props = { assetId: string; nodeType: string };

export function WorkflowConfigAssetNodeTypeDetailPage({ assetId, nodeType }: Props) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  const labelKey = `pages.workflowConfigAssets.detail.nodeTypeLabels.${normalizeWorkflowNodeTypeKey(nodeType)}`;
  const typeLabel = t(labelKey, { defaultValue: humanizeNodeTypeFallback(nodeType) });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['workflow-config-assets', assetId, 'node-type-detail', nodeType],
    queryFn: () => workflowConfigAssetsApi.getNodeTypeDetail(assetId, nodeType),
    enabled: Boolean(assetId && nodeType),
  });

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

  if (isError || !data) {
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
              <Link to="/workflow-config-assets/$assetId" params={{ assetId }} search={{}}>
                <ArrowLeft className="mr-2 size-4" />
                {t(`${p}.backAsset`)}
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

  const empty = data.groups.length === 0;

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

      <Main className="flex min-h-0 flex-1 flex-col gap-4 bg-muted/20 py-2 md:py-3 dark:bg-muted/5">
        <div className="container flex max-w-[1400px] flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Button variant="ghost" size="sm" className="-ml-2 h-8 w-fit px-2 text-xs" asChild>
              <Link to="/workflow-config-assets/$assetId" params={{ assetId }} search={{}}>
                <ArrowLeft className="mr-1.5 size-3.5" />
                {t(`${p}.backAsset`)}
              </Link>
            </Button>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="h-5 font-mono text-[10px] leading-none">
                  {nodeType}
                </Badge>
                <span className="text-muted-foreground truncate text-xs">{data.assetName}</span>
              </div>
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">{typeLabel}</h1>
              <p className="text-muted-foreground line-clamp-2 max-w-4xl text-xs leading-snug md:text-sm">
                {t(`${p}.subtitle`)}
              </p>
            </div>
          </div>

          {empty ? (
            <Alert className="border-border/60 py-3">
              <AlertTitle className="text-sm">{t(`${p}.emptyTitle`)}</AlertTitle>
              <AlertDescription className="text-xs">{t(`${p}.emptyBody`)}</AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-lg border border-border/50 bg-background/80 p-2 shadow-sm dark:bg-background/40 sm:p-3">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {data.groups.map((group) => (
                  <div
                    key={group.fingerprint}
                    className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card text-sm shadow-sm"
                  >
                    <div className="border-b border-border/50 bg-muted/40 px-2.5 py-2 dark:bg-muted/20">
                      <div className="flex min-w-0 items-start gap-1.5">
                        <Layers
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="truncate text-[13px] font-semibold leading-tight text-foreground">
                            {group.label}
                            <span className="text-muted-foreground font-normal">
                              {isZh
                                ? `（${group.nodes.length}）`
                                : ` (${group.nodes.length})`}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] leading-tight text-muted-foreground">
                            <span className="min-w-0 truncate select-all">
                              <span className="text-muted-foreground/80">
                                {t(`${p}.fingerprintPrefix`)}{' '}
                              </span>
                              {group.fingerprint.slice(0, 12)}…
                            </span>
                            {group.otherAgents.length > 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                                <Network className="size-3 opacity-80" aria-hidden />
                                {t(`${p}.otherAgents`, { n: group.otherAgents.length })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <ul className="divide-y divide-border/50">
                      {group.nodes.map((node, idx) => {
                        const ordinal = idx + 1;
                        const total = group.nodes.length;
                        const titleText = String(node.title ?? '').trim();
                        const cardLabel = String(group.label ?? '').trim();
                        const idPart = String(node.nodeId ?? '').trim();
                        /** 标题与卡片资源名相同时不再主行重复标题：主行用节点 ID，副行用序号/提示 */
                        const sameAsCardLabel =
                          Boolean(titleText) && titlesAlign(titleText, cardLabel);
                        const primaryLine = sameAsCardLabel
                          ? idPart || titleText || cardLabel
                          : titleText || cardLabel;
                        const metaLine = sameAsCardLabel
                          ? [
                              total > 1
                                ? t(`${p}.rowOrdinalMeta`, { index: ordinal, total })
                                : t(`${p}.rowSameAsCardMeta`),
                              node.graphType ? node.graphType : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : [
                              idPart,
                              total > 1
                                ? t(`${p}.rowOrdinalMeta`, { index: ordinal, total })
                                : null,
                              node.graphType ? node.graphType : null,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                        return (
                          <li
                            key={node.nodeId}
                            className="flex items-start gap-2 px-2.5 py-1.5 transition-colors hover:bg-muted/30"
                          >
                            <span
                              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400"
                              aria-hidden
                            >
                              <Check className="size-3" strokeWidth={2.5} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium leading-tight">
                                {primaryLine}
                              </div>
                              {metaLine ? (
                                <div className="text-muted-foreground mt-0.5 truncate font-mono text-[10px] leading-tight">
                                  {metaLine}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {group.otherAgents.length > 0 ? (
                      <div className="border-t border-border/50 bg-muted/20 px-2.5 py-2 dark:bg-muted/10">
                        <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
                          <User className="size-3" />
                          {t(`${p}.sharedHeading`)}
                        </div>
                        <ul className="space-y-1">
                          {group.otherAgents.map((o) => {
                            const row = (
                              <>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium leading-tight">
                                    {o.agentName ??
                                      (o.targetAgentId
                                        ? tr('Agent', '智能体')
                                        : tr('Organization library', '组织资产库'))}
                                  </div>
                                  <div className="text-muted-foreground truncate text-[10px] leading-tight">
                                    {o.assetName}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5 tabular-nums text-[10px]">
                                  <Badge variant="secondary" className="h-5 px-1.5 font-normal">
                                    ×{o.nodeCount}
                                  </Badge>
                                  {o.targetAgentId ? (
                                    <ChevronRight className="size-3.5 text-muted-foreground" />
                                  ) : null}
                                </div>
                              </>
                            );
                            return (
                              <li key={`${o.assetId}-${o.targetAgentId || 'org'}`}>
                                {o.targetAgentId ? (
                                  <Link
                                    to="/agents/$agentId"
                                    params={{ agentId: o.targetAgentId }}
                                    className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-xs transition-colors hover:bg-muted/50"
                                  >
                                    {row}
                                  </Link>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-xs opacity-95">
                                    {row}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <div className="border-t border-border/50 px-2.5 py-2">
                        <p className="text-muted-foreground text-[10px] leading-snug">
                          {t(`${p}.noOtherAgents`)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Main>
    </>
  );
}
