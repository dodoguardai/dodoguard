import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpFromLine,
  Brain,
  CheckCircle2,
  ChevronDown,
  Cog,
  Eye,
  FileText,
  HardDrive,
  KeyRound,
  Link,
  Link2,
  Magnet,
  Search,
  ShieldAlert,
  Shuffle,
  Syringe,
  Target,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  CAPABILITY_AUDIT_DIMENSION_IDS,
  CAPABILITY_AUDIT_DIMENSION_COUNT,
  dimensionLabel,
  type CapabilityAuditDimensionId,
} from 'capability-audit/shared/dimensions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const ICON_MAP: Record<CapabilityAuditDimensionId, LucideIcon> = {
  command_injection: Syringe,
  prompt_injection: Brain,
  data_exfiltration: Upload,
  hardcoded_secrets: KeyRound,
  unauthorized_tool_call: Wrench,
  code_obfuscation: Shuffle,
  social_engineering: ShieldAlert,
  resource_abuse: HardDrive,
  supply_chain_attack: Link2,
  privilege_escalation: ArrowUpFromLine,
  malicious_guidance: Magnet,
  skill_md_inconsistency: FileText,
  code_quality: Search,
  bytecode_tampering: Cog,
  trigger_hijacking: Target,
  unicode_steganography: Eye,
  transitive_trust_abuse: Link,
};

type Severity = 'low' | 'medium' | 'high' | 'critical';

type DimensionGridProps = {
  isZh: boolean;
  counts: Map<CapabilityAuditDimensionId, number>;
  maxSeverityByDim: Map<CapabilityAuditDimensionId, Severity>;
  activeId?: CapabilityAuditDimensionId | null;
  onSelect?: (id: CapabilityAuditDimensionId) => void;
  showBanner?: boolean;
  totalFindings?: number;
};

function severityLabelZh(s: Severity): string {
  const m: Record<Severity, string> = {
    critical: '严重',
    high: '高危',
    medium: '中危',
    low: '低危',
  };
  return m[s];
}

export function DimensionRiskBanner({
  isZh,
  totalFindings,
  evidenceHitCount,
  ruleHitCount,
  topDimension,
  topSeverity,
}: {
  isZh: boolean;
  totalFindings: number;
  evidenceHitCount?: number;
  ruleHitCount?: number;
  topDimension?: CapabilityAuditDimensionId;
  topSeverity?: Severity;
}) {
  if (totalFindings === 0) {
    // DimensionGrid shows the all-clear summary; avoid duplicate banners.
    return null;
  }

  const topLabel = topDimension ? dimensionLabel(topDimension, isZh) : undefined;
  const sev = topSeverity ? (isZh ? severityLabelZh(topSeverity) : topSeverity) : undefined;
  const statsLine =
    evidenceHitCount !== undefined && ruleHitCount !== undefined
      ? isZh
        ? `${totalFindings} 类风险 · ${evidenceHitCount} 处证据 · ${ruleHitCount} 条规则`
        : `${totalFindings} risk type(s) · ${evidenceHitCount} evidence hit(s) · ${ruleHitCount} rule hit(s)`
      : isZh
        ? `${totalFindings} 项风险`
        : `${totalFindings} risk(s)`;

  return (
    <div className="rounded-md border border-amber-200/70 bg-amber-50/40 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20">
      {statsLine}
      {sev ? (isZh ? ` · ${sev}` : ` · ${sev}`) : ''}
      {topLabel ? (isZh ? ` · ${topLabel}` : ` · ${topLabel}`) : ''}
    </div>
  );
}

function DimensionTiles({
  isZh,
  counts,
  maxSeverityByDim,
  activeId,
  onSelect,
}: DimensionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {CAPABILITY_AUDIT_DIMENSION_IDS.map((id) => {
        const n = counts.get(id) ?? 0;
        const Icon = ICON_MAP[id];
        const active = activeId === id;
        const top = maxSeverityByDim.get(id);
        const hasRisk = n > 0;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            disabled={!onSelect}
            title={dimensionLabel(id, isZh)}
            className={
              active
                ? 'rounded-md border-2 border-neutral-900 bg-neutral-50 p-2 text-left dark:border-neutral-100 dark:bg-neutral-900'
                : hasRisk
                  ? 'rounded-md border border-red-300/80 bg-red-50/30 p-2 text-left transition-colors hover:border-red-400 dark:border-red-900/50 dark:bg-red-950/20'
                  : 'rounded-md border border-slate-200/80 bg-white/90 p-2 text-left transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50'
            }
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <Icon className="size-3.5 shrink-0 text-neutral-600 dark:text-neutral-400" />
              {hasRisk ? (
                <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                  {top ? (isZh ? severityLabelZh(top) : top.slice(0, 1).toUpperCase()) : '·'}
                </span>
              ) : (
                <CheckCircle2 className="size-3 shrink-0 text-emerald-500" aria-hidden />
              )}
            </div>
            <p className="line-clamp-2 text-[10px] font-medium leading-tight text-slate-800 dark:text-slate-200">
              {dimensionLabel(id, isZh)}
            </p>
            {hasRisk && (
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                {n}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DimensionGrid({
  isZh,
  counts,
  maxSeverityByDim,
  activeId,
  onSelect,
}: DimensionGridProps) {
  const anyRisk = CAPABILITY_AUDIT_DIMENSION_IDS.some((id) => (counts.get(id) ?? 0) > 0);

  if (!anyRisk) {
    return (
      <Collapsible className="space-y-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center justify-between gap-3 rounded-md border border-emerald-200/70 bg-emerald-50/40 px-4 py-3 text-left text-sm text-emerald-900 transition-colors hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100 dark:hover:bg-emerald-950/40"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                {isZh
                  ? `全部 ${CAPABILITY_AUDIT_DIMENSION_COUNT} 项安全检查均通过`
                  : `All ${CAPABILITY_AUDIT_DIMENSION_COUNT} security checks passed`}
              </span>
            </span>
            <span className="text-emerald-700/80 flex shrink-0 items-center gap-1 text-xs dark:text-emerald-300/80">
              {isZh ? '查看明细' : 'View details'}
              <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <DimensionTiles
            isZh={isZh}
            counts={counts}
            maxSeverityByDim={maxSeverityByDim}
            activeId={activeId}
            onSelect={onSelect}
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <DimensionTiles
      isZh={isZh}
      counts={counts}
      maxSeverityByDim={maxSeverityByDim}
      activeId={activeId}
      onSelect={onSelect}
    />
  );
}

export { CAPABILITY_AUDIT_DIMENSION_COUNT };
