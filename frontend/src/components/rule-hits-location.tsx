import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { FindingDetectionRuleResult } from '@/types/entities';
import { ruleHitConfigNodeDisplayLabel } from '@/lib/dify-rule-hit-dsl-node';
import type { DifyNodeInventoryItem } from '@/services/api/dify-config-audit';
import { cn } from '@/lib/utils';

export type RuleHitRow = FindingDetectionRuleResult;

export type ConfigNodeLabelContext = {
  /** Same YAML used to build `structureNodes` (task `configAudit.yaml`); offsets in hits refer to this string. */
  structureYaml: string;
  structureNodes: DifyNodeInventoryItem[];
};

/** 配置节点：可解析 DSL 库存时与 Structured explorer 节点标题一致，否则路径或行号。 */
export function configNodeLabelFromHit(h: RuleHitRow, ctx?: ConfigNodeLabelContext): string {
  if (ctx?.structureNodes?.length && ctx.structureYaml.trim()) {
    const explorer = ruleHitConfigNodeDisplayLabel(ctx.structureYaml, ctx.structureNodes, h);
    if (explorer) {
      return explorer;
    }
  }
  const lp = h.logicalPath?.trim();
  if (lp) {
    return lp;
  }
  const lr = lineRangeLabel(h);
  return lr !== '—' ? lr : '—';
}

export function lineRangeLabel(h: RuleHitRow): string {
  const a = h.startLine;
  const b = h.endLine;
  if (typeof a === 'number' && a > 0 && typeof b === 'number' && b > 0) {
    return a === b ? `L${a}` : `L${a}–L${b}`;
  }
  if (h.matchStart != null && h.matchStart < 0) {
    return '位置未映射到全文';
  }
  return '—';
}

function lineShouldHighlight(n: number, hits: RuleHitRow[]): boolean {
  return hits.some((h) => {
    if (h.matchStart != null && h.matchStart < 0) {
      return false;
    }
    const s = h.startLine;
    const e = h.endLine ?? h.startLine;
    return typeof s === 'number' && s > 0 && typeof e === 'number' && e > 0 && n >= s && n <= e;
  });
}

/** Read-only YAML / text with line numbers and optional hit-range highlights. */
export function YamlLineViewer(props: {
  fullText: string;
  hits: RuleHitRow[];
  className?: string;
  emptyMessage?: string;
  /** When set, scroll this 1-based line into view (overrides first hit line). */
  scrollToLine?: number;
}) {
  const {
    fullText,
    hits,
    className,
    emptyMessage = 'No configuration text in task metadata.',
    scrollToLine,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  const firstHighlightLine = hits
    .map((h) => (typeof h.startLine === 'number' && h.startLine > 0 ? h.startLine : null))
    .filter((n): n is number => n != null)
    .sort((x, y) => x - y)[0];

  const scrollTarget =
    typeof scrollToLine === 'number' && scrollToLine > 0 ? scrollToLine : firstHighlightLine;

  useEffect(() => {
    if (!fullText?.trim() || !scrollTarget || !scrollRef.current) {
      return;
    }
    const el = scrollRef.current.querySelector(`[data-line="${scrollTarget}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [fullText, scrollTarget, hits, scrollToLine]);

  const lines = fullText.trim().length ? fullText.split('\n') : [];

  if (!lines.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'h-full min-h-[200px] min-w-0 max-w-full overflow-auto rounded-md border bg-muted/20 font-mono text-[11px] leading-snug',
        className,
      )}
    >
      {lines.map((line, i) => {
        const n = i + 1;
        const highlight = lineShouldHighlight(n, hits);
        return (
          <div
            key={n}
            data-line={n}
            className={cn(
              'flex border-b border-border/40 last:border-0',
              highlight && 'bg-amber-200/40 dark:bg-amber-900/25',
            )}
          >
            <span className="w-10 shrink-0 select-none border-r border-border/50 bg-muted/40 py-0.5 pr-1 text-right text-muted-foreground tabular-nums">
              {n}
            </span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word py-0.5 pl-2">{line}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RuleHitsLocationPanel(props: {
  hits: RuleHitRow[];
  /** Full YAML / response text for read-only line view + scroll highlight */
  fullText?: string;
  /** When set with `structureYaml`, 配置节点 uses explorer-style titles (same as Config & findings). */
  structureNodes?: DifyNodeInventoryItem[];
  /** YAML that rule offsets / structure inventory refer to (usually task metadata DSL). */
  structureYaml?: string;
  title?: string;
  /** Deep-link to task config-review split view (same data as that page). */
  configReviewLink?: { taskId: string; vulnerabilityId: string };
  /** Click row / “节点详情” to show YAML slice for this hit only. */
  onHitDetail?: (hit: RuleHitRow) => void;
  /** Optional scroll target for embedded viewer (e.g. deep-linked line). */
  yamlScrollToLine?: number;
}) {
  const {
    hits,
    fullText,
    structureNodes,
    structureYaml,
    title = 'Rule hits (location)',
    configReviewLink,
    onHitDetail,
    yamlScrollToLine,
  } = props;

  const nodeLabelCtx: ConfigNodeLabelContext | undefined =
    structureNodes?.length && structureYaml?.trim()
      ? { structureYaml, structureNodes }
      : undefined;

  if (!hits.length) {
    return null;
  }

  const text = fullText?.trim() ?? '';

  return (
    <div className="min-w-0 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="min-w-0 space-y-2 text-sm">
        {hits.map((r, i) => (
          <li
            key={`${r.ruleId}-${i}`}
            className={cn(
              'min-w-0 space-y-1.5 rounded-md border bg-muted/30 p-2',
              onHitDetail && 'cursor-pointer hover:bg-muted/50',
            )}
            onClick={() => onHitDetail?.(r)}
            onKeyDown={(e) => {
              if (onHitDetail && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onHitDetail(r);
              }
            }}
            role={onHitDetail ? 'button' : undefined}
            tabIndex={onHitDetail ? 0 : undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.ruleName || r.ruleId}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{lineRangeLabel(r)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">配置节点</span>
              <span
                className="text-[10px] font-mono text-muted-foreground max-w-full min-w-0 flex-1 whitespace-pre-line break-words"
                title={configNodeLabelFromHit(r, nodeLabelCtx)}
              >
                {configNodeLabelFromHit(r, nodeLabelCtx)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {configReviewLink?.vulnerabilityId && (
                <Link
                  to="/tasks/config-review/$taskId"
                  params={{ taskId: configReviewLink.taskId }}
                  search={{
                    vuln: configReviewLink.vulnerabilityId,
                    line:
                      typeof r.startLine === 'number' && r.startLine > 0 ? r.startLine : undefined,
                    ruleId: r.ruleId,
                  }}
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  分屏定位
                </Link>
              )}
              {onHitDetail && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHitDetail(r);
                  }}
                >
                  节点详情（YAML）
                </button>
              )}
            </div>
            {r.evidence && <p className="text-xs text-muted-foreground wrap-break-word">{r.evidence}</p>}
            {r.contextSnippet && (
              <pre className="max-h-48 min-h-0 min-w-0 w-full max-w-full overflow-auto rounded border bg-background/80 p-2 text-[11px] whitespace-pre-wrap wrap-break-word">
                {r.contextSnippet}
              </pre>
            )}
          </li>
        ))}
      </ul>

      {text.length > 0 && (
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Source text (line numbers; highlighted range from rule hits)
          </p>
          <YamlLineViewer
            fullText={text}
            hits={hits}
            scrollToLine={yamlScrollToLine}
            className="max-h-[min(55vh,560px)] min-w-0 w-full max-w-full"
          />
        </div>
      )}
    </div>
  );
}
