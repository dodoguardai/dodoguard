/**
 * Coze workflow structure explorer (config-review). Uses coze-config-audit/structure API only.
 */

import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { CozeStructureFlowGraph } from '@/features/coze-config-audit/coze-structure-flow-graph';
import { riskVariant } from '@/features/dify-config-audit/utils';
import { cn } from '@/lib/utils';
import { cozeConfigAuditApi } from '@/services/api/coze-config-audit';
import {
  type DifyConfigAuditFinding,
  type DifyStructuredInventory,
  type NormalizedWorkflow,
} from '@/services/api/dify-config-audit';

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

export interface CozeStructureExplorerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yamlText: string;
  findings?: DifyConfigAuditFinding[] | null;
}

export function CozeStructureExplorerSheet({
  open,
  onOpenChange,
  yamlText,
  findings,
}: CozeStructureExplorerSheetProps) {
  const trimmed = yamlText.trim();
  const findingList = findings ?? [];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['coze-config-structure', trimmed],
    queryFn: () => cozeConfigAuditApi.structure({ yaml: trimmed }),
    enabled: open && trimmed.length > 0,
    staleTime: 60_000,
  });

  const inventory: DifyStructuredInventory | undefined = data?.inventory;
  const truncated = data?.truncated ?? false;
  const normalized: NormalizedWorkflow | undefined = data?.normalized;
  const parseSummary = data?.parseSummary;
  const parseErrors = data?.parseErrors ?? normalized?.parse_errors ?? [];

  const chainApproximate = useMemo(
    () =>
      parseErrors.some(
        (e) =>
          e.message?.includes('sequential chain') ||
          e.message?.includes('sequential order as a fallback'),
      ),
    [parseErrors],
  );

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
            Coze workflow explorer
            <Badge variant="secondary" className="text-[10px] font-normal">
              Beta
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Parsed from Coze export YAML (nodes, types, optional edges). Static rule findings map by
            node id, title prefix, or paths like /nodes/N when present.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4">
          {!trimmed && <p className="text-muted-foreground text-sm">No YAML loaded.</p>}

          {trimmed && isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Parsing Coze structure…
            </div>
          )}

          {trimmed && isError && (
            <div className="space-y-2">
              <p className="text-destructive text-sm">
                {error instanceof Error ? error.message : 'Failed to load Coze structure'}
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

              <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col gap-2">
                <TabsList className="grid w-full shrink-0 grid-cols-5">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="nodes">Nodes</TabsTrigger>
                  <TabsTrigger value="connections">Connections</TabsTrigger>
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                  <TabsTrigger value="parse">Parse</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-3 outline-none">
                  <dl className="grid gap-2 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Workflow name</dt>
                      <dd>{inventory.app?.name ?? '—'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Mode</dt>
                      <dd>{inventory.app?.mode ?? inventory.kind ?? '—'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Schema version</dt>
                      <dd className="font-mono text-xs">{inventory.version ?? '—'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Nodes in YAML</dt>
                      <dd>
                        {normalized?.meta.node_count_total ?? parseSummary?.node_count ?? '—'}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Edges in YAML</dt>
                      <dd>{inventory.edgeCount}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-36 shrink-0">Inventory schema</dt>
                      <dd className="font-mono text-xs">{inventory.structureSchemaVersion}</dd>
                    </div>
                  </dl>
                  {parseSummary?.node_type_distribution &&
                    Object.keys(parseSummary.node_type_distribution).length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Node types (full export)
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead className="w-24 text-right">Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(parseSummary.node_type_distribution)
                              .sort((a, b) => a[0].localeCompare(b[0]))
                              .map(([t, c]) => (
                                <TableRow key={t}>
                                  <TableCell className="font-mono text-xs">{t}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                </TabsContent>

                <TabsContent value="nodes" className="mt-0 space-y-3 outline-none">
                  <SectionBlock title="Workflow metadata">
                    <pre className="bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs">
                      {jsonPreview(
                        {
                          name: inventory.app?.name,
                          mode: inventory.app?.mode ?? inventory.kind,
                          version: inventory.version,
                        },
                        4000,
                      )}
                    </pre>
                  </SectionBlock>
                  <SectionBlock title="Nodes by type" defaultOpen>
                    {groupKeys.length === 0 && (
                      <p className="text-muted-foreground text-sm">No nodes in this export.</p>
                    )}
                    <div className="space-y-6">
                      {groupKeys.map((group) => (
                        <div key={group}>
                          <h4 className="mb-2 font-medium text-sm capitalize">{group}</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[120px]">ID</TableHead>
                                <TableHead>Title / pointer / details</TableHead>
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
                                              Sanitized details (JSON)
                                              <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[state=open]/nodedetails:rotate-180" />
                                            </Button>
                                          </CollapsibleTrigger>
                                          <CollapsibleContent className="border-t px-2 py-2">
                                            <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-[10px] leading-relaxed">
                                              {jsonPreview(node.details, 12_000)}
                                            </pre>
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
                                        <Badge variant={riskVariant(hi)} className="tabular-nums">
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
                        These locations did not match any node id, title prefix, graph index, or
                        logical pointer.
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

                <TabsContent value="connections" className="mt-0 space-y-3 outline-none">
                  {chainApproximate && (
                    <Alert>
                      <AlertTitle>Approximate topology</AlertTitle>
                      <AlertDescription className="text-xs">
                        Some edges come from YAML order or could not be mapped from the export. Use
                        the official Coze editor to confirm real control flow.
                      </AlertDescription>
                    </Alert>
                  )}
                  {normalized?.edges?.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead className="hidden sm:table-cell">Edge id</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {normalized.edges.map((e) => (
                          <TableRow key={e.edge_id}>
                            <TableCell className="font-mono text-xs">{e.source}</TableCell>
                            <TableCell className="font-mono text-xs">{e.target}</TableCell>
                            <TableCell className="hidden font-mono text-[10px] text-muted-foreground sm:table-cell">
                              {e.edge_id}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No edges in the normalized graph (single node or empty).
                    </p>
                  )}
                </TabsContent>

                <TabsContent
                  value="graph"
                  className="mt-0 min-h-0 flex-1 overflow-hidden outline-none"
                >
                  <p className="text-muted-foreground mb-2 text-xs">
                    Pan and zoom; click a node to highlight it in the Nodes tab. Coze exports often
                    use simple links (no Dify-style branch handles).
                  </p>
                  <CozeStructureFlowGraph
                    normalized={normalized}
                    selectedNodeId={selectedNodeId}
                    onSelectNodeId={setSelectedNodeId}
                  />
                </TabsContent>

                <TabsContent value="parse" className="mt-0 space-y-3 outline-none">
                  <p className="text-muted-foreground text-xs">Server parse summary</p>
                  <pre className="bg-muted max-h-56 overflow-auto rounded-md p-2 text-xs">
                    {jsonPreview(parseSummary ?? {}, 16_000)}
                  </pre>
                  {parseErrors.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Warnings / errors
                      </p>
                      <ul className="space-y-2 text-sm">
                        {parseErrors.map((pe, i) => (
                          <li
                            key={`pe-${i}`}
                            className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs"
                          >
                            <span className="font-medium">{pe.level}</span>
                            {pe.node_id && (
                              <span className="text-muted-foreground"> · {pe.node_id}</span>
                            )}
                            <p className="mt-1">{pe.message}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
