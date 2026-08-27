import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { lineRangeLabel, YamlLineViewer } from '@/components/rule-hits-location';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CozeStructureExplorerSheet } from '@/features/coze-config-audit/coze-structure-explorer-sheet';
import { DifyStructureBetaSheet } from '@/features/dify-config-audit/dify-structure-beta-sheet';
import { ruleHitsToStructureFindings } from '@/features/dify-config-audit/structure-findings-adapters';
import { cn } from '@/lib/utils';
import { findingsApi } from '@/services/api/findings';
import { tasksApi } from '@/services/api/tasks';
import { vulnerabilitiesApi } from '@/services/api/vulnerabilities';
import type { AttackTask, Finding, FindingDetectionRuleResult } from '@/types/entities';

const configReviewRouteApi = getRouteApi('/_authenticated/tasks/config-review/$taskId');

function aggregateRuleHits(
  findings: Finding[],
  vulnerabilityId: string,
): FindingDetectionRuleResult[] {
  const matches = findings.filter((f) => f.vulnerabilityId === vulnerabilityId);
  const out: FindingDetectionRuleResult[] = [];
  const seen = new Set<string>();
  for (const f of matches) {
    for (const r of f.detectionSummary?.ruleResults ?? []) {
      const k = `${r.ruleId}|${r.matchStart ?? ''}|${r.startLine ?? ''}|${String(r.evidence || '').slice(0, 48)}`;
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

interface TaskConfigReviewPageProps {
  taskId: string;
}

export function TaskConfigReviewPage({ taskId }: TaskConfigReviewPageProps) {
  const navigate = useNavigate();
  const search = configReviewRouteApi.useSearch();
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);

  const {
    data: task,
    isLoading: taskLoading,
    error: taskError,
  } = useQuery<AttackTask>({
    queryKey: ['attack-task', taskId],
    queryFn: () => tasksApi.get(taskId),
  });

  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: ['findings', 'task-config-review', taskId],
    queryFn: () => findingsApi.list({ taskId, limit: 1000 }),
    enabled: Boolean(taskId),
  });

  const { data: vulnsData } = useQuery({
    queryKey: ['vulnerabilities', 'task-config-review'],
    queryFn: () => vulnerabilitiesApi.list({ limit: 2000 }),
  });

  const findings = useMemo(() => (findingsData?.data ?? []) as Finding[], [findingsData?.data]);

  const vulnNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vulnsData?.data ?? []) {
      m.set(v.id, v.name);
    }
    return m;
  }, [vulnsData?.data]);

  const metadata = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const isCozePlatform =
    String(task?.platformFamily ?? '')
      .trim()
      .toLowerCase() === 'coze';

  const configAuditYaml =
    metadata &&
    typeof (metadata as { configAudit?: unknown }).configAudit === 'object' &&
    (metadata as { configAudit?: { yaml?: string; json?: string } }).configAudit
      ? String(
          isCozePlatform
            ? (metadata as { configAudit: { yaml?: string } }).configAudit.yaml || ''
            : (metadata as { configAudit: { yaml?: string; json?: string } }).configAudit.json ||
                (metadata as { configAudit: { yaml?: string } }).configAudit.yaml ||
                '',
        ).trim()
      : '';

  const vulnerabilityRows = useMemo(() => {
    const ids = Array.isArray(task?.vulnerabilities) ? [...task.vulnerabilities] : [];
    const fromFindings = [...new Set(findings.map((f) => f.vulnerabilityId).filter(Boolean))];
    const merged = [...new Set([...ids, ...fromFindings])];
    return merged.map((vulnerabilityId) => {
      const rowFindings = findings.filter((f) => f.vulnerabilityId === vulnerabilityId);
      const primary = rowFindings[0];
      const vulnerable = rowFindings.some((f) => f.finalVerdict?.vulnerable === true);
      const name =
        vulnNameById.get(vulnerabilityId) ?? primary?.vulnerabilityName ?? vulnerabilityId;
      const hits = aggregateRuleHits(findings, vulnerabilityId);
      return {
        vulnerabilityId,
        name,
        vulnerable,
        findingCount: rowFindings.length,
        reason: primary?.finalVerdict?.reason,
        hits,
      };
    });
  }, [task?.vulnerabilities, findings, vulnNameById]);

  const selectedVulnId =
    search.vuln && vulnerabilityRows.some((r) => r.vulnerabilityId === search.vuln)
      ? search.vuln
      : vulnerabilityRows[0]?.vulnerabilityId;

  useEffect(() => {
    if (!taskLoading && vulnerabilityRows.length > 0 && !search.vuln) {
      navigate({
        to: '/tasks/config-review/$taskId',
        params: { taskId },
        search: {
          vuln: vulnerabilityRows[0].vulnerabilityId,
          line: undefined,
          ruleId: undefined,
        },
        replace: true,
      });
    }
  }, [taskLoading, vulnerabilityRows, search.vuln, navigate, taskId]);

  const selectedRow = vulnerabilityRows.find((r) => r.vulnerabilityId === selectedVulnId);
  const highlightHits = selectedRow?.hits ?? [];

  const structureFindings = useMemo(
    () => ruleHitsToStructureFindings(selectedRow?.hits ?? []),
    [selectedRow?.hits],
  );

  const openStructureExplorer = useCallback(() => {
    if (!configAuditYaml) {
      toast.error('Upload or paste YAML first');
      return;
    }
    setStructureSheetOpen(true);
  }, [configAuditYaml]);

  const setSelectedVuln = (vuln: string) => {
    navigate({
      to: '/tasks/config-review/$taskId',
      params: { taskId },
      search: { vuln, line: undefined, ruleId: undefined },
    });
  };

  if (taskLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm">
        Loading task…
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive text-sm">Failed to load task.</p>
        <Button variant="outline" asChild>
          <Link to="/tasks" search={{ surface: 'all', status: 'all' }}>
            Back to tasks
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tasks/$taskId" params={{ taskId }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to task
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight truncate">Config & findings</h1>
          <p className="text-sm text-muted-foreground truncate">{task.name}</p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr] lg:items-stretch">
        <Card className="flex min-h-[320px] flex-col overflow-hidden lg:min-h-0">
          <CardHeader className="shrink-0 py-4">
            <CardTitle className="text-base">Vulnerabilities</CardTitle>
            <CardDescription>
              One shared configuration file; select a row to highlight rule hits on the right.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            {findingsLoading ? (
              <p className="px-6 pb-4 text-sm text-muted-foreground">Loading findings…</p>
            ) : vulnerabilityRows.length === 0 ? (
              <p className="px-6 pb-4 text-sm text-muted-foreground">
                No vulnerabilities on this task yet.
              </p>
            ) : (
              <ScrollArea className="h-[min(70vh,640px)] lg:h-[calc(100vh-14rem)]">
                <ul className="space-y-1 p-4 pt-0">
                  {vulnerabilityRows.map((row) => {
                    const active = row.vulnerabilityId === selectedVulnId;
                    return (
                      <li key={row.vulnerabilityId}>
                        <button
                          type="button"
                          onClick={() => setSelectedVuln(row.vulnerabilityId)}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                            active
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border bg-card hover:bg-muted/50',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium leading-snug wrap-break-word">
                                  {row.name}
                                </span>
                                {row.vulnerable ? (
                                  <Badge variant="destructive" className="shrink-0">
                                    Finding
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="shrink-0">
                                    No finding
                                  </Badge>
                                )}
                                {row.hits.length > 0 && (
                                  <Badge variant="outline" className="shrink-0 tabular-nums">
                                    {row.hits.length} rule hit{row.hits.length === 1 ? '' : 's'}
                                  </Badge>
                                )}
                              </div>
                              {row.reason && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {row.reason}
                                </p>
                              )}
                              {row.hits.length > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                  Lines:{' '}
                                  {row.hits
                                    .map((h) => lineRangeLabel(h))
                                    .filter((s) => s !== '—')
                                    .slice(0, 4)
                                    .join(' · ') || '—'}
                                  {row.hits.length > 4 ? '…' : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[320px] flex-col overflow-hidden lg:min-h-0">
          <CardHeader className="shrink-0 space-y-3 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base">Configuration (YAML)</CardTitle>
                <CardDescription>
                  {selectedRow
                    ? `Highlighting matches for: ${selectedRow.name}`
                    : 'Select a vulnerability on the left.'}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                onClick={openStructureExplorer}
              >
                Structured explorer
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                  Beta
                </Badge>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
            {selectedRow && selectedRow.hits.length > 0 && (
              <div className="shrink-0 space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">
                  Rule hits for this vulnerability
                </p>
                <ul className="space-y-1.5 text-xs">
                  {selectedRow.hits.map((r, i) => (
                    <li key={`${r.ruleId}-${i}`} className="wrap-break-word space-y-0.5">
                      <div>
                        <span className="font-medium">{r.ruleName || r.ruleId}</span>
                        <span className="text-muted-foreground"> · {lineRangeLabel(r)}</span>
                      </div>
                      {(r.logicalPath || lineRangeLabel(r) !== '—') && (
                        <span className="block font-mono text-[10px] text-muted-foreground truncate">
                          {r.logicalPath || lineRangeLabel(r)}
                        </span>
                      )}
                      {configAuditYaml && selectedVulnId && (
                        <Link
                          to="/tasks/config-review/$taskId"
                          params={{ taskId }}
                          search={{
                            vuln: selectedVulnId,
                            line:
                              typeof r.startLine === 'number' && r.startLine > 0
                                ? r.startLine
                                : undefined,
                            ruleId: r.ruleId,
                          }}
                          replace
                          className="inline-block text-[10px] text-primary underline-offset-2 hover:underline"
                        >
                          Scroll to this hit
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <YamlLineViewer
                fullText={configAuditYaml}
                hits={highlightHits}
                scrollToLine={
                  typeof search.line === 'number' && search.line > 0 ? search.line : undefined
                }
                className="h-[min(70vh,720px)] lg:h-[calc(100vh-18rem)]"
                emptyMessage="No YAML in task metadata (config upload). Run a config-static task with uploaded DSL to see the file here."
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {isCozePlatform ? (
        <CozeStructureExplorerSheet
          open={structureSheetOpen}
          onOpenChange={setStructureSheetOpen}
          yamlText={configAuditYaml}
          findings={structureFindings}
        />
      ) : (
        <DifyStructureBetaSheet
          open={structureSheetOpen}
          onOpenChange={setStructureSheetOpen}
          yamlText={configAuditYaml}
          findings={structureFindings}
        />
      )}
    </div>
  );
}
