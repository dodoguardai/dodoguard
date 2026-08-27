/**
 * React Flow graph for normalized Dify workflow (edges + branch kinds).
 */

import '@xyflow/react/dist/style.css';

import { type MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from 'react-i18next';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  NormalizedEdgeKind,
  NormalizedNode,
  NormalizedWorkflow,
} from '@/services/api/dify-config-audit';

const TYPE_ALL = '__all__';

/** Left accent + light tint for default flow nodes (theme-aware via CSS vars where possible). */
function accentForNodeType(nodeType: string): string {
  const t = nodeType.toLowerCase();
  if (/(llm|chat|text|completion|gpt|claude|openai|agent)/i.test(t)) {
    return 'hsl(262 83% 52%)';
  }
  if (/(code|transform|http|tool|api|plugin|action)/i.test(t)) {
    return 'hsl(199 89% 45%)';
  }
  if (/(knowledge|retriev|rag|dataset|index)/i.test(t)) {
    return 'hsl(152 60% 40%)';
  }
  if (/(if|branch|condition|router|question|switch)/i.test(t)) {
    return 'hsl(32 95% 44%)';
  }
  if (/(start|end|answer|reply|output)/i.test(t)) {
    return 'hsl(var(--primary))';
  }
  return 'hsl(var(--muted-foreground) / 0.55)';
}

function strokeForEdgeKind(k: NormalizedEdgeKind): string {
  switch (k) {
    case 'branch_true':
      return 'hsl(142 76% 36%)';
    case 'branch_false':
      return 'hsl(38 92% 50%)';
    case 'fail_branch':
      return 'hsl(0 84% 60%)';
    case 'branch_custom':
      return 'hsl(271 91% 65%)';
    default:
      return 'hsl(var(--muted-foreground) / 0.5)';
  }
}

function layoutPositions(nodes: NormalizedNode[]): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  let withCoords = 0;
  for (const n of nodes) {
    if (n.position.x !== 0 || n.position.y !== 0) {
      withCoords++;
    }
  }
  const map = new Map<string, { x: number; y: number }>();
  if (nodes.length > 0 && withCoords >= Math.ceil(nodes.length * 0.25)) {
    for (const n of nodes) {
      map.set(n.node_id, { x: n.position.x, y: n.position.y });
    }
    return map;
  }

  const layer = new Map<string, number>();
  const roots = nodes.filter((n) => n.upstream.length === 0).map((n) => n.node_id);
  const seeds = roots.length > 0 ? roots : nodes[0] ? [nodes[0].node_id] : [];
  const q = [...seeds];
  for (const s of seeds) {
    layer.set(s, 0);
  }
  while (q.length > 0) {
    const id = q.shift()!;
    const L = layer.get(id) ?? 0;
    const n = byId.get(id);
    for (const d of n?.downstream ?? []) {
      const nextL = Math.max(layer.get(d) ?? 0, L + 1);
      if (!layer.has(d) || (layer.get(d) ?? 0) < nextL) {
        layer.set(d, nextL);
        q.push(d);
      }
    }
  }
  for (const n of nodes) {
    if (!layer.has(n.node_id)) {
      layer.set(n.node_id, 0);
    }
  }
  const cols = new Map<number, string[]>();
  for (const n of nodes) {
    const L = layer.get(n.node_id) ?? 0;
    if (!cols.has(L)) {
      cols.set(L, []);
    }
    cols.get(L)!.push(n.node_id);
  }
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  let x = 0;
  for (const L of colKeys) {
    const ids = (cols.get(L) ?? []).slice().sort();
    ids.forEach((id, i) => {
      map.set(id, { x, y: i * 110 });
    });
    x += 260;
  }
  return map;
}

function toFlowNodes(
  nodes: NormalizedNode[],
  pos: Map<string, { x: number; y: number }>,
  selectedId: string | null,
  visibleIds: Set<string>,
): Node[] {
  return nodes.map((n) => {
    const p = pos.get(n.node_id) ?? { x: 0, y: 0 };
    const visible = visibleIds.has(n.node_id);
    const selected = selectedId === n.node_id;
    const dimOthers = selectedId !== null && !selected && visible;
    const accent = accentForNodeType(n.node_type);
    return {
      id: n.node_id,
      position: p,
      hidden: !visible,
      data: { label: `${n.title}\n${n.node_type}` },
      style: {
        padding: '10px 12px',
        borderRadius: 12,
        fontSize: 11,
        lineHeight: 1.35,
        maxWidth: 220,
        whiteSpace: 'pre-wrap',
        opacity: !visible ? 0 : dimOthers ? 0.38 : 1,
        transition: 'opacity 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        border: selected ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border) / 0.85)',
        borderLeft: `3px solid ${accent}`,
        background: selected ? 'hsl(var(--accent))' : 'hsl(var(--card))',
        boxShadow: selected
          ? '0 0 0 1px hsl(var(--primary) / 0.25), 0 8px 24px -8px hsl(0 0% 0% / 0.18)'
          : '0 2px 10px -4px hsl(0 0% 0% / 0.12), 0 0 0 1px hsl(var(--border) / 0.35)',
        color: 'hsl(var(--foreground))',
      },
    };
  });
}

function toFlowEdges(
  edges: NormalizedWorkflow['edges'],
  visibleIds: Set<string>,
  selectedId: string | null,
): Edge[] {
  return edges.map((e) => {
    const srcOk = visibleIds.has(e.source);
    const tgtOk = visibleIds.has(e.target);
    const hidden = !srcOk || !tgtOk;
    const incident = Boolean(selectedId && (e.source === selectedId || e.target === selectedId));
    const dimEdge = Boolean(selectedId && !incident && !hidden);
    return {
      id: e.edge_id,
      source: e.source,
      target: e.target,
      hidden,
      label: e.edge_kind === 'normal' ? undefined : e.edge_kind,
      style: {
        stroke: strokeForEdgeKind(e.edge_kind),
        strokeWidth: e.edge_kind === 'normal' ? 1.25 : 2.25,
        opacity: hidden ? 0 : dimEdge ? 0.28 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: strokeForEdgeKind(e.edge_kind) },
    };
  });
}

function FitVisibleEffect({ token }: { token: string }) {
  const rf = useReactFlow();
  useEffect(() => {
    const id = window.setTimeout(() => {
      rf.fitView({ padding: 0.15, duration: 200 });
    }, 40);
    return () => window.clearTimeout(id);
  }, [token, rf]);
  return null;
}

function FocusCenterButton({ nodeId }: { nodeId: string | null }) {
  const { t } = useTranslation();
  const g = 'difyStructureGraph';
  const rf = useReactFlow();
  if (!nodeId) {
    return null;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="mt-3 w-full"
      onClick={() => {
        const n = rf.getNode(nodeId);
        if (!n) {
          return;
        }
        const w = n.measured?.width ?? 200;
        const h = n.measured?.height ?? 56;
        rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1.15, duration: 220 });
      }}
    >
      {t(`${g}.focus`)}
    </Button>
  );
}

function NodeInspectPanel({
  normalized,
  selectedNodeId,
  onSelectNodeId,
}: {
  normalized: NormalizedWorkflow;
  selectedNodeId: string | null;
  onSelectNodeId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const g = 'difyStructureGraph';
  const node = normalized.nodes.find((n) => n.node_id === selectedNodeId);

  return (
    <Panel
      position="bottom-left"
      className="m-2 flex max-h-[calc(100%-16px)] w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card/98 shadow-lg backdrop-blur-sm z-[5]"
    >
      <div className="shrink-0 border-b border-border/60 px-3 py-2 text-sm font-semibold leading-tight">
        {t(`${g}.panelTitle`)}
      </div>
      <ScrollArea className="max-h-[min(420px,55vh)] px-3 py-2">
        {!node ? (
          <p className="text-muted-foreground text-xs leading-relaxed">{t(`${g}.selectNode`)}</p>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="font-medium leading-snug">{node.title}</div>
              <Badge variant="secondary" className="mt-1.5 font-normal">
                {node.node_type}
              </Badge>
            </div>
            <dl className="space-y-1 text-xs">
              <div className="flex gap-2">
                <dt className="text-muted-foreground shrink-0">{t(`${g}.nodeId`)}</dt>
                <dd className="min-w-0 font-mono break-all">{node.node_id}</dd>
              </div>
            </dl>
            <FocusCenterButton nodeId={selectedNodeId} />
            <p className="text-muted-foreground text-[10px] leading-snug">{t(`${g}.focusHint`)}</p>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs font-medium">{t(`${g}.payload`)}</div>
              <pre className="max-h-36 overflow-auto rounded-md border border-border/60 bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                {JSON.stringify(node.payload ?? {}, null, 2)}
              </pre>
            </div>
            {node.upstream.length > 0 ? (
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium">{t(`${g}.refsUp`)}</div>
                <div className="flex flex-wrap gap-1">
                  {node.upstream.map((id) => (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 max-w-full truncate px-2 font-mono text-[10px]"
                      title={id}
                      onClick={() => onSelectNodeId(id)}
                    >
                      {id.length > 14 ? `${id.slice(0, 12)}…` : id}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {node.downstream.length > 0 ? (
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium">{t(`${g}.refsDown`)}</div>
                <div className="flex flex-wrap gap-1">
                  {node.downstream.map((id) => (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 max-w-full truncate px-2 font-mono text-[10px]"
                      title={id}
                      onClick={() => onSelectNodeId(id)}
                    >
                      {id.length > 14 ? `${id.slice(0, 12)}…` : id}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {node.branches.length > 0 ? (
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs font-medium">{t(`${g}.branches`)}</div>
                <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
                  {node.branches.map((b, i) => (
                    <li key={`${b.handle}-${b.target}-${i}`}>
                      {b.handle} → {b.target} ({b.edge_kind})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </ScrollArea>
    </Panel>
  );
}

export interface DifyStructureWorkflowGraphProps {
  normalized: NormalizedWorkflow | undefined;
  selectedNodeId: string | null;
  onSelectNodeId: (id: string | null) => void;
  className?: string;
  /** Search, type filter, and node inspect panel (e.g. workflow config asset detail). */
  showToolbar?: boolean;
}

function DifyStructureWorkflowGraphInner({
  normalized,
  selectedNodeId,
  onSelectNodeId,
  className,
  showToolbar = false,
}: DifyStructureWorkflowGraphProps) {
  const { t } = useTranslation();
  const g = 'difyStructureGraph';
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(TYPE_ALL);

  const pos = useMemo(
    () => (normalized?.nodes?.length ? layoutPositions(normalized.nodes) : new Map()),
    [normalized],
  );

  const uniqueTypes = useMemo(() => {
    if (!normalized?.nodes?.length) {
      return [] as string[];
    }
    return [...new Set(normalized.nodes.map((n) => n.node_type))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [normalized]);

  const visibleIds = useMemo(() => {
    if (!normalized?.nodes?.length) {
      return new Set<string>();
    }
    if (!showToolbar) {
      return new Set(normalized.nodes.map((n) => n.node_id));
    }
    const q = searchQuery.trim().toLowerCase();
    const typeOk = (n: NormalizedNode) => typeFilter === TYPE_ALL || n.node_type === typeFilter;
    const searchOk = (n: NormalizedNode) => {
      if (!q) {
        return true;
      }
      return (
        n.title.toLowerCase().includes(q) ||
        n.node_id.toLowerCase().includes(q) ||
        n.node_type.toLowerCase().includes(q)
      );
    };
    return new Set(normalized.nodes.filter((n) => typeOk(n) && searchOk(n)).map((n) => n.node_id));
  }, [normalized, showToolbar, searchQuery, typeFilter]);

  useEffect(() => {
    if (!selectedNodeId || !showToolbar) {
      return;
    }
    if (!visibleIds.has(selectedNodeId)) {
      onSelectNodeId(null);
    }
  }, [selectedNodeId, visibleIds, showToolbar, onSelectNodeId]);

  const fitToken = `${visibleIds.size}|${searchQuery}|${typeFilter}`;

  const initialNodes = useMemo(
    () => toFlowNodes(normalized?.nodes ?? [], pos, selectedNodeId, visibleIds),
    [normalized, pos, selectedNodeId, visibleIds],
  );
  const initialEdges = useMemo(
    () => toFlowEdges(normalized?.edges ?? [], visibleIds, selectedNodeId),
    [normalized, visibleIds, selectedNodeId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(toFlowNodes(normalized?.nodes ?? [], pos, selectedNodeId, visibleIds));
  }, [normalized, pos, selectedNodeId, visibleIds, setNodes]);

  useEffect(() => {
    setEdges(toFlowEdges(normalized?.edges ?? [], visibleIds, selectedNodeId));
  }, [normalized, visibleIds, selectedNodeId, setEdges]);

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      onSelectNodeId(node.id);
    },
    [onSelectNodeId],
  );

  const onPaneClick = useCallback(() => {
    onSelectNodeId(null);
  }, [onSelectNodeId]);

  const shellClass = cn(
    'w-full min-h-[360px] overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/25 via-background to-muted/15 shadow-[inset_0_1px_0_0_hsl(var(--border)/0.35)]',
    showToolbar ? 'flex h-full min-h-0 flex-col' : '',
    className,
  );

  if (!normalized?.nodes?.length) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No normalized nodes to display.
      </p>
    );
  }

  const noMatch =
    showToolbar && normalized.nodes.length > 0 && visibleIds.size === 0;

  const flowBlock = (
    <ReactFlow
      className={cn(
        '[&_.react-flow__controls]:border-border/60 [&_.react-flow__controls]:bg-card/95 [&_.react-flow__controls]:shadow-sm',
        showToolbar ? 'h-full min-h-[280px] flex-1' : 'h-[min(520px,55vh)] min-h-[360px]',
      )}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={1.75}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        id="workflow-structure-bg"
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.15}
        color="hsl(var(--muted-foreground) / 0.14)"
      />
      <Controls
        showInteractive={false}
        position={showToolbar ? 'top-left' : 'bottom-left'}
      />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        className={cn(
          '!overflow-hidden !rounded-lg !border !border-border/60 !bg-card/90 !shadow-md',
          showToolbar && '!m-2',
        )}
        maskColor="hsl(var(--background) / 0.72)"
        nodeStrokeWidth={2}
        nodeColor={(n) => {
          const label = String(n.data?.label ?? '');
          const typeLine = label.split('\n')[1] ?? '';
          return accentForNodeType(typeLine);
        }}
      />
      {showToolbar && normalized ? (
        <>
          <FitVisibleEffect token={fitToken} />
          <NodeInspectPanel
            normalized={normalized}
            selectedNodeId={selectedNodeId}
            onSelectNodeId={onSelectNodeId}
          />
        </>
      ) : null}
    </ReactFlow>
  );

  if (!showToolbar) {
    return <div className={shellClass}>{flowBlock}</div>;
  }

  return (
    <div className={shellClass}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-2 py-2">
        <div className="relative min-w-[min(100%,12rem)] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(`${g}.searchPlaceholder`)}
            aria-label={t(`${g}.searchPlaceholder`)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger size="sm" className="w-[min(100%,14rem)]">
            <SelectValue placeholder={t(`${g}.typeFilter`)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_ALL}>{t(`${g}.typeAll`)}</SelectItem>
            {uniqueTypes.map((ty) => (
              <SelectItem key={ty} value={ty}>
                {ty}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="relative flex min-h-[280px] flex-1 flex-col md:min-h-[360px]">
        {noMatch ? (
          <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t(`${g}.noMatch`)}
          </div>
        ) : (
          <div className="min-h-0 flex-1">{flowBlock}</div>
        )}
      </div>
    </div>
  );
}

export function DifyStructureWorkflowGraph(props: DifyStructureWorkflowGraphProps) {
  return (
    <ReactFlowProvider>
      <DifyStructureWorkflowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
