/**
 * React Flow graph for Coze workflow normalized nodes (from coze-config-audit/structure).
 * Coze-specific layout and node rendering — API positions are not used (backend sends 0,0).
 */

import '@xyflow/react/dist/style.css';

import { type MouseEvent, memo, useCallback, useEffect, useMemo } from 'react';

import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { cn } from '@/lib/utils';
import type {
  NormalizedEdgeKind,
  NormalizedNode,
  NormalizedWorkflow,
} from '@/services/api/dify-config-audit';

const COZE_NODE_TYPE = 'cozeStructureNode' as const;

type CozeNodeData = {
  nodeType: string;
  title: string;
};

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

/**
 * Layered layout from graph topology only. Never uses `position` from the API — Coze
 * normalized nodes always carry {0,0}, and React Flow v12 default nodes overlap badly without
 * explicit custom nodes + computed positions.
 */
function layoutCozePositions(nodes: NormalizedNode[]): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const orderIndex = new Map(nodes.map((n, i) => [n.node_id, i]));

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

  const map = new Map<string, { x: number; y: number }>();
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  const COL_WIDTH = 280;
  const ROW_GAP = 132;

  let x = 0;
  for (const L of colKeys) {
    const ids = (cols.get(L) ?? []).slice();
    ids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    ids.forEach((id, i) => {
      map.set(id, { x, y: i * ROW_GAP });
    });
    x += COL_WIDTH;
  }
  return map;
}

const CozeStructureNode = memo(function CozeStructureNode({ data, selected }: NodeProps) {
  const d = data as CozeNodeData;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-border !bg-muted-foreground/40"
      />
      <div
        className={cn(
          'rounded-lg border bg-card px-3 py-2 text-left shadow-sm',
          'min-w-[168px] max-w-[240px]',
          selected ? 'border-primary ring-2 ring-primary/35' : 'border-border',
        )}
      >
        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {d.nodeType}
        </div>
        <div className="mt-1 text-[11px] font-medium leading-snug text-foreground break-words whitespace-pre-wrap">
          {d.title}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-border !bg-muted-foreground/40"
      />
    </>
  );
});

const cozeNodeTypes = { [COZE_NODE_TYPE]: CozeStructureNode };

function toCozeFlowNodes(
  nodes: NormalizedNode[],
  pos: Map<string, { x: number; y: number }>,
  selectedId: string | null,
): Node[] {
  return nodes.map((n) => {
    const p = pos.get(n.node_id) ?? { x: 0, y: 0 };
    const selected = selectedId === n.node_id;
    return {
      id: n.node_id,
      type: COZE_NODE_TYPE,
      position: p,
      data: {
        nodeType: n.node_type,
        title: n.title,
      } satisfies CozeNodeData,
      selected,
    };
  });
}

function toFlowEdges(edges: NormalizedWorkflow['edges']): Edge[] {
  return edges.map((e) => ({
    id: e.edge_id,
    source: e.source,
    target: e.target,
    label: e.edge_kind === 'normal' ? undefined : e.edge_kind,
    style: {
      stroke: strokeForEdgeKind(e.edge_kind),
      strokeWidth: e.edge_kind === 'normal' ? 1 : 2,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: strokeForEdgeKind(e.edge_kind) },
  }));
}

function FitViewOnLayout({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!layoutKey) {
      return;
    }
    const t = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 200, maxZoom: 1.2 });
    });
    return () => cancelAnimationFrame(t);
  }, [fitView, layoutKey]);
  return null;
}

export interface CozeStructureFlowGraphProps {
  normalized: NormalizedWorkflow | undefined;
  selectedNodeId: string | null;
  onSelectNodeId: (id: string | null) => void;
  className?: string;
}

function CozeStructureFlowGraphInner({
  normalized,
  selectedNodeId,
  onSelectNodeId,
  className,
}: CozeStructureFlowGraphProps) {
  const pos = useMemo(
    () => (normalized?.nodes?.length ? layoutCozePositions(normalized.nodes) : new Map()),
    [normalized],
  );

  const initialNodes = useMemo(
    () => toCozeFlowNodes(normalized?.nodes ?? [], pos, selectedNodeId),
    [normalized, pos, selectedNodeId],
  );
  const initialEdges = useMemo(() => toFlowEdges(normalized?.edges ?? []), [normalized]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(toCozeFlowNodes(normalized?.nodes ?? [], pos, selectedNodeId));
  }, [normalized, pos, selectedNodeId, setNodes]);

  useEffect(() => {
    setEdges(toFlowEdges(normalized?.edges ?? []));
  }, [normalized, setEdges]);

  const onNodeClick = useCallback(
    (_: MouseEvent, node: Node) => {
      onSelectNodeId(node.id);
    },
    [onSelectNodeId],
  );

  const onPaneClick = useCallback(() => {
    onSelectNodeId(null);
  }, [onSelectNodeId]);

  if (!normalized?.nodes?.length) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No Coze workflow nodes to display.
      </p>
    );
  }

  const fitLayoutKey = useMemo(() => {
    const n = normalized.nodes;
    const ids = n.map((x) => x.node_id).join('\0');
    const ec = normalized.edges?.length ?? 0;
    return `${ids}|${ec}`;
  }, [normalized.nodes, normalized.edges?.length]);

  return (
    <div className={cn('h-[min(520px,55vh)] w-full min-h-[360px] rounded-md border', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={cozeNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elevateNodesOnSelect
      >
        <FitViewOnLayout layoutKey={fitLayoutKey} />
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-muted" />
      </ReactFlow>
    </div>
  );
}

export function CozeStructureFlowGraph(props: CozeStructureFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <CozeStructureFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
