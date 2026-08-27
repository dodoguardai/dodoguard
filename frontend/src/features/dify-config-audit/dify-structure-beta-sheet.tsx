/**
 * Beta: structured Dify export inventory + LLM finding mapping (heuristic).
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  highestSeverity,
  partitionFindingsByNode,
} from '@/features/coze-config-audit/coze-structure-findings-partition';
import { cn } from '@/lib/utils';
import {
  type DifyConfigAuditFinding,
  type DifyStructuredInventory,
  difyConfigAuditApi,
  type NormalizedWorkflow,
} from '@/services/api/dify-config-audit';
import { DifyStructureWorkflowGraph } from './dify-structure-workflow-graph';
import { riskVariant } from './utils';

function jsonPreview(value: unknown, maxChars: number): string {
  try {
    const s = JSON.stringify(value ?? null, null, 2);
    if (s.length <= maxChars) {
      return s;
    }
    return `${s.slice(0, maxChars)}\n…`;
  } catch {
    return String(value);
  }
}

function SectionBlock({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group rounded-md border">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex h-11 w-full items-center justify-between rounded-none px-3 font-medium"
        >
          {title}
          <ChevronDown className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function DetailsPanel({ details }: { details: Record<string, unknown> }) {
  const kind = (details as { kind?: string }).kind;

  if (kind === 'llm') {
    const d = details as {
      provider?: unknown;
      model?: unknown;
      mode?: unknown;
      completion_param_keys?: unknown;
      prompt_roles?: unknown;
      prompt_preview?: unknown;
    };
    const provider = typeof d.provider === 'string' ? d.provider : '—';
    const model = typeof d.model === 'string' ? d.model : '—';
    const mode = typeof d.mode === 'string' ? d.mode : '—';
    const roles = Array.isArray(d.prompt_roles)
      ? (d.prompt_roles.filter((r) => typeof r === 'string') as string[])
      : [];
    const params = Array.isArray(d.completion_param_keys)
      ? (d.completion_param_keys.filter((r) => typeof r === 'string') as string[])
      : [];
    const preview = typeof d.prompt_preview === 'string' ? d.prompt_preview : undefined;

    return (
      <div className="space-y-2 text-[11px] leading-relaxed">
        <dl className="grid gap-1">
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">Provider</dt>
            <dd className="font-mono">{provider}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">Model</dt>
            <dd className="font-mono">{model}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-20 shrink-0">Mode</dt>
            <dd className="font-mono">{mode}</dd>
          </div>
          {roles.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">Prompt roles</dt>
              <dd>{roles.join(', ')}</dd>
            </div>
          )}
          {params.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">Params</dt>
              <dd>{params.join(', ')}</dd>
            </div>
          )}
        </dl>
        {preview && (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
              Prompt preview
            </p>
            <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-[10px] leading-snug whitespace-pre-wrap">
              {preview}
            </pre>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Raw JSON</p>
          <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-[10px] leading-relaxed">
            {jsonPreview(details, 6_000)}
          </pre>
        </div>
      </div>
    );
  }

  if (kind === 'knowledge-retrieval') {
    const d = details as {
      dataset_ids?: unknown;
      dataset_names?: unknown;
      retrieval_mode?: unknown;
      top_k?: unknown;
      score_threshold?: unknown;
      metadata_filtering_mode?: unknown;
      query_variable_selector?: unknown;
      multiple_retrieval_config?: unknown;
    };
    const ids = Array.isArray(d.dataset_ids)
      ? (d.dataset_ids.filter((x) => typeof x === 'string') as string[])
      : [];
    const names = Array.isArray(d.dataset_names)
      ? (d.dataset_names.filter((x) => typeof x === 'string') as string[])
      : [];

    return (
      <div className="space-y-2 text-[11px] leading-relaxed">
        <dl className="grid gap-1">
          {names.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Datasets</dt>
              <dd>{names.join(', ')}</dd>
            </div>
          )}
          {ids.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Dataset IDs</dt>
              <dd className="font-mono text-[10px]">
                {ids.length > 3
                  ? `${ids.slice(0, 3).join(', ')} … (${ids.length})`
                  : ids.join(', ')}
              </dd>
            </div>
          )}
          {d.retrieval_mode != null && d.retrieval_mode !== '' && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Mode</dt>
              <dd className="font-mono text-[10px]">{String(d.retrieval_mode)}</dd>
            </div>
          )}
          {d.metadata_filtering_mode != null && d.metadata_filtering_mode !== '' && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Metadata filter</dt>
              <dd className="font-mono text-[10px]">{String(d.metadata_filtering_mode)}</dd>
            </div>
          )}
          {d.top_k !== undefined && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">top_k</dt>
              <dd className="font-mono text-[10px]">{String(d.top_k)}</dd>
            </div>
          )}
          {d.score_threshold !== undefined && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Score threshold</dt>
              <dd className="font-mono text-[10px]">{String(d.score_threshold)}</dd>
            </div>
          )}
          {Array.isArray(d.query_variable_selector) && d.query_variable_selector.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Query vars</dt>
              <dd className="font-mono text-[10px]">{d.query_variable_selector.join(', ')}</dd>
            </div>
          )}
          {d.multiple_retrieval_config != null && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-24 shrink-0">Multi-retrieval</dt>
              <dd className="font-mono text-[10px]">
                {(() => {
                  const m = d.multiple_retrieval_config as any;
                  const parts: string[] = [];
                  if (m.top_k !== undefined) {
                    parts.push(`top_k=${m.top_k}`);
                  }
                  if (m.reranking_enable !== undefined) {
                    parts.push(`rerank=${String(m.reranking_enable)}`);
                  }
                  if (m.reranking_model?.model || m.reranking_model?.provider) {
                    parts.push(
                      `model=${m.reranking_model.model ?? '—'}/${m.reranking_model.provider ?? '—'}`,
                    );
                  }
                  return parts.join(', ');
                })()}
              </dd>
            </div>
          )}
        </dl>
        <div>
          <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Raw JSON</p>
          <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-[10px] leading-relaxed">
            {jsonPreview(details, 6_000)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-[10px] leading-relaxed">
      {jsonPreview(details, 12_000)}
    </pre>
  );
}

export interface DifyStructureBetaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yamlText: string;
  findings?: DifyConfigAuditFinding[] | null;
}

export function DifyStructureBetaSheet({
  open,
  onOpenChange,
  yamlText,
  findings,
}: DifyStructureBetaSheetProps) {
  const trimmed = yamlText.trim();
  const findingList = findings ?? [];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dify-config-structure', trimmed],
    queryFn: () => difyConfigAuditApi.structure({ yaml: trimmed }),
    enabled: open && trimmed.length > 0,
    staleTime: 60_000,
  });

  const inventory: DifyStructuredInventory | undefined = data?.inventory;
  const truncated = data?.truncated ?? false;
  const normalized: NormalizedWorkflow | undefined = data?.normalized;
  const parseSummary = data?.parseSummary;
  const parseErrors = data?.parseErrors ?? normalized?.parse_errors ?? [];

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { byNodeId, unmatched } = useMemo(() => {
    if (!inventory?.nodes?.length) {
      return {
        byNodeId: new Map<string, DifyConfigAuditFinding[]>(),
        unmatched: findingList,
      };
    }
    return partitionFindingsByNode(findingList, inventory.nodes);
  }, [inventory?.nodes, findingList]);

  const groupKeys = useMemo(() => {
    if (!inventory?.nodesByGroup) {
      return [];
    }
    return Object.keys(inventory.nodesByGroup).sort((a, b) => a.localeCompare(b));
  }, [inventory?.nodesByGroup]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full max-h-svh w-full min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="shrink-0 border-b p-4 text-start">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            Structured explorer
            <Badge variant="secondary" className="text-[10px] font-normal">
              Beta
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Parsed Dify workflow nodes and variables. Findings map by UUID, node id, title, workflow
            graph node index, or logical JSON pointer paths when the audit cites them.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4">
          {!trimmed && <p className="text-muted-foreground text-sm">No YAML loaded.</p>}

          {trimmed && isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Parsing structure…
            </div>
          )}

          {trimmed && isError && (
            <div className="space-y-2">
              <p className="text-destructive text-sm">
                {error instanceof Error ? error.message : 'Failed to load structure'}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}

          {trimmed && inventory && (
            <div className="flex min-h-0 flex-1 flex-col space-y-3 pb-8">
              {truncated && (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  Node list was truncated to the first 100 nodes for performance.
                </p>
              )}
              {inventory.structureSearchBlobTruncated && (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  Structure search blob was truncated for rule evaluation size limits.
                </p>
              )}
              {normalized?.meta?.truncated && (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  Normalized graph may omit nodes beyond the same cap; totals:{' '}
                  {normalized.meta.node_count_total} nodes, {normalized.meta.edge_count_total}{' '}
                  edges.
                </p>
              )}

              <Tabs defaultValue="graph" className="flex min-h-0 flex-1 flex-col gap-2">
                <TabsList className="grid w-full shrink-0 grid-cols-4">
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="dataflow">Dataflow</TabsTrigger>
                  <TabsTrigger value="parse">Parse</TabsTrigger>
                </TabsList>

                <TabsContent
                  value="graph"
                  className="mt-0 min-h-0 flex-1 overflow-hidden outline-none"
                >
                  <p className="text-muted-foreground mb-2 text-xs">
                    Pan and zoom the canvas; click a node to highlight it in the Inventory tab. Edge
                    colors: green true-branch, amber false, red fail-branch, purple custom branch.
                  </p>
                  <DifyStructureWorkflowGraph
                    normalized={normalized}
                    selectedNodeId={selectedNodeId}
                    onSelectNodeId={setSelectedNodeId}
                  />
                </TabsContent>

                <TabsContent value="inventory" className="mt-0 space-y-3 outline-none">
                  <SectionBlock title="App">
                    <dl className="grid gap-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Name</dt>
                        <dd>{inventory.app?.name ?? '—'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Mode</dt>
                        <dd>{inventory.app?.mode ?? '—'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Version</dt>
                        <dd>{inventory.version ?? '—'}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Edges</dt>
                        <dd>{inventory.edgeCount}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground w-28 shrink-0">Structure schema</dt>
                        <dd className="font-mono text-xs">{inventory.structureSchemaVersion}</dd>
                      </div>
                      {normalized && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground w-28 shrink-0">DSL normalize</dt>
                          <dd className="font-mono text-xs">
                            v{normalized.normalizedSchemaVersion}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </SectionBlock>

                  <SectionBlock title="Workflow variables">
                    <p className="text-muted-foreground mb-2 text-xs">Conversation variables</p>
                    <pre className="bg-muted mb-4 max-h-40 overflow-auto rounded-md p-2 text-xs">
                      {jsonPreview(inventory.conversationVariables, 8000)}
                    </pre>
                    <p className="text-muted-foreground mb-2 text-xs">Environment variables</p>
                    <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
                      {jsonPreview(inventory.environmentVariables, 8000)}
                    </pre>
                  </SectionBlock>

                  <SectionBlock title="Dependencies">
                    <pre className="bg-muted max-h-48 overflow-auto rounded-md p-2 text-xs">
                      {jsonPreview(inventory.dependencies, 12000)}
                    </pre>
                  </SectionBlock>

                  <SectionBlock title="Nodes by type" defaultOpen>
                    {groupKeys.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        No workflow nodes in this export.
                      </p>
                    )}
                    <div className="space-y-6">
                      {groupKeys.map((group) => (
                        <div key={group}>
                          <h4 className="mb-2 font-medium text-sm capitalize">{group}</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[120px]">ID</TableHead>
                                <TableHead>Title / details</TableHead>
                                <TableHead className="w-[100px] text-center">Findings</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(inventory.nodesByGroup[group] ?? []).map((node) => {
                                const nf = byNodeId.get(node.id) ?? [];
                                const hi = highestSeverity(nf);
                                const rowSel = selectedNodeId === node.id;
                                return (
                                  <TableRow
                                    key={node.id}
                                    className={cn(
                                      'cursor-pointer',
                                      rowSel && 'bg-muted/80 hover:bg-muted/80',
                                    )}
                                    onClick={() => setSelectedNodeId(node.id)}
                                  >
                                    <TableCell className="align-top font-mono text-xs">
                                      {node.id}
                                    </TableCell>
                                    <TableCell className="align-top text-sm">
                                      <div className="font-medium">{node.title ?? '—'}</div>
                                      {node.logicalPointer && (
                                        <p className="text-muted-foreground mt-0.5 font-mono text-[10px] leading-snug break-all">
                                          {node.logicalPointer}
                                        </p>
                                      )}
                                      {node.desc && (
                                        <p className="text-muted-foreground mt-1 text-xs">
                                          {node.desc}
                                        </p>
                                      )}
                                      {node.details && Object.keys(node.details).length > 0 && (
                                        <Collapsible className="group/nodedetails mt-2 rounded-md border">
                                          <CollapsibleTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-full justify-between px-2 text-xs font-normal"
                                            >
                                              Details
                                              <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]/nodedetails:rotate-180" />
                                            </Button>
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="border-t px-2 py-2">
                                            <DetailsPanel details={node.details} />
                                          </CollapsibleContent>
                                        </Collapsible>
                                      )}
                                      {nf.length > 0 && (
                                        <ul className="mt-2 space-y-2 border-s-2 border-muted ps-3">
                                          {nf.map((f, i) => (
                                            <li key={`${f.location}-${i}`} className="text-xs">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant={riskVariant(f.severity)}>
                                                  {f.severity}
                                                </Badge>
                                                <span className="text-muted-foreground">
                                                  {f.category}
                                                </span>
                                              </div>
                                              <p className="mt-1">{f.issue}</p>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </TableCell>
                                    <TableCell className="align-top text-center">
                                      {hi ? (
                                        <Badge
                                          variant={riskVariant(hi)}
                                          className={cn('tabular-nums')}
                                        >
                                          {nf.length}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">0</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  </SectionBlock>

                  {findingList.length > 0 && unmatched.length > 0 && (
                    <SectionBlock title="Findings not linked to a node" defaultOpen>
                      <p className="text-muted-foreground mb-2 text-xs">
                        These audit locations did not match any node id, UUID, title prefix, graph
                        index, or logical pointer.
                      </p>
                      <ul className="space-y-3">
                        {unmatched.map((f, i) => (
                          <li
                            key={`unmatched-${f.location}-${i}`}
                            className="rounded-md border p-3 text-sm"
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <Badge variant={riskVariant(f.severity)}>{f.severity}</Badge>
                              <span className="font-medium">{f.category}</span>
                            </div>
                            <p className="text-muted-foreground text-xs">{f.location}</p>
                            <p className="mt-2">{f.issue}</p>
                          </li>
                        ))}
                      </ul>
                    </SectionBlock>
                  )}
                </TabsContent>

                <TabsContent value="dataflow" className="mt-0 outline-none">
                  <p className="text-muted-foreground mb-3 text-xs">
                    Derived produces / consumes and references from the normalized DSL parse (spec
                    v2).
                  </p>
                  {normalized?.nodes?.length ? (
                    <div className="max-h-[min(480px,50vh)] overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[140px]">Node</TableHead>
                            <TableHead>Produces</TableHead>
                            <TableHead>Consumes</TableHead>
                            <TableHead className="w-[72px] text-center">Refs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {normalized.nodes.map((n) => (
                            <TableRow
                              key={n.node_id}
                              className={cn(
                                'cursor-pointer',
                                selectedNodeId === n.node_id && 'bg-muted/80',
                              )}
                              onClick={() => setSelectedNodeId(n.node_id)}
                            >
                              <TableCell className="align-top font-mono text-xs">
                                <div className="font-medium">{n.title}</div>
                                <div className="text-muted-foreground">{n.node_id}</div>
                              </TableCell>
                              <TableCell className="align-top text-xs">
                                {(n.produces ?? []).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="align-top text-xs">
                                {(n.consumes ?? []).join(', ') || '—'}
                              </TableCell>
                              <TableCell className="align-top text-center text-xs">
                                {n.refs_in?.length ?? 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No normalized workflow.</p>
                  )}
                </TabsContent>

                <TabsContent value="parse" className="mt-0 space-y-3 outline-none">
                  <SectionBlock title="Summary" defaultOpen>
                    <pre className="bg-muted max-h-56 overflow-auto rounded-md p-2 text-xs">
                      {jsonPreview(parseSummary ?? null, 12_000)}
                    </pre>
                  </SectionBlock>
                  <SectionBlock title="Parse issues" defaultOpen>
                    {parseErrors.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No warnings or errors.</p>
                    ) : (
                      <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                        {parseErrors.map((err, i) => (
                          <li
                            key={`${err.node_id ?? ''}-${i}`}
                            className="rounded border px-2 py-1.5 text-xs"
                          >
                            <Badge variant={err.level === 'error' ? 'destructive' : 'secondary'}>
                              {err.level}
                            </Badge>
                            {err.node_id && (
                              <span className="text-muted-foreground ms-2 font-mono">
                                {err.node_id}
                              </span>
                            )}
                            <p className="mt-1">{err.message}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionBlock>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
