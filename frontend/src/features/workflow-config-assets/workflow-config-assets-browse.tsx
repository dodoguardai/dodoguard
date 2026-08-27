import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { FileUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { workflowConfigAssetsApi } from '@/services/api/workflow-config-assets';
import type { TargetAgent } from '@/types/entities';
import { UploadWorkflowConfigDialog } from './upload-workflow-config-dialog';

/** When agent is a known DSL surface, list API can fix platform filter (matches user expectation on agent page). */
function workflowAssetSourceFilterForAgentType(
  agentType: TargetAgent['type'] | undefined,
): 'dify' | 'coze' | 'fastgpt' | undefined {
  if (agentType === 'dify' || agentType === 'coze' || agentType === 'fastgpt') {
    return agentType;
  }
  return undefined;
}

export type WorkflowConfigAssetsBrowseProps = {
  /** When set, list assets for this agent (uploads scoped to agent + task-linked saves). */
  targetAgentId?: string;
  /** Omit outer page chrome (Header/Main); caller provides layout. */
  embedded?: boolean;
  /** Target agent `type`; when dify/coze/fastgpt, platform filter is fixed to that surface on embedded agent pages. */
  agentSurfaceType?: TargetAgent['type'];
};

export function WorkflowConfigAssetsBrowse({
  targetAgentId,
  embedded,
  agentSurfaceType,
}: WorkflowConfigAssetsBrowseProps) {
  const { t } = useTranslation();
  const p = 'pages.workflowConfigAssets';
  const [q, setQ] = useState('');
  const [sourceType, setSourceType] = useState<string>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const lockedListSourceType = useMemo(
    () =>
      targetAgentId && embedded ? workflowAssetSourceFilterForAgentType(agentSurfaceType) : undefined,
    [targetAgentId, embedded, agentSurfaceType],
  );

  const effectiveSourceType = lockedListSourceType ?? (sourceType === 'all' ? undefined : sourceType);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['workflow-config-assets', { q, sourceType, offset, limit, targetAgentId, effectiveSourceType }],
    queryFn: () =>
      workflowConfigAssetsApi.list({
        limit,
        offset,
        q: q.trim() || undefined,
        sourceType: effectiveSourceType,
        targetAgentId,
      }),
  });

  const notSupported =
    isError &&
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === 501;

  const title = targetAgentId ? t(`${p}.agentScopedTitle`) : t(`${p}.title`);
  const subtitle = targetAgentId ? t(`${p}.agentScopedSubtitle`) : t(`${p}.subtitle`);

  const lockedPlatformLabel =
    lockedListSourceType === 'dify'
      ? 'Dify'
      : lockedListSourceType === 'coze'
        ? 'Coze'
        : lockedListSourceType === 'fastgpt'
          ? 'FastGPT'
          : '';

  return (
    <div className={embedded ? 'space-y-6' : 'container max-w-6xl space-y-6'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={embedded ? 'text-lg font-semibold tracking-tight' : 'text-2xl font-bold tracking-tight'}>
            {title}
          </h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} disabled={notSupported}>
          <FileUp className="mr-2 size-4" />
          {t(`${p}.uploadAction`)}
        </Button>
      </div>

      {notSupported && (
        <Alert variant="destructive">
          <AlertTitle>{t(`${p}.notSupportedTitle`)}</AlertTitle>
          <AlertDescription>{t(`${p}.notSupportedBody`)}</AlertDescription>
        </Alert>
      )}

      {lockedListSourceType ? (
        <div
          className="rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5"
          role="search"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold leading-none">{t(`${p}.filters`)}</h2>
              <p className="text-muted-foreground text-sm leading-snug">
                {t(`${p}.filtersToolbarLockedCaption`, { platform: lockedPlatformLabel })}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-config-assets-q-locked">
                {t(`${p}.search`)}
              </label>
              <Input
                id="workflow-config-assets-q-locked"
                className="min-w-0"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                placeholder={t(`${p}.searchPlaceholderAgentScoped`)}
              />
            </div>
          </div>
        </div>
      ) : (
        <Card className="gap-4 py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t(`${p}.filters`)}</CardTitle>
            <CardDescription>
              {targetAgentId ? t(`${p}.filtersHintAgentScoped`) : t(`${p}.filtersHint`)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-config-assets-q">
                {t(`${p}.search`)}
              </label>
              <Input
                id="workflow-config-assets-q"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                }}
                placeholder={
                  targetAgentId ? t(`${p}.searchPlaceholderAgentScoped`) : t(`${p}.searchPlaceholder`)
                }
              />
            </div>
            <div className="w-full space-y-2 sm:w-48">
              <label className="text-sm font-medium">{t(`${p}.sourceType`)}</label>
              <Select
                value={sourceType}
                onValueChange={(v) => {
                  setSourceType(v);
                  setOffset(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(`${p}.sourceAll`)}</SelectItem>
                  <SelectItem value="dify">Dify</SelectItem>
                  <SelectItem value="fastgpt">FastGPT</SelectItem>
                  <SelectItem value="coze">Coze</SelectItem>
                  <SelectItem value="unknown">unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(`${p}.colName`)}</TableHead>
                  <TableHead>{t(`${p}.colSource`)}</TableHead>
                  <TableHead>{t(`${p}.colStatus`)}</TableHead>
                  <TableHead className="text-right">{t(`${p}.colNodes`)}</TableHead>
                  <TableHead>{t(`${p}.colCreated`)}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.length ? (
                  data.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium max-w-[240px] truncate">{row.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.sourceType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.parseStatus === 'ok' ? 'default' : 'destructive'}>
                          {row.parseStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.nodeCount ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {row.createdAt ? format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm') : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/workflow-config-assets/$assetId" params={{ assetId: row.id }}>
                            {t('common.actions.viewDetails')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground py-12 text-center">
                      {targetAgentId ? t(`${p}.emptyAgentScoped`) : t(`${p}.empty`)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > limit && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            {t(`${p}.prev`)}
          </Button>
          <span className="text-muted-foreground flex items-center text-sm px-2">
            {offset + 1}–{Math.min(offset + limit, data.total)} / {data.total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + limit >= data.total}
            onClick={() => setOffset((o) => o + limit)}
          >
            {t(`${p}.next`)}
          </Button>
        </div>
      )}

      <UploadWorkflowConfigDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        targetAgentId={targetAgentId}
      />
    </div>
  );
}
